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

## Render the reviewed operation

Set `DEPLOY` to the reviewed deployment checkout, `PRIVATE` to private attempt
storage, `DATA` to the reviewed `<consumer>-data` namespace, `TARGET` to
`<consumer>-local` and `JOB` to a fresh name. Supply `operation.yaml` with
the approved `operation` and optional `inputs` fields from the table. Take
`REVIEWED_PIN_DIGEST` from the approved backend selection record. Use
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
set -euo pipefail
umask 077
cd "$DEPLOY"
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

## Prepare the provider attempt

For register and calculate, have the credential operator create the separate
immutable ConfigMap containing `input.json`. Confirm its live UID and exact
bytes against the render and the content digest in its name. The carrier with
`operation.json` stays outside the cluster. Record the exact references and
UIDs for the temporary login, database CA and other inputs. Keep the immutable
objects in place until the attempt is accounted for.

From the reviewed provider checkout, use the selected `CONSUMER`, private
`STATE_ROOT`, `DOCKER_CONTEXT` and `HTTPS_PORT` from cold bootstrap. The
reviewed request supplies `OPERATION_DIGEST`, independently of the live
configure response. Review the preview and exact Job before approving the
grant. Capture the provider output privately.

```bash
PROVIDER_ARGS=(--consumer "$CONSUMER" --docker-context "$DOCKER_CONTEXT"
  --state-root "$STATE_ROOT" --https-port "$HTTPS_PORT"
  --operation "$PRIVATE/operation.json")
uv run --locked --offline python -m scripts.minimal_delegation configure \
  "${PROVIDER_ARGS[@]}" > "$PRIVATE/provider-preview.json"
uv run --locked --offline python -m scripts.minimal_delegation job \
  "${PROVIDER_ARGS[@]}" > "$PRIVATE/provider-job.json"
LAUNCHER=demo-launch-${OPERATION_DIGEST:7:24}
jq -e --arg target "$TARGET" --arg ns "$DATA" --arg job "$JOB" \
  --arg digest "$OPERATION_DIGEST" --arg launch "$LAUNCHER" '
  .name == $target and .execution == "not-performed"
  and .operation == {name: $job, digest: $digest, namespace: $ns, launcher: $launch}
  ' "$PRIVATE/provider-preview.json" > /dev/null
```

After approval, the authorized provider operator uses the same configure
command with `--execute --confirm-target "$TARGET"`. Then run `health` with
the same flags and operation. Require `configured` in the configure result,
`observed` in the health result, and the exact target name, context, incarnation
and operation digest in both. Retain the results and approval reference.
Provider health inspects delegated resources under provider authority.

Render `administrative-route` for the regular Jobs, `bootstrap-route` for the
existing checked bootstrap, or `reclaim-route` for reclamation. The authorized
network operator installs the reviewed pair or trio. Check DNS and approved
SQL connectivity and isolation over the actual installed routes. Reclaim also
needs a positive object-store test against the named demo-support selector and
TCP 9000 behind the private Service. Use scope-specific disposable probes
under the network operator's approval.
[Minimal-demo network](minimal-demo-network.md)

```bash
"$HELM" template fleetiq "$CHART" --namespace "$DATA" --kube-version 1.35.0 \
  --set "operation=$ROUTE" --set-string "attempt=$LAUNCHER" > "$PRIVATE/routes.yaml"
```

## Verify target and identities

Use the provider-issued, TLS-verifying kubeconfigs and the reviewed API server
URL `API_SERVER`. The observer needs the named Job read, Pod list, Pod read
and Pod log read in `DATA`. Scope the Pod capability to that namespace and
use the Job controller UID and exact owned Pod name at collection. Use
existing named namespace and CNPG Cluster reads for target verification.
The observer and launcher are separate principals. The launcher username
must be `system:serviceaccount:<consumer>-demo-operations:<launcher>`.

Run the following with `set -euo pipefail`. Resolve any failed check before
continuing. The kubeconfig check compares endpoint and TLS settings without
dumping users or credentials. Verify the CA through the provider-issued
kubeconfigs. Reconfirm the provider health output against the approved
incarnation. Reconfirm observed simulator and archive termination, and the
full writer fence where required, before capturing the database baseline.

