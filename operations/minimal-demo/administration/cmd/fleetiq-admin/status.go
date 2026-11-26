package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const attemptLabel = "k8s-infrastructure.io/demo-attempt"

type podInfo struct {
	Metadata metadata
	Status   struct {
		ContainerStatuses []struct {
			Name  string
			State struct {
				Terminated *struct{ StartedAt string }
			}
		}
	}
}

func (p preview) status(repo, dir, plan string) error {
	raw, err := snap(dir, "intent.json")
	if os.IsNotExist(err) {
		fmt.Println("Prepared. Review the grant and submit the approved preview.")
		return nil
	}
	if err != nil {
		return err
	}
	started, err := readJSON[intent](raw)
	if err != nil || started.Plan != plan {
		return errors.New("stored intent does not match this preview")
	}
	if err := p.observeTarget(); err != nil {
		return err
	}
	r := p.Request
	get := func() ([]byte, error) {
		return r.kube(false, nil, "-n", r.namespace(), "get", "job/"+r.Job, "--ignore-not-found", "-o", "json")
	}
	job, err := get()
	if err != nil {
		return err
	}
	if len(bytes.TrimSpace(job)) == 0 {
		return errors.New("uncertain: the approved Job is not visible; preserve intent and escalate")
	}
	var observed jobInfo
	if json.Unmarshal(job, &observed) != nil || !p.matchesJob(observed) {
		return errors.New("uncertain: observed Job differs from the exact reviewed attempt")
	}
	expectedUID := ""
	submission, err := snap(dir, "submission.json")
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if err == nil {
		var submitted jobInfo
		if json.Unmarshal(submission, &submitted) != nil || !p.matchesJob(submitted) ||
			submitted.Metadata.UID != observed.Metadata.UID {
			return errors.New("uncertain: submission and observed Job UID disagree")
		}
		expectedUID = submitted.Metadata.UID
	}
	terminal := false
	for _, condition := range observed.Status.Conditions {
		if condition.Status == "True" && (condition.Type == "Complete" || condition.Type == "Failed") {
			terminal = true
			break
		}
	}
	if !terminal {
		fmt.Println("Pending. Run status again to observe this Job.")
		return nil
	}

	pods, err := r.kube(false, nil, "-n", r.namespace(), "get", "pods",
		"-l", "batch.kubernetes.io/controller-uid="+observed.Metadata.UID, "-o", "json")
	if err != nil {
		return err
	}
	var list struct{ Items []podInfo }
	if json.Unmarshal(pods, &list) != nil {
		return errors.New("invalid Pod observation")
	}
	log, logPod := []byte{}, []byte("{}")
	if len(list.Items) == 1 {
		pod := list.Items[0]
		owned := len(pod.Metadata.OwnerReferences) == 1 &&
			pod.Metadata.OwnerReferences[0].Controller &&
			pod.Metadata.OwnerReferences[0].Kind == "Job" &&
			pod.Metadata.OwnerReferences[0].UID == observed.Metadata.UID &&
			pod.Metadata.OwnerReferences[0].Name == r.Job &&
			pod.Metadata.Namespace == r.namespace() && pod.Metadata.Labels[attemptLabel] == p.Launcher
		if owned && len(pod.Status.ContainerStatuses) == 1 {
			container := pod.Status.ContainerStatuses[0]
			if terminal := container.State.Terminated; terminal != nil {
				if _, err := time.Parse(time.RFC3339Nano, terminal.StartedAt); err == nil {
					log, err = r.kube(false, nil, "-n", r.namespace(), "logs", "pod/"+pod.Metadata.Name,
						"-c", container.Name, "--since-time", terminal.StartedAt, "--timestamps", "--limit-bytes=4096")
					if err == nil {
						logPod, err = r.kube(false, nil, "-n", r.namespace(), "get", "pod/"+pod.Metadata.Name, "-o", "json")
					}
					if err != nil {
						log, logPod = []byte{}, []byte("{}")
					}
				}
			}
		}
	}
	out, err := os.MkdirTemp(dir, "observed-")
	if err != nil {
		return err
	}
	for name, content := range map[string][]byte{
		"provider-job.json": p.Job, "job.json": job, "pods.json": pods,
		"log-pod.json": logPod, "container.log": log, "before.json": started.Before,
	} {
		if err := store(out, name, content); err != nil {
			return err
		}
	}
	file := func(name string) string { return filepath.Join(out, name) }
	receipt, err := local(repo, "jq", "-n",
		"--slurpfile", "rendered", file("provider-job.json"), "--slurpfile", "job", file("job.json"),
		"--slurpfile", "pods", file("pods.json"), "--slurpfile", "logPod", file("log-pod.json"),
		"--rawfile", "log", file("container.log"), "--arg", "target", r.target(),
		"--arg", "incarnation", r.Incarnation, "--arg", "namespace", r.namespace(), "--arg", "name", r.Job,
		"--arg", "launcher", p.Launcher, "--arg", "jobUID", expectedUID, "--arg", "mode", r.Operation,
		"--arg", "deployment", r.DeploymentRevision, "--arg", "backend", p.Backend,
		"--arg", "operationDigest", p.OperationDigest, "--arg", "imageID", r.RuntimeImageID,
		"--arg", "intentAt", started.Timestamp, "-f", filepath.Join(repo, admin, "job-receipt.jq"))
	if err != nil || !json.Valid(receipt) {
		return errors.New("could not record execution receipt; retain the Job")
	}
	if err := store(out, "execution-receipt.json", receipt); err != nil {
		return err
	}
	after, err := p.readDatabase(repo)
	if err != nil {
		return fmt.Errorf("durable result uncertain; execution receipt retained in %s", out)
	}
	if err := store(out, "after.json", after); err != nil {
		return err
	}
	fmt.Printf("Review execution and durable observations in %s before withdrawal or any new attempt.\n", out)
	return nil
}

func (p preview) matchesJob(job jobInfo) bool {
	r := p.Request
	return job.Metadata.Name == r.Job && job.Metadata.Namespace == r.namespace() &&
		job.Metadata.UID != "" && job.Metadata.DeletionTimestamp == nil &&
		job.Metadata.Labels[attemptLabel] == p.Launcher
}
