// fleetiq-admin coordinates the provider's exact, single-use Job grant and the
// independent PostgreSQL and Kubernetes observations for an approved attempt.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"
)

const admin = "operations/minimal-demo/administration"

var (
	digestPattern   = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	revisionPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
	targetPattern   = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)
	jobPattern      = regexp.MustCompile(`^[a-z][a-z0-9-]{0,48}[a-z0-9]$`)
	servicePattern  = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
)

type request struct {
	Operation, Job, Consumer                             string
	DeploymentRevision, ProviderRevision, Incarnation    string
	ProviderCheckout, DockerContext, StateRoot           string
	HTTPSPort                                            int
	SelectionDigest, RuntimeImageID                      string
	Server, NamespaceUID, ClusterUID                     string
	ObserverKubeconfig, LauncherKubeconfig, ObserverUser string
	PGServiceFile, PGPassFile, PGService                 string
	DatabaseOID                                          uint32
	Inputs                                               map[string]string
	Scope                                                json.RawMessage
}

type preview struct {
	Request                                                      request
	Backend, OperationDigest, Launcher, SQLDigest, ReceiptDigest string
	Operation, Job, Input, Scope                                 json.RawMessage
	Routes                                                       string
}

type providerReceipt struct {
	Name, Context, Incarnation, Execution, Outcome, OperationDigest string
	Operation                                                       struct{ Name, Namespace, Digest, Launcher string }
}

type intent struct {
	Plan, Timestamp string
	Before          json.RawMessage
}

type jobInfo struct {
	Metadata metadata
	Status   struct {
		Conditions []struct{ Type, Status string }
	}
}

type metadata struct {
	Name, Namespace, UID string
	Labels               map[string]string
	DeletionTimestamp    *string
	OwnerReferences      []struct {
		Kind, Name, UID string
		Controller      bool
	}
}

func fingerprint(data []byte) string {
	return fmt.Sprintf("sha256:%x", sha256.Sum256(data))
}

func requireApproval(data []byte, approved string) error {
	if !digestPattern.MatchString(approved) || fingerprint(data) != approved {
		return errors.New("approved plan digest required; review the preview")
	}
	return nil
}

func readJSON[T any](data []byte) (T, error) {
	var value T
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return value, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return value, errors.New("trailing JSON data")
	}
	return value, nil
}