```bash
OBS=(kubectl --kubeconfig "$OBSERVER_KUBECONFIG" --context "kind-$TARGET" --request-timeout=10s)
LAUNCH=(kubectl --kubeconfig "$LAUNCHER_KUBECONFIG" --context "kind-$TARGET" --request-timeout=10s)
for kubeconfig in "$OBSERVER_KUBECONFIG" "$LAUNCHER_KUBECONFIG"; do
  kubectl --kubeconfig "$kubeconfig" --context "kind-$TARGET" config view --minify -o json |
    jq -e --arg server "$API_SERVER" '
      [.clusters[].cluster] | length == 1 and
      (.[0] | .server == $server and (.server | startswith("https://"))
       and .["insecure-skip-tls-verify"] != true and .["proxy-url"] == null)
    ' > /dev/null
done
test "$OBSERVER_USER" != "system:serviceaccount:$CONSUMER-demo-operations:$LAUNCHER"
"${LAUNCH[@]}" auth whoami -o json |
  jq -e --arg expected "system:serviceaccount:$CONSUMER-demo-operations:$LAUNCHER" \
    '.status.userInfo.username == $expected' > /dev/null
"${OBS[@]}" auth whoami -o json |
  jq -e --arg expected "$OBSERVER_USER" \
    '.status.userInfo.username == $expected' > /dev/null
"${OBS[@]}" -n "$DATA" auth can-i get "jobs.batch/$JOB"
"${OBS[@]}" -n "$DATA" auth can-i list pods
"${OBS[@]}" -n "$DATA" auth can-i get pods
"${OBS[@]}" -n "$DATA" auth can-i get pods --subresource=log
test "$("${OBS[@]}" -n "$DATA" auth can-i create jobs.batch)" = no
test "$("${OBS[@]}" -n "$DATA" auth can-i create pods --subresource=exec)" = no
test "$("${OBS[@]}" -n "$DATA" auth can-i delete "jobs.batch/$JOB")" = no
test "$("${OBS[@]}" -n "$DATA" auth can-i delete pods)" = no

"${OBS[@]}" get "namespace/$DATA" -o json |
  jq -e --arg uid "$DATA_NAMESPACE_UID" --arg consumer "$CONSUMER" '
    .metadata.uid == $uid and .metadata.labels["k8s-infrastructure.io/consumer"] == $consumer
    and .metadata.deletionTimestamp == null and .status.phase == "Active"
    ' > /dev/null
"${OBS[@]}" -n "$DATA" get cluster.postgresql.cnpg.io/fleetiq-db -o json |
  jq -e --arg uid "$CNPG_CLUSTER_UID" '
    .metadata.uid == $uid and .metadata.deletionTimestamp == null
    ' > /dev/null
"${OBS[@]}" -n "$DATA" get "job/$JOB" --ignore-not-found -o name > "$PRIVATE/prelaunch-job.txt"
test ! -s "$PRIVATE/prelaunch-job.txt"
```

## Record the baseline and intent

On the selected verified primary, use a dedicated read-only TLS service
`OBSERVER_SERVICE` with read access only to the tables required by the
selected observer. Supply the privately reviewed
`$PRIVATE/observation-scope.json` as described below. The read checks the
exact approved `DATABASE_OID`. Use the same service and scope for both
observations. Keep diagnostics and data out of public evidence.

```bash
RECEIPTS=$DEPLOY/operations/minimal-demo/administration
export FLEETIQ_OBSERVATION_SCOPE="$(cat "$PRIVATE/observation-scope.json")"
PGSERVICE="$OBSERVER_SERVICE" timeout 30s psql -X -w -qAt -v ON_ERROR_STOP=1 \
  -v "operation=$OPERATION" -v "database_oid=$DATABASE_OID" \
  -c '\getenv scope FLEETIQ_OBSERVATION_SCOPE' -f "$RECEIPTS/observe.sql" \
  > "$PRIVATE/before.json"
unset FLEETIQ_OBSERVATION_SCOPE
jq -e 'type == "object"' "$PRIVATE/before.json" > /dev/null
```

Review the baseline against the fixture and the intended effect. Record the
UTC intent time and `submission-intent` in the private attempt directory.
Include approval, deployment and provider revisions, target and incarnation,
namespace and Cluster UIDs, database OID, Job name, artifact and runtime image
identities, provider operation digest, and SHA-256 fingerprints of the
approved Job, exact operation and input bytes, observation scope and before
snapshot. Set `INTENT_AT` to the recorded RFC 3339 UTC time. The operator and
cluster clocks must agree for time correlation. Capture the reviewed
fingerprint of `provider-job.json` in `approved-job.sha256` using the
`sha256sum` check-file format.

