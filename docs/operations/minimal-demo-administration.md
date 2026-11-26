# Minimal-demo administrative operations

## TL;DR

Render one reviewed operation and submit its exact provider-generated Job under
the attempt-specific launcher identity. Record intent before submission. Keep
the Job until its UID, owned Pod, process outcome and independent before/after
database evidence have been captured. Keep uncertain results open for reviewed
recovery. Migration uses the existing fenced database upgrade Workflow.

## Select authority and prerequisites

Use the exact owned minimal-demo target and a fresh Job name. A qualification
run requires separate authorization for a disposable `qual-` consumer. Review
its provider incarnation, data namespace UID, `fleetiq-db` Cluster UID and
observed PostgreSQL database OID. Bind those to the deployment revision, provider
revision, reviewed operation and input file digests, and the
[published backend selection](../../environments/minimal-demo/backend.json).
Verify the producer publication and exact worker-staged manifest and image IDs
using the [database runbook](minimal-demo-data.md#prerequisites-and-identities).
Retain private records in a mode-0700 directory outside Git.

The launcher operates on its one directed Job through the
[provider's native delegation](https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#approve-an-operation).
The provider checks the owned incarnation, serializes grants across namespaces,
and refuses an active or incomplete attempt before issuing a new grant. Use an
independent scoped observer for Job, Pod and Pod log reads. The runtime account
has no API credential. The separate credential and network operators stage
only the exact reviewed resources. Verify the simulator and archive worker
have terminated. Migration and checked bootstrap also require all product
writers fenced. Observe the approved resource and storage bounds and
account for helper and termination overlap. [Resource ledger](https://github.com/stanimirivanov/fleetiq-deploy/blob/75b65e1f7dab9b04e3c3e586797ff7cce15970b3/docs/capacity/minimal-demo-candidate-ledger.md)

Each Job references its command-specific `fleetiq-db-<producer-command>-url`
Secret at key `url`. Use a dedicated login, verify-full PostgreSQL TLS and the
mounted `workload-database-ca`. Stage immutable, operator-owned references and
record their UIDs without reading values into evidence. Scope bootstrap as
specified by the database runbook. The selected runtime grant set covers
bootstrap and resident commands. The six routine templates require separately
reviewed command-specific database grants and positive and negative installed
tests against this artifact selection before use. Use no owner, serving,
worker or legacy login to make a missing grant succeed.
[Published PostgreSQL grant boundary](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/postgres-runtime-grants.md)

Reclamation additionally needs the current per-tenant retention approval,
naturally aged verified archive evidence, and an independently qualified private
HTTPS object-store endpoint with a restricted read credential. The pinned
producer's archive transport uses its compiled trust roots. Verify TLS through
that exact producer and keep the endpoint in the named demo-support route.
A provider with an untrusted private CA cannot complete this probe. Object
storage qualification and the next-day restore chapter belong to
[#108](https://github.com/stanimirivanov/fleetiq-deploy/issues/108).
[Archive transport](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/crates/archive/src/objects/transport.rs)

## Render and launch

Set `DEPLOY` to the reviewed deployment checkout, `PRIVATE` to private attempt
storage, `DATA` to the reviewed `<consumer>-data` namespace, `TARGET` to
`<consumer>-local` and `JOB` to a fresh name. Supply `operation.yaml` with
the approved `operation` and optional `inputs` fields from the table. Use
decimal strings for numbers, including signed Unix milliseconds, to preserve
exact integers. The chart schema supplies the accepted input fields.

| Operation | Producer command | Inputs |
| --- | --- | --- |
| Migration | `migrate` | Use the [shared upgrade Workflow](minimal-demo-data.md#migration-and-grants) |
| `bootstrap` | `bootstrap-platform-operator --check-schema` | Stage the [three exact operator references](minimal-demo-data.md#checked-operator-bootstrap) |
| `rebuild` | `rebuild-current` | `tenant` |
| `register` | `register-calculator` | `tenant`, `calculator`, `version`, `implementation`, `input`, `input_version`, `output`, `output_version` |
| `calculate` | `calculate-once` | `tenant`, `scope`, `calculator`, `version`, `evaluation`, `configuration`, `target`, `start`, `end`, `finalize`, `known`, `evaluated`, `minimum` |
| `reclaim` | `reclaim-once` | `tenant`, `manifest`, `policyRevision`; stage the five [archive inputs](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/adr/0153-expose-executable-archive-worker.md) as keys of `fleetiq-demo-reclaim-storage` |
| `summarize` | `summarize-once` | `tenant`, `asset`, `property`, `version`, `start`, `end`, `resolution`; optionally both `manifest` and `generation` |
| `expire` | `expire-history-once` | `tenant` |

Restore and export use the product APIs. No arbitrary command, image, Pod
template or Secret overrides are accepted. The single-container Job requests
100m and 192 MiB and is limited to 1 CPU and 384 MiB. The provider supplies
one completion, no configured retry, a 300-second active deadline and
60-second termination grace. [Kubernetes Job behavior](https://kubernetes.io/docs/concepts/workloads/controllers/job/)

```bash
umask 077
PIN=$DEPLOY/environments/minimal-demo/backend.json
CHART=$DEPLOY/charts/fleetiq-minimal-demo-operations
HELM=$DEPLOY/target/tools/manifests/helm
"$HELM" template "$JOB" "$CHART" --namespace "$DATA" --kube-version 1.35.0 \
  -f "$PRIVATE/operation.yaml" --set-file "backend=$PIN" \
  --set-string "backendDigest=$REVIEWED_PIN_DIGEST" > "$PRIVATE/rendered.yaml"
pnpm exec yaml --json < "$PRIVATE/rendered.yaml" |
  jq -er '.[] | select(.data["operation.json"] != null) | .data["operation.json"]' \
  > "$PRIVATE/operation.json"
```

For register and calculate, have the credential operator create the separate
immutable ConfigMap containing `input.json`. Confirm its live UID and bytes
against the render and the content digest in its name. The carrier with
`operation.json` is a render artifact and stays outside the cluster.

Use the provider's documented offline `configure` preview and `job`
renderer on `operation.json`. Compare the exact operation digest, namespace,
Job name and previewed launcher to the reviewed request. Run the provider's
authorized `configure --execute --confirm-target` for that digest and retain its
receipt. Use the recorded launcher as `LAUNCHER`. Render the temporary routes
as `administrative-route`, or `reclaim-route` for reclamation. The authorized
network operator installs the reviewed pair or trio and checks actual DNS,
SQL and provider reachability and isolation. The reclaim route admits only the
object-store Pod selector in the owned demo-support namespace, TCP 9000 behind
the private Service. [Minimal-demo network](minimal-demo-network.md)

```bash
"$HELM" template fleetiq "$CHART" --namespace "$DATA" --kube-version 1.35.0 \
  --set "operation=$ROUTE" --set-string "attempt=$LAUNCHER" > "$PRIVATE/routes.yaml"
kubectl --kubeconfig "$LAUNCHER_KUBECONFIG" --context "kind-$TARGET" \
  --request-timeout=10s auth whoami
kubectl --kubeconfig "$LAUNCHER_KUBECONFIG" --context "kind-$TARGET" \
  --request-timeout=10s -n "$DATA" create -f "$PRIVATE/provider-job.json" \
  -o json > "$PRIVATE/submission.json"
```

The launcher identity must be
`system:serviceaccount:<consumer>-demo-operations:<launcher>`. Compare the
observer and launcher TLS endpoints and the observer's live incarnation, data
namespace UID and Cluster UID to the reviewed target before create. Record
`submission-intent` with source, artifact, target, operator approval, Job name,
provider operation and input digests before sending create. Compare and retain
the returned Job UID. Use create once. If the request or client is interrupted,
record `uncertain` and observe the exact name and approved marker in the same
target. Never assume a missing response means the Job did not start.

## Collect the installed receipt

Use the scoped observer context. A single bounded wait allows 375 seconds
including shutdown. If the wait expires or fails, retain that result and
capture the actual terminal, pending or missing state. Set `POD` and
`CONTAINER` only from exactly one Pod with the expected Job owner UID and
reviewed container. If there is no such Pod, keep an empty log file. The
observation filter emits sanitized identity, exit code and allowlisted
producer outcomes.

```bash
kubectl --kubeconfig "$OBSERVER_KUBECONFIG" --context "kind-$TARGET" -n "$DATA"   wait --for=condition=Complete --timeout=375s "job/$JOB"
kubectl --kubeconfig "$OBSERVER_KUBECONFIG" --context "kind-$TARGET" -n "$DATA"   --request-timeout=10s get "job/$JOB" -o json > "$PRIVATE/job.json"
kubectl --kubeconfig "$OBSERVER_KUBECONFIG" --context "kind-$TARGET" -n "$DATA"   --request-timeout=10s get pods -l "batch.kubernetes.io/controller-uid=$OBSERVED_JOB_UID"   -o json > "$PRIVATE/pods.json"
kubectl --kubeconfig "$OBSERVER_KUBECONFIG" --context "kind-$TARGET" -n "$DATA"   --request-timeout=10s logs "pod/$POD" -c "$CONTAINER" --limit-bytes=4096   > "$PRIVATE/container.log"
```


```bash
RECEIPTS=$DEPLOY/operations/minimal-demo/administration
jq -n --slurpfile job "$PRIVATE/job.json" --slurpfile pods "$PRIVATE/pods.json" \
  --rawfile log "$PRIVATE/container.log" --arg target "$TARGET" \
  --arg incarnation "$INCARNATION" --arg namespace "$DATA" --arg name "$JOB" \
  --arg launcher "$LAUNCHER" --arg jobUID "$JOB_UID" --arg mode "$OPERATION" \
  --arg deployment "$DEPLOYMENT_REVISION" --arg backend "$BACKEND_REFERENCE" \
  --arg operationDigest "$OPERATION_DIGEST" --arg imageID "$EXPECTED_RUNTIME_IMAGE_ID" \
  -f "$RECEIPTS/job-receipt.jq" > "$PRIVATE/execution-receipt.json"
```

Use an empty Job UID only when the API response was uncertain and the scoped
observer independently proves this name and attempt. An uncertain observation
remains unresolved even with previously committed state unless a reviewer can
attribute that state to the exact request. Retain Job and Pods until capture.
Require provider denial of a differently named, foreign-namespace or modified
Job under this launcher, refusal of a second active grant, and an unchanged
sentinel outside scope during installed qualification. The denied requests
use server dry-run. For interruption, use a fresh owned probe with the approved
input, stop waiting during execution, then retrieve and reconcile the original
Job. A retry requires the original outcome and approval of a new attempt.

## Reconcile command effects

Use the separate read-only observer service with verified TLS and the approved
database OID. Capture independent before and after evidence. Set `SCOPE` to the
reviewed command inputs as JSON, including the extra probe selectors below.
Use the exact rendered file for calculate. Keep all process diagnostics private.

```bash
PGSERVICE="$OBSERVER_SERVICE" timeout 30s psql -X -w -qAt -v ON_ERROR_STOP=1 \
  -v "operation=$OPERATION" -v "database_oid=$DATABASE_OID" -v "scope=$SCOPE" \
  -f "$RECEIPTS/observe.sql" > "$PRIVATE/after.json"
```

| Operation | Review the durable result |
| --- | --- |
| Migration | Compare the exact published version/checksum ledger and review the shared Workflow's fence, migrate, grant and verify results. Retain failure as recovery-required and preserve ledger and data. |
| Bootstrap | Include `identityDigest`, the lowercase SHA-256 of the expected PostgreSQL `jsonb_build_array(actor, authority, subject)::text` UTF-8 bytes. Match the installed operator and mapping, even for already-bootstrapped. |
| Rebuild | Select an expected known winner with `asset`, `property` and `version` as probe-only fields. Match winner identity and require generation +1 and revision +1 on the fenced fixture. A repeat advances generation again. |
| Register | Match the full immutable declaration. A new exact row differs from previously registered identical content. |
| Calculate | Require exact preparation and terminal identity. Positive evidence requires `complete` and the expected output digest and count. Insufficient evidence may be durable without an output. Preparation without terminal evidence is partial. |
| Reclaim | For committed reclamation, match manifest, policy and record count, cleared payload columns for all original members, and independently verify retained object bytes. Disabled, protected and denied must show unchanged durable state. Already-reclaimed requires the existing exact receipt. |
| Summarize | Match the reported series and revision to the relevant fingerprint and expected coverage and nonempty arithmetic. Use `receiptRevision` to inspect a replayed revision even if the head advanced. Compare with the before snapshot. |
| Expire | Select the exact `restoreManifest` and `exportJob`. Match retained generations and independently observe removed payloads and preserved live lease fences. The two batches can commit independently on failure. Zero reported actions require an unchanged pass. |

Record a disposition of committed, previously committed, unchanged, partial,
uncertain or recovery-required with the hashes of the execution receipt and
independent observations. Keep exact input bytes for any reviewed retry.
Compare a positive fixture to its known expected effect, including when a
producer can return exit zero on a no-op. Publish sanitized evidence only.
Once captured, have the provider withdraw the exact grant, the network operator
withdraw the exact routes, and the credential operator withdraw the temporary
reference and login. Use provider-approved UID-scoped cleanup. Preserve
database, archive, and checkpoint data and any unresolved attempt.