func store(dir, name string, data []byte) error {
	file, err := os.OpenFile(filepath.Join(dir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	_, writeErr := file.Write(data)
	err = errors.Join(writeErr, file.Sync(), file.Close())
	if err != nil {
		return err
	}
	parent, err := os.Open(dir)
	if err != nil {
		return err
	}
	return errors.Join(parent.Sync(), parent.Close())
}

func saveJSON(dir, name string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return store(dir, name, append(data, '\n'))
}

func snap(dir, name string) ([]byte, error) {
	path := filepath.Join(dir, name)
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > 2<<20 {
		return nil, errors.New("attempt file must be private, bounded and regular")
	}
	return os.ReadFile(path)
}

func command(dir string, input []byte, env []string, timeout time.Duration, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir, cmd.Stdin = dir, bytes.NewReader(input)
	if env != nil {
		cmd.Env = env
	}
	data, err := cmd.Output()
	if err != nil {
		return data, fmt.Errorf("%s failed or timed out", filepath.Base(name))
	}
	return data, nil
}

func local(dir, name string, args ...string) ([]byte, error) {
	return command(dir, nil, nil, 30*time.Second, name, args...)
}

func (r request) target() string    { return r.Consumer + "-local" }
func (r request) namespace() string { return r.Consumer + "-data" }

func (r request) validate() error {
	server, err := url.Parse(r.Server)
	if err != nil || server.Scheme != "https" || server.Hostname() == "" || server.User != nil ||
		server.Path != "" || server.RawQuery != "" || server.Fragment != "" {
		return errors.New("expected the reviewed HTTPS API endpoint")
	}
	if !targetPattern.MatchString(r.Consumer) || len(r.namespace()) > 37 || !jobPattern.MatchString(r.Job) ||
		!revisionPattern.MatchString(r.DeploymentRevision) || !revisionPattern.MatchString(r.ProviderRevision) ||
		!digestPattern.MatchString(r.SelectionDigest) || !digestPattern.MatchString(r.RuntimeImageID) ||
		r.NamespaceUID == "" || r.ClusterUID == "" || r.Incarnation == "" || r.ObserverUser == "" ||
		r.DatabaseOID == 0 || !servicePattern.MatchString(r.PGService) || r.HTTPSPort <= 0 || r.HTTPSPort > 65535 {
		return errors.New("incomplete reviewed request identities")
	}
	for _, path := range []string{r.ProviderCheckout, r.StateRoot, r.ObserverKubeconfig,
		r.LauncherKubeconfig, r.PGServiceFile, r.PGPassFile} {
		if !filepath.IsAbs(path) {
			return errors.New("request paths must be absolute")
		}
	}
	switch r.Operation {
	case "bootstrap", "rebuild", "register", "calculate", "reclaim", "summarize", "expire":
		return nil
	default:
		return errors.New("unsupported administrative Job; use the database workflow for migration")
	}
}

func revision(dir, expected string, paths ...string) error {
	data, err := local(dir, "git", "rev-parse", "HEAD")
	if err != nil || strings.TrimSpace(string(data)) != expected {
		return errors.New("reviewed checkout revision differs")
	}
	args := append([]string{"status", "--porcelain", "--"}, paths...)
	dirty, err := local(dir, "git", args...)
	if err != nil || len(dirty) != 0 {
		return errors.New("reviewed inputs have local changes")
	}
	return nil
}

func (r request) provider(action, operation string, execute bool) ([]byte, error) {
	args := []string{"run", "--locked", "--offline", "python", "-m", "scripts.minimal_delegation",
		action, "--consumer", r.Consumer, "--docker-context", r.DockerContext,
		"--state-root", r.StateRoot, "--https-port", strconv.Itoa(r.HTTPSPort), "--operation", operation}
	if execute {
		args = append(args, "--execute", "--confirm-target", r.target())
	}
	return command(r.ProviderCheckout, nil, nil, 250*time.Second, "uv", args...)
}

func splitRender(data []byte) (operation, input json.RawMessage, scope []byte, err error) {
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	for {
		var manifest map[string]any
		err = decoder.Decode(&manifest)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, nil, errors.New("invalid Helm operation render")
		}
		fields, _ := manifest["data"].(map[string]any)
		if value, _ := fields["operation.json"].(string); value != "" {
			if operation != nil || !json.Valid([]byte(value)) {
				return nil, nil, nil, errors.New("invalid provider operation")
			}
			operation = json.RawMessage(value)
		}
		if value, _ := fields["input.json"].(string); value != "" {
			if input != nil || !json.Valid([]byte(value)) || manifest["immutable"] != true {
				return nil, nil, nil, errors.New("invalid calculator input")
			}
			scope = []byte(value)
			input, err = json.Marshal(manifest)
			if err != nil {
				return nil, nil, nil, err
			}
		}
	}
	if operation == nil {
		return nil, nil, nil, errors.New("missing provider operation")
	}
	return operation, input, scope, nil
}

func prepare(repo, dir string, r request) (string, error) {
	if err := r.validate(); err != nil {
		return "", err
	}
	chart := "charts/fleetiq-minimal-demo-operations"
	pin := "environments/minimal-demo/backend.json"
	if err := revision(repo, r.DeploymentRevision, chart, pin, admin); err != nil {
		return "", err
	}
	if err := revision(r.ProviderCheckout, r.ProviderRevision, "scripts", "pyproject.toml", "uv.lock"); err != nil {
		return "", err
	}
	data, err := os.ReadFile(filepath.Join(repo, pin))
	if err != nil || fingerprint(data) != r.SelectionDigest {
		return "", errors.New("backend selection differs from the review")
	}
	var backend struct{ Backend struct{ Reference string } }
	if json.Unmarshal(data, &backend) != nil || backend.Backend.Reference == "" {
		return "", errors.New("invalid backend selection")
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return "", errors.New("preview requires a fresh attempt directory")
	}
	helm := filepath.Join(repo, "target/tools/manifests/helm")
	values := map[string]any{"operation": r.Operation, "backendDigest": r.SelectionDigest}
	if len(r.Inputs) != 0 {
		values["inputs"] = r.Inputs
	}
	settings, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	render, err := command(repo, settings, nil, 30*time.Second, helm, "template", r.Job, chart,
		"--namespace", r.namespace(), "--kube-version", "1.35.0", "-f", "-", "--set-file", "backend="+pin)
	if err != nil {
		return "", err
	}
	operation, input, scope, err := splitRender(render)
	if err != nil {
		return "", err
	}
	if scope == nil {
		var fields map[string]json.RawMessage
		if json.Unmarshal(r.Scope, &fields) != nil || fields == nil {
			return "", errors.New("operation requires an observation scope object")
		}
		for key, want := range r.Inputs {
			var value string
			if json.Unmarshal(fields[key], &value) != nil {
				value = string(fields[key])
			}
			if value != want {
				return "", errors.New("observation scope differs from operation inputs")
			}
		}
		scope = r.Scope
	}
	if err := store(dir, "operation.json", operation); err != nil {
		return "", err
	}
	opPath := filepath.Join(dir, "operation.json")
	result, err := r.provider("configure", opPath, false)
	var delegation providerReceipt
	if err != nil || json.Unmarshal(result, &delegation) != nil ||
		delegation.Name != r.target() || delegation.Execution != "not-performed" ||
		delegation.Operation.Name != r.Job || delegation.Operation.Namespace != r.namespace() ||
		!digestPattern.MatchString(delegation.Operation.Digest) ||
		delegation.Operation.Launcher != "demo-launch-"+delegation.Operation.Digest[7:31] {
		return "", errors.New("provider preview does not match the request")
	}
	job, err := r.provider("job", opPath, false)
	var selected jobInfo
	if err != nil || json.Unmarshal(job, &selected) != nil || selected.Metadata.Name != r.Job ||
		selected.Metadata.Namespace != r.namespace() ||
		selected.Metadata.Labels["k8s-infrastructure.io/demo-attempt"] != delegation.Operation.Launcher {
		return "", errors.New("provider Job does not match the reviewed attempt")
	}
	route := "administrative-route"
	if r.Operation == "bootstrap" || r.Operation == "reclaim" {
		route = r.Operation + "-route"
	}
	routes, err := local(repo, helm, "template", "fleetiq", chart, "--namespace", r.namespace(),
		"--kube-version", "1.35.0", "--set", "operation="+route,
		"--set-string", "attempt="+delegation.Operation.Launcher)
	if err != nil {
		return "", err
	}
	sql, filter, err := observers(repo)
	if err != nil {
		return "", err
	}
	plan := preview{r, backend.Backend.Reference, delegation.Operation.Digest,
		delegation.Operation.Launcher, fingerprint(sql), fingerprint(filter), operation, job, input, scope, string(routes)}
	if err := store(dir, "routes.yaml", routes); err != nil {
		return "", err
	}
	if input != nil {
		if err := store(dir, "input-configmap.json", input); err != nil {
			return "", err
		}
	}
	if err := saveJSON(dir, "plan.json", plan); err != nil {
		return "", err
	}
	stored, err := snap(dir, "plan.json")
	return fingerprint(stored), err
}

func observers(repo string) ([]byte, []byte, error) {
	sql, err := os.ReadFile(filepath.Join(repo, admin, "observe.sql"))
	filter, next := os.ReadFile(filepath.Join(repo, admin, "job-receipt.jq"))
	return sql, filter, errors.Join(err, next)
}

func load(repo, dir string) (preview, []byte, error) {
	raw, err := snap(dir, "plan.json")
	if err != nil {
		return preview{}, nil, err
	}
	p, err := readJSON[preview](raw)
	if err != nil {
		return p, nil, err
	}
	if err := p.Request.validate(); err != nil {
		return p, nil, err
	}
	sql, filter, err := observers(repo)
	if err != nil || fingerprint(sql) != p.SQLDigest || fingerprint(filter) != p.ReceiptDigest {
		return p, nil, errors.New("observer implementations differ from the preview")
	}
	return p, raw, nil
}

func (p preview) grant(dir, approved string) error {
	r := p.Request
	if _, err := os.Lstat(filepath.Join(dir, "grant.json")); !os.IsNotExist(err) {
		return errors.New("attempt already has a grant receipt; use submit or status")
	}
	if err := revision(r.ProviderCheckout, r.ProviderRevision, "scripts", "pyproject.toml", "uv.lock"); err != nil {
		return err
	}
	op := filepath.Join(dir, "operation.json")
	raw, err := snap(dir, "operation.json")
	var actual, reviewed bytes.Buffer
	if err != nil || json.Compact(&actual, raw) != nil || json.Compact(&reviewed, p.Operation) != nil ||
		!bytes.Equal(actual.Bytes(), reviewed.Bytes()) {
		return errors.New("provider operation changed after review")
	}
	for _, step := range []struct{ action, outcome string }{{"configure", "configured"}, {"health", "observed"}} {
		data, err := r.provider(step.action, op, true)
		var live providerReceipt
		if err != nil || json.Unmarshal(data, &live) != nil || live.Outcome != step.outcome ||
			live.Name != r.target() || live.Context != "kind-"+r.target() ||
			live.Incarnation != r.Incarnation || live.OperationDigest != p.OperationDigest {
			return fmt.Errorf("provider %s did not prove the reviewed grant", step.action)
		}
	}
	return saveJSON(dir, "grant.json", map[string]string{"plan": approved, "operation": p.OperationDigest})
}

func (r request) kube(launcher bool, input []byte, args ...string) ([]byte, error) {
	path := r.ObserverKubeconfig
	if launcher {
		path = r.LauncherKubeconfig
	}
	base := []string{"--kubeconfig", path, "--context", "kind-" + r.target(), "--request-timeout=10s"}
	return command("", input, nil, 15*time.Second, "kubectl", append(base, args...)...)
}

func (r request) bind(launcher bool, name string) error {
	data, err := r.kube(launcher, nil, "config", "view", "--minify", "-o", "json")
	var cfg struct {
		Clusters []struct {
			Cluster struct {
				Server   string
				Insecure bool   `json:"insecure-skip-tls-verify"`
				Proxy    string `json:"proxy-url"`
			}
		}
	}
	if err != nil || json.Unmarshal(data, &cfg) != nil || len(cfg.Clusters) != 1 ||
		cfg.Clusters[0].Cluster.Server != r.Server || cfg.Clusters[0].Cluster.Insecure ||
		cfg.Clusters[0].Cluster.Proxy != "" {
		return errors.New("kubeconfig does not verify the approved API endpoint")
	}
	data, err = r.kube(launcher, nil, "auth", "whoami", "-o", "json")
	var actor struct {
		Status struct{ UserInfo struct{ Username string } }
	}
	if err != nil || json.Unmarshal(data, &actor) != nil || actor.Status.UserInfo.Username != name {
		return errors.New("Kubernetes principal differs from the review")
	}
	return nil
}

func (p preview) checkObserverAccess() error {
	r := p.Request
	for _, check := range []struct {
		verb, resource, subresource, answer string
	}{
		{"get", "jobs.batch/" + r.Job, "", "yes"},
		{"list", "pods", "", "yes"},
		{"get", "pods", "", "yes"},
		{"get", "pods", "log", "yes"},
		{"create", "jobs.batch", "", "no"},
		{"create", "pods", "exec", "no"},
		{"delete", "jobs.batch/" + r.Job, "", "no"},
		{"delete", "pods", "", "no"},
	} {
		args := []string{"-n", r.namespace(), "auth", "can-i", check.verb, check.resource}
		if check.subresource != "" {
			args = append(args, "--subresource", check.subresource)
		}
		data, err := r.kube(false, nil, args...)
		if strings.TrimSpace(string(data)) != check.answer || (check.answer == "yes" && err != nil) {
			return errors.New("observer scope differs from the required read authority")
		}
	}
	return nil
}

func (p preview) checkInput() error {
	if p.Input == nil || string(p.Input) == "null" {
		return nil
	}
	r := p.Request
	type config struct {
		Metadata  metadata
		Data      map[string]string
		Immutable bool
	}
	var planned, live config
	if json.Unmarshal(p.Input, &planned) != nil || planned.Metadata.Name == "" ||
		planned.Metadata.Namespace != r.namespace() {
		return errors.New("invalid approved ConfigMap")
	}
	data, err := r.kube(false, nil, "-n", r.namespace(), "get", "configmap/"+planned.Metadata.Name, "-o", "json")
	if err != nil || json.Unmarshal(data, &live) != nil || !live.Immutable || live.Metadata.UID == "" ||
		live.Metadata.Namespace != r.namespace() || live.Metadata.Name != planned.Metadata.Name ||
		live.Metadata.DeletionTimestamp != nil || len(live.Data) != 1 ||
		live.Data["input.json"] != planned.Data["input.json"] {
		return errors.New("live immutable ConfigMap differs from the reviewed operation")
	}
	return nil
}

func (p preview) observeTarget() error {
	r := p.Request
	if err := r.bind(false, r.ObserverUser); err != nil {
		return err
	}
	for _, check := range []struct{ name, uid string }{
		{"namespace/" + r.namespace(), r.NamespaceUID},
		{"cluster.postgresql.cnpg.io/fleetiq-db", r.ClusterUID},
	} {
		data, err := r.kube(false, nil, "-n", r.namespace(), "get", check.name, "-o", "json")
		var result struct{ Metadata metadata }
		if err != nil || json.Unmarshal(data, &result) != nil || result.Metadata.UID != check.uid ||
			result.Metadata.DeletionTimestamp != nil {
			return errors.New("live target identity differs")
		}
		if check.name == "namespace/"+r.namespace() &&
			result.Metadata.Labels["k8s-infrastructure.io/consumer"] != r.Consumer {
			return errors.New("live namespace is not owned by the approved consumer")
		}
	}
	return nil
}

func (p preview) readDatabase(repo string) ([]byte, error) {
	r := p.Request
	env := append(os.Environ(), "PGSERVICEFILE="+r.PGServiceFile, "PGPASSFILE="+r.PGPassFile,
		"FLEETIQ_OBSERVATION_SCOPE="+string(p.Scope))
	data, err := command(repo, nil, env, 30*time.Second, "psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1",
		"--dbname", "service="+r.PGService+" sslmode=verify-full connect_timeout=5",
		"-v", "operation="+r.Operation, "-v", "database_oid="+strconv.FormatUint(uint64(r.DatabaseOID), 10),
		"-c", `\getenv scope FLEETIQ_OBSERVATION_SCOPE`, "-f", filepath.Join(repo, admin, "observe.sql"))
	if err != nil || !json.Valid(data) || !bytes.HasPrefix(bytes.TrimSpace(data), []byte("{")) {
		return nil, errors.New("independent PostgreSQL observation failed")
	}
	return data, nil
}

func submitOnce(dir string, decision intent, create func() ([]byte, error)) error {
	if err := saveJSON(dir, "intent.json", decision); err != nil {
		return errors.New("intent already present or not durably written; use status")
	}
	data, err := create()
	if err != nil || !json.Valid(data) {
		return errors.New("submission outcome uncertain; use status")
	}
	return store(dir, "submission.json", data)
}

func (p preview) submit(repo, dir, approved string) error {
	r := p.Request
	if _, err := os.Lstat(filepath.Join(dir, "intent.json")); !os.IsNotExist(err) {
		return errors.New("attempt already started; use status")
	}
	data, err := snap(dir, "grant.json")
	var grant map[string]string
	if err != nil || json.Unmarshal(data, &grant) != nil || grant["plan"] != approved || grant["operation"] != p.OperationDigest {
		return errors.New("reviewed provider grant receipt required")
	}
	account := "system:serviceaccount:" + r.Consumer + "-demo-operations:" + p.Launcher
	if account == r.ObserverUser {
		return errors.New("launcher and observer must be independent")
	}
	if err := p.observeTarget(); err != nil {
		return err
	}
	if err := p.checkObserverAccess(); err != nil {
		return err
	}
	if err := r.bind(true, account); err != nil {
		return err
	}
	if err := p.checkInput(); err != nil {
		return err
	}
	existing, err := r.kube(false, nil, "-n", r.namespace(), "get", "job/"+r.Job, "--ignore-not-found", "-o", "name")
	if err != nil || len(bytes.TrimSpace(existing)) != 0 {
		return errors.New("cannot establish that the exact reviewed name is unused")
	}
	if _, err := r.kube(true, p.Job, "-n", r.namespace(), "create", "--dry-run=server", "-f", "-", "-o", "json"); err != nil {
		return errors.New("provider admission refused the approved Job")
	}
	baseline, err := p.readDatabase(repo)
	if err != nil {
		return err
	}
	return submitOnce(dir, intent{approved, time.Now().UTC().Format(time.RFC3339), baseline}, func() ([]byte, error) {
		data, err := r.kube(true, p.Job, "-n", r.namespace(), "create", "-f", "-", "-o", "json")
		var submitted jobInfo
		if err != nil || json.Unmarshal(data, &submitted) != nil || !p.matchesJob(submitted) {
			return nil, errors.New("submission did not return the approved Job identity")
		}
		return json.Marshal(submitted)
	})
}

func main() {
	if err := cli(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func cli(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: fleetiq-admin preview|grant|submit|status --attempt /private/path")
	}
	set := flag.NewFlagSet(args[0], flag.ContinueOnError)
	repo := set.String("repo", ".", "reviewed deployment checkout")
	dir := set.String("attempt", "", "private attempt directory")
	req := set.String("request", "", "reviewed request JSON for preview")
	digest := set.String("approved", "", "reviewed plan digest for grant or submit")
	if err := set.Parse(args[1:]); err != nil {
		return err
	}
	if set.NArg() != 0 || !filepath.IsAbs(*dir) {
		return errors.New("an absolute --attempt path is required")
	}
	root, err := filepath.Abs(*repo)
	if err != nil {
		return err
	}
	if args[0] == "preview" {
		data, err := os.ReadFile(*req)
		if err != nil {
			return err
		}
		r, err := readJSON[request](data)
		if err != nil {
			return err
		}
		fingerprint, err := prepare(root, *dir, r)
		if err == nil {
			fmt.Printf("Preview saved in %s\nApprove %s\n", *dir, fingerprint)
		}
		return err
	}
	info, err := os.Lstat(*dir)
	if err != nil || !info.IsDir() || info.Mode().Perm()&0077 != 0 {
		return errors.New("expected a private attempt directory")
	}
	p, raw, err := load(root, *dir)
	if err != nil {
		return err
	}
	switch args[0] {
	case "grant", "submit":
		if err := requireApproval(raw, *digest); err != nil {
			return err
		}
		if args[0] == "grant" {
			return p.grant(*dir, *digest)
		}
		if err := p.submit(root, *dir, *digest); err != nil {
			return err
		}
		fmt.Println("Submitted once. Use status to inspect the Job and its durable result.")
		return nil
	case "status":
		return p.status(root, *dir, fingerprint(raw))
	default:
		return errors.New("unknown command")
	}
}