## Submit once

Proceed only after the above checks, private baseline and intent are complete.
Check the file against the recorded fingerprint immediately before create.

```bash
sha256sum --check --status "$PRIVATE/approved-job.sha256"
"${LAUNCH[@]}" -n "$DATA" create -f "$PRIVATE/provider-job.json" -o json > "$PRIVATE/submission.json"
```

Verify the submitted Job name, namespace and attempt marker and retain its
returned UID as `JOB_UID`. On an interrupted request, record the uncertain
response and observe the exact attempt from the independent context. A
missing response may coexist with a running Job. A new create requires
resolution of the original request and a new approval and name.

## Collect the installed receipt

Use the scoped observer context and allow at most 375 seconds to see a
terminal Job, including shutdown. Poll the named Job within that deadline.
Capture the terminal, pending or missing state independently of the create
response. Use the observed Job UID only after checking name, namespace and
attempt marker. Read Pods with the controller UID selector. Set `POD`,
`CONTAINER` and `STARTED_AT` only when exactly one Pod has the verified
Job owner UID and the reviewed container has terminated. Take the exact named
Pod's current logs and immediately re-read the same Pod. This lets the
receipt compare the Pod UID, process identity and log timestamps. Keep
private diagnostics if any read fails. Missing or failed reads leave
execution uncertain and still require the after observation.

```bash
"${OBS[@]}" -n "$DATA" get "job/$JOB" -o json > "$PRIVATE/job.json"
"${OBS[@]}" -n "$DATA" get pods -l "batch.kubernetes.io/controller-uid=$OBSERVED_JOB_UID" \
  -o json > "$PRIVATE/pods.json"
"${OBS[@]}" -n "$DATA" logs "pod/$POD" -c "$CONTAINER" --timestamps=true \
  --since-time="$STARTED_AT" --limit-bytes=4097 > "$PRIVATE/container.log"
"${OBS[@]}" -n "$DATA" get "pod/$POD" -o json > "$PRIVATE/log-pod.json"
```

Use empty capture files for missing observations. Use an empty `JOB_UID`
only when the create response was uncertain and the observer independently
verified the exact target and Job attempt. Provide the original offline
provider-rendered Job and the fixed artifact identifiers. Oversize logs,
unrecognized or conflicting application receipts and unverified execution
all leave the result uncertain.
[Kubernetes log collection](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/)

```bash
jq -n --slurpfile rendered "$PRIVATE/provider-job.json" --slurpfile job "$PRIVATE/job.json" \
  --slurpfile pods "$PRIVATE/pods.json" --slurpfile logPod "$PRIVATE/log-pod.json" \
  --rawfile log "$PRIVATE/container.log" --arg target "$TARGET" \
  --arg incarnation "$INCARNATION" --arg namespace "$DATA" --arg name "$JOB" \
  --arg launcher "$LAUNCHER" --arg jobUID "$JOB_UID" --arg mode "$OPERATION" \
  --arg deployment "$DEPLOYMENT_REVISION" --arg backend "$BACKEND_REFERENCE" \
  --arg operationDigest "$OPERATION_DIGEST" --arg imageID "$EXPECTED_RUNTIME_IMAGE_ID" \
  --arg intentAt "$INTENT_AT" -f "$RECEIPTS/job-receipt.jq" > "$PRIVATE/execution-receipt.json"
```

## Reconcile command effects

Repeat the baseline SQL with the same read-only service, database OID and
scope and save the result as `after.json`. For each observation, use the
exact reviewed input in `observation-scope.json`. Include the extra
selectors listed below and use the exact mounted JSON for calculate. For
migration, perform the same before and after SQL around the shared Workflow.

