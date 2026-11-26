package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSubmitCannotRepeatWhenCreateResponseIsLost(t *testing.T) {
	dir := t.TempDir()
	calls := 0
	create := func() ([]byte, error) {
		calls++
		return nil, errors.New("response lost")
	}
	if err := submitOnce(dir, intent{Plan: "reviewed"}, create); err == nil {
		t.Fatal("lost response must require status")
	}
	if _, err := os.Stat(filepath.Join(dir, "intent.json")); err != nil {
		t.Fatal("intent must survive the lost response")
	}
	if err := submitOnce(dir, intent{Plan: "reviewed"}, create); err == nil || calls != 1 {
		t.Fatalf("second submission must be refused, calls=%d, err=%v", calls, err)
	}
}

func TestApprovedDigestCoversEveryPlanByte(t *testing.T) {
	reviewed := []byte(`{"name":"approved"}`)
	approved := fingerprint(reviewed)
	if err := requireApproval(reviewed, approved); err != nil {
		t.Fatal(err)
	}
	if err := requireApproval([]byte(`{"name":"other"}`), approved); err == nil {
		t.Fatal("changed plan must be refused")
	}
	if err := requireApproval(reviewed, strings.Repeat("0", 64)); err == nil {
		t.Fatal("missing reviewed digest must be refused")
	}
}

func TestProviderGrantMustNameTheApprovedIncarnation(t *testing.T) {
	dir := t.TempDir()
	p := preview{Request: request{Consumer: "qual-demo", Incarnation: "approved"}, OperationDigest: "exact-operation"}
	stale := providerReceipt{
		Name: "qual-demo-local", Context: "kind-qual-demo-local",
		Incarnation: "replaced", OperationDigest: "exact-operation", Outcome: "configured",
	}
	if err := saveJSON(dir, "stale.json", stale); err != nil {
		t.Fatal(err)
	}
	if err := p.verifyGrant(filepath.Join(dir, "stale.json")); err == nil {
		t.Fatal("stale grant accepted")
	}
	stale.Incarnation = "approved"
	if err := saveJSON(dir, "approved.json", stale); err != nil {
		t.Fatal(err)
	}
	if err := p.verifyGrant(filepath.Join(dir, "approved.json")); err != nil {
		t.Fatal(err)
	}
}
