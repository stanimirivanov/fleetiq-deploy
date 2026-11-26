# Minimal-demo administrative Jobs

## TL;DR

Use one native path from an approved provider grant. The launcher submits the
provider-rendered Job with `kubectl create`. A separate observer recovers the
same name and UID and checks the database result. Keep the Job and private
evidence until the attempt is reconciled. Migration uses the
[existing fenced database Workflow](minimal-demo-data.md#migration-and-grants).

## Prepare the handoff

Use a prepared provider-owned target and a reviewed immutable backend. The
deployment preparer renders the [operation chart](../../charts/fleetiq-minimal-demo-operations)
with the approved backend selection and its byte digest. The chart produces
an offline carrier with `operation.json` for the provider and
`approved-inputs.json` for the independent database observation. Stage only
the separate immutable input ConfigMap when present. Verify its live UID
and exact input bytes before granting launch authority.
[Database and publication prerequisites](minimal-demo-data.md#prerequisites-and-identities)

For the example attempt, `job-values.yaml` supplies `operation`, any
`inputs`, and the reviewed `backendDigest`. Render for the provider's exact
namespace with the pinned Helm toolchain.

```text
target/tools/manifests/helm template qual-demo-rebuild charts/fleetiq-minimal-demo-operations --namespace qual-demo-data --kube-version 1.35.0 -f /private/job-values.yaml --set-file backend=environments/minimal-demo/backend.json
```

Review the provider's offline `configure` preview and `job` render. The
provider owner checks the live target, enables the exact grant, and captures
a fresh `health` observation. Prepare the reviewed route and verify its
isolation. Fence the simulator and archive worker and observe their
termination. For bootstrap, verify the full writer fence. The credential
owner stages the exact login and URL Secret, and the data observer uses a
separate read-only login with `pg_control_system()` access and verified TLS.
The six routine command grants still need qualification with the exact
backend and SQL revision. Reclaim also needs a naturally aged verified
archive and trusted private storage.
[Provider delegation and health](https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#configure-and-inspect) ·
[Runtime grant boundary](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/postgres-runtime-grants.md)

Give the operator one private attempt directory with the exact
`provider-job.json`, its approved digest, the provider grant and health
receipts, the backend and scope, and two named access paths. The short-lived
launcher kubeconfig can create the exact Job. The observer can read target
identity, the named Job and its Pods and logs. Verify that it cannot create
or delete Jobs or exec into Pods. The Job runtime has no Kubernetes API
token. Keep credential files separate from evidence.

Before submission, record the reviewed deployment and provider revisions,
API endpoint, cluster incarnation (`kube-system` UID), namespace and CNPG
UIDs, PostgreSQL system identifier and database OID, operation digest,
input references and byte digests, the staged runtime image ID and the
independently observed `before.json`. Record `submission-intent.json`
with the following receipt fields. Use the date and time of the approved
submission intent in UTC. Retain it before sending create.

```json
{
  "target": "qual-demo-local",
  "incarnation": "OBSERVED_KUBE_SYSTEM_UID",
  "namespace": "qual-demo-data",
  "name": "qual-demo-rebuild",
  "launcher": "demo-launch-PROVIDER_DIGEST_PREFIX",
  "deployment": "REVIEWED_DEPLOYMENT_COMMIT",
  "backend": "GHCR_IMAGE_AT_SHA256_DIGEST",
  "operationDigest": "sha256:PROVIDER_OPERATION_DIGEST",
  "mode": "rebuild",
  "imageID": "sha256:EXPECTED_RUNTIME_IMAGE_ID",
  "intentAt": "REVIEWED_UTC_TIME"
}
```

## Submit once

Use the actual names and paths from the handoff. Confirm the TLS endpoint
and principals. Check the observed `kube-system` and data namespace UIDs
against the reviewed target. The launcher identity is the provider's
`demo-launch-…` account in `<consumer>-demo-operations`. Verify the manifest
digest and current provider health. A server dry-run of the exact manifest
must pass, and the operator must see that the exact Job name is unused.
Keep the Job manifest read-only in the attempt directory.

```text
kubectl --kubeconfig /private/launcher.kubeconfig --context kind-qual-demo-local --namespace qual-demo-data --request-timeout=10s create --dry-run=server -f /private/attempt/provider-job.json -o name
```

Run one create using the launcher kubeconfig. Save its response as
`submission.json`. Preserve the private error and leave the response file
empty if the server's reply was lost.

```text
kubectl --kubeconfig /private/launcher.kubeconfig --context kind-qual-demo-local --namespace qual-demo-data --request-timeout=10s create -f /private/attempt/provider-job.json -o json > /private/attempt/submission.json
```

A timeout, disconnect or ambiguous error means the submission is uncertain.
Proceed directly to recovery with the observer account.

## Recover and record

Read the named Job on the same target. This is the next action after any
lost response. Check the returned namespace, name, attempt marker,
creation time and reviewed envelope. Match the returned UID against a
known submission UID when available. Use a bounded watch for completion,
up to 375 seconds from submission, and read the exact Job at the deadline.
If the Job is missing, foreign, unreadable or still pending at the deadline,
record the reason and retain the available database observations. Keep
the attempt unresolved until independently reconciled.

```text
kubectl --kubeconfig /private/observer.kubeconfig --context kind-qual-demo-local --namespace qual-demo-data --request-timeout=10s get job/qual-demo-rebuild -o json > /private/attempt/job.json
```

Collect Pods by `batch.kubernetes.io/controller-uid` equal to the observed
Job UID. Require an owned Pod and capture its reviewed container's logs
from its recorded start time through termination, with timestamps and a
4,097-byte read limit. Read that Pod again after log
collection. Keep the snapshots as `pods.json` and `log-pod.json` and the
timestamped output as `container.log`. The checked-in filter validates the
observed objects against the approved manifest and emits execution
evidence. These observations use the observer credential throughout.

```text
jq -n --slurpfile submissionIntent /private/attempt/submission-intent.json --slurpfile submission /private/attempt/submission.json --slurpfile rendered /private/attempt/provider-job.json --slurpfile job /private/attempt/job.json --slurpfile pods /private/attempt/pods.json --slurpfile logPod /private/attempt/log-pod.json --rawfile log /private/attempt/container.log -f operations/minimal-demo/administration/job-receipt.jq > /private/attempt/execution-receipt.json
```

The observer uses the same reviewed host, CA, service, and private psql input
file for baseline and final observations. The input file sets `operation`,
`database_system_id`, `database_oid`, `approved_inputs` from the reviewed
carrier and the operation's `scope`. Use typed JSON exactly as emitted for
the approved inputs. Keep probe-only selectors in `scope`. The read-only
SQL verifies these inputs before observing the selected state. Use a
30-second command deadline and save results under stable names.

```text
timeout 30s psql -X -w -qAt --set=ON_ERROR_STOP=1 --dbname 'service=demo_admin_observer sslmode=verify-full connect_timeout=5' -f /private/attempt/observation-inputs.psql -f operations/minimal-demo/administration/observe.sql
```

Record whether the action committed, had already committed, left state
unchanged, partially committed or remains uncertain. Include execution and
before/after evidence hashes in the outcome record. The execution receipt
establishes process evidence. Confirm the command's durable effect separately.

| Operation | Durable evidence |
| --- | --- |
| `bootstrap` | Compare the installed operator and external mapping to the approved identity. Use the expected PostgreSQL JSONB identity tuple SHA-256 in `scope.identityDigest`. |
| `rebuild` | Use approved `asset`, `property` and `version` probe selectors. Check the expected winner and a generation and revision advance of one on the quiesced fixture. |
| `register` | Compare the full immutable declaration derived from the staged input bytes. A matching row present before execution proves a previous result. |
| `calculate` | Use the exact staged request. Verify preparation and terminal status independently. Check the expected output digest for a complete fixture. |
| `reclaim` | Check the receipt, policy and original member count, cleared payload columns and retained object bytes. A policy denial must leave the scope unchanged. |
| `summarize` | Preserve both presence and absence of approved restore selectors. For a reported revision, record the exact `receiptSeries` and `receiptRevision` in a supplemental read. Match the series, revision, coverage and expected numeric result. |
| `expire` | Compare the complete bounded tenant fixture. Check cleared payloads and preserved live leases. Restore and export can commit separately. |

After reconciliation, the provider and other owners withdraw the exact
grant, routes and credentials. Cleanup uses owned resource UIDs and
preserves retained data. Restore and export remain product API operations.
[Provider withdrawal and retained state](https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#withdrawal-and-retained-state)

## Disposable operator rehearsal

Use a separately authorized target. Give the independent operator the
prepared attempt, this guide and the two scoped access paths. Inject a
lost client response after the API stores the exact Job. Capture the
accepted UID independently and compare it with the UID the operator
recovers. Confirm a single accepted Job create, one owned Pod, read-only
observer scope and withdrawal. Use separate evidence for positive and
negative product grants, writer fencing, routes, and each operation's
database effect.