| Operation | Review the durable result |
| --- | --- |
| Migration | Compare the exact published version/checksum ledger and review the shared Workflow's fence, migrate, grant and verify results. Retain failure as recovery-required and preserve ledger and data. |
| Bootstrap | Include `identityDigest`, the lowercase SHA-256 of the expected PostgreSQL `jsonb_build_array(actor, authority, subject)::text` UTF-8 bytes. Match the installed operator and mapping, even for already-bootstrapped. |
| Rebuild | Select an expected known winner with `asset`, `property` and `version` as probe-only fields. Match winner identity and require generation +1 and revision +1 on the fenced fixture. A repeat advances generation again. |
| Register | Match the full immutable declaration. A new exact row differs from previously registered identical content. |
| Calculate | Require exact preparation and terminal identity. Positive evidence requires `complete` and the expected output digest and count. Insufficient evidence may be durable without an output. Preparation without terminal evidence is partial. |
| Reclaim | For committed reclamation, match manifest, policy and record count, cleared payload columns for all original members, and independently verify retained object bytes. Disabled, protected and denied must show unchanged durable state. Already-reclaimed requires the existing exact receipt. |
| Summarize | Match the reported series and revision to the relevant fingerprint and expected coverage and nonempty arithmetic. Compare the original scope before and after. Use an additional read with `receiptRevision` if a replay reports a different revision from the current head. |
| Expire | Use a fenced fixture tenant with at most 32 retained restores and 32 exports. Include due restore and export work, an already-stale export lease, and a lease still live across the attempt where practical. Compare the complete ordered arrays by ID and generation, including the private export key digests. Count status/payload transitions and lease removals against the three reported counters. Use the observation times and stable expiry and lease values to identify eligibility changes. The restore batch can commit before the export transaction fails. Zero counters require identical row arrays, a valid execution receipt and no expected action missed. |

Expiry captures presence flags, lifecycle times and generations for every
fixture row and refuses a larger tenant. Leave the fixture fenced across
both reads so an out-of-band mutation cannot mask a partial commit. Keep
payload contents, raw logs and scope bytes private. For an uncertain time
window or changed rows beyond the reviewed expectation, keep the original
attempt open.

Record a disposition of committed, previously committed, unchanged, partial,
uncertain or recovery-required with the hashes of the execution receipt and
independent observations. Keep exact input bytes for any reviewed retry.
Compare a positive fixture to its known expected effect, including when a
producer can return exit zero on a no-op. Publish sanitized evidence only.
Once captured, have the provider withdraw the exact grant, the network operator
withdraw the exact routes, and the credential operator withdraw the temporary
reference and login. Use provider-approved UID-scoped cleanup. Preserve
database, archive, and checkpoint data and any unresolved attempt.


## Installed qualification and pending prerequisites

Run from a separately authorized disposable `qual-` consumer. Use fresh
attempts, a quiesced bounded fixture and an unrelated sentinel. Start with
the provider's native delegation qualification and retain its installed
receipt. For each launch exercise the preflight and before/after checks
above against the exact reviewed backend on the owned worker. Record the
passed steps and unresolved outcomes for these cases.

| Case | Required installed evidence |
| --- | --- |
| Exact request | In a server dry-run under the launcher, verify the admitted Job matches the provider render after Kubernetes defaults. Submit the original Job once and capture the actual admitted Job, one owned Pod, matching runtime image and correlated producer receipt. |
| Authority denial | Use server dry-run under the same launcher for a different name, foreign namespace, changed command or credential reference. Require the expected RBAC or admission denial. Confirm a second grant is refused while the original is active and the independent scope sentinel stays unchanged. |
| Effects | Prove migration and checked bootstrap from the reviewed ledger and identity. Run rebuild, register, calculate, reclaim, summarize and expire against known database states. Verify the operation-specific expected results and denial boundaries in the table above. Run explicitly expected idempotent or unchanged cases with separate intent. |
| Interrupted observation | Stop waiting during one approved attempt and recover the original UID, Pod and durable result without another create. Exercise interruption across the expiry commits and require the full fixture snapshot to expose any partial change. |
| Withdrawal | Capture receipts before withdrawing the one attempt's grant, routes and temporary credential references. Verify cleanup by UID and preservation of the retained data and the unrelated sentinel. |

The manifest and receipt fixtures exercise offline validation. The installed
provider, Job and Pod receipt and complete administrative Job sequence remain
pending. The six scoped routine command login/grant pairs require reviewed
qualification for this exact backend and SQL revision. Reclamation also
requires the qualified exact-producer object-store path and naturally aged
archive fixture. The SQL observer also needs a separately approved read-only
login and permitted connection in the chosen phase. Verify that prerequisite
before the baseline. Track these outcomes independently of offline success.
