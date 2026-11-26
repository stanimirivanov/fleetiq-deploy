# Minimal-demo TCP ingestion and replay

## TL;DR

Render the two independent workers from the reviewed demo backend publication.
Stage private route configuration and separate verified-TLS database credentials
through their owners. Scale to zero and observe the old Pod and process tree
exit before replacement. A wire acknowledgement, retained replay work and a
completed replay checkpoint are separate receipts.

## Inputs and ownership

Finish the [demo database installation](minimal-demo-data.md) and withdraw
migration/bootstrap access. Reuse the [private network](minimal-demo-network.md),
including the exact simulator attempt policy, ClusterIP `tcp-ingestion:55027`
and its bind ConfigMap. Through authenticated product operations, admit the
reviewed Teltonika identity-v1 package and commission the exact active tenant,
communication device, external identifier and channel route. Select the exact
version and artifact digest from that admission. A registered identifier is a
routing claim. This listener accepts plain TCP on the trusted private route.
[Platform TCP contract](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/tcp-ingestion.md)
|
[Route commissioning](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/protocol-route-commissioning.md)

In the apps namespace the deployment operator stages the private ConfigMap
`fleetiq-ingest-tcp-route` with string keys `FLEETIQ_TCP_TENANT_ID`,
`FLEETIQ_TCP_CHANNEL_ID`, `FLEETIQ_TCP_PACKAGE_ID` and `FLEETIQ_TCP_PACKAGE_VERSION`.
Set `FLEETIQ_TCP_IDENTIFIER_AUTHORITY` only when the registration uses an
explicit authority. Omit the key for the implicit issuer. The manifest fixes the
registered-identifiers policy. Review the route input and capture its digest
without publishing values. Change the ConfigMap only while ingestion is stopped.

The credential operator publishes `workload-database-ca` with public key
`ca.crt` and two namespace-local Secrets with key `url`. Match
`fleetiq-db-ingest-tcp-url` to `fleetiq_ingest_tcp` and
`fleetiq-db-replay-worker-url` to `fleetiq_replay_worker`. Use the CNPG read/write
Service name on the server certificate and URL options `sslmode=verify-full` and
`sslrootcert=/etc/fleetiq/database/ca.crt`. Verify TLS hostname and CA settings
at provisioning and observe TLS sessions for both roles via the approved DB
observer. Rotating either credential requires the role's controlled replacement
and a new connection witness. Keep passwords and connection strings in the
credential operator's private files or Secret inputs.
[Credential contract](workload-database-identities.md#inputs-and-ownership)

Only the deployment operator manages these credential-bearing controllers and
their ServiceAccounts. The provider's routine reconciler may manage the private
Service under its existing delegation. Network/traffic authority comes from the
demo network policy. The worker Pods use no Kubernetes API token. Stage the
chosen immutable backend image in the owned worker's CRI after verifying its
published platform digest and source. The chart uses `imagePullPolicy: Never`.
The shell-free producer runs as PID 1 with its sibling live or decode binary.
Both worker commands verify the migration ledger during startup.
[Provider delegation](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/minimal-delegation.md)

## Render, start and stop

Use the exact clean deployment revision and checksum-pinned toolchain. Use a
private directory and capture the rendered hashes, source, backend publication
and provider target receipt. These are offline render commands.

```bash
HELM=target/tools/manifests/helm
DEMO=environments/minimal-demo
CHART=charts/fleetiq-minimal-demo-operations
APPS="$CONSUMER-apps"
umask 077
for phase in workers workers-maintenance; do
  "$HELM" template fleetiq "$CHART" --namespace "$APPS" --kube-version 1.35.0 \
    --set "operation=$phase" --set-file "backend=$DEMO/backend.json" \
    > "$PRIVATE/$phase.yaml"
done
pnpm verify manifests
```

Start with the exact two operator-owned Deployments at zero and ready inputs.
After separate target authorization, the operator uses its existing authority
to stage the stopped manifest, then admits one Deployment at a time. Bind
`k` to the verified private kubeconfig and confirmed provider target.

```bash
k() {
  timeout 12s kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" \
    --request-timeout=8s -n "$APPS" "$@"
}
# Fresh installation only. Review ownership and absence before creating.
k create -f "$PRIVATE/workers-maintenance.yaml"
role=ingest-tcp  # or replay-worker
k scale "deployment/fleetiq-$role" --replicas=1
# Bound the complete status watch separately from each request.
timeout 125s kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" \
  --request-timeout=120s -n "$APPS" rollout status "deployment/fleetiq-$role" --timeout=120s
```

Rollout status and the exact running container's UID, node, image ID and
restart count are availability evidence. Ingest has a separate private wire
test. Replay has no listener and uses the durable progress test below. The
non-serving containers have no Kubernetes HTTP probes or server healthcheck.
An idle queue does not decide worker health.

Use `Recreate` plus an operator-enforced stop-before-start sequence. Suspend
any reconciler that could restore replicas or launch work. For each replacement,
capture the old Pod and container IDs, then set replicas to zero. Within 90
seconds require no matching Pods (including terminating ones), observe the
original runtime process tree gone and verify the expected database sessions
ended. An old running Pod on an unreachable node blocks replacement. Apply
any reviewed replacement inputs at replicas zero, selecting only that role’s
Deployment for a one-role replacement. Start only that role, then
record a different Pod UID, an unchanged retained DB identity, and actual
progress. Never force-delete a worker to meet the deadline.

```bash
k scale "deployment/fleetiq-$role" --replicas=0
# On the approved installation, wait for the old Pod captured before scaling.
timeout 95s kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" \
  --request-timeout=90s -n "$APPS" wait --for=delete "pod/$OLD_POD" --timeout=90s
k get pods -l "app.kubernetes.io/name=fleetiq-$role" -o name
```

Use the provider worker identity, owned Docker context and exact CRI container
ID from `status.containerStatuses` to observe the process tree before, during
and after termination. For a containerd worker, `ctr` can enumerate the exact
container task's PIDs without printing environments or argv.

```bash
timeout 8s docker --context "$DOCKER_CONTEXT" exec "$OWNED_WORKER_ID" \
  ctr --namespace k8s.io tasks ps "$CRI_ID"
```

Sample the child while work is active. Record an observed parent plus no more
than one `fleetiq-protocol-live` or `fleetiq-protocol-decode` child for the selected
role. Use Linux process status and the executable names from the exact task.
For the observed task PIDs on the owned node, `ps -o pid=,ppid=,stat=,comm= -p PID`
and `readlink /proc/PID/exe` distinguish an active child from a zombie. Record
the pre-stop sample, normal terminated exit (including reason and signal when exposed),
child disappearance and task removal before starting a replacement. A missing
sample, forced termination, OOM, lost worker, orphan or zombie remaining at
shutdown leaves graceful termination unqualified. On explicit interruption, also
retain the database lease/checkpoint evidence below. Each role's candidate
request/limit is 100m/1000m CPU and 256/512 MiB memory for the one container
including its child. The producer caps the child at 15 seconds wall time
and allows one child per role. Sample actual usage and cgroup peaks under the provider cap.
Database pool ceilings are in the [data installation guide](minimal-demo-data.md).
[Approved resource ledger](https://github.com/stanimirivanov/fleetiq-deploy/issues/92#issuecomment-7071204249)
|
[Replay child limits](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/protocol-replay.md)

## Maintenance writer inventory

Fence new simulator and release admission and reconcile the namespace controller,
Pod and Job inventory against these paths before an incompatible update or schema
operation. Include terminating Pods and controllers whose Pods can be recreated.
An absent future component needs an observed absence for the selected stage.

| Writer or trigger | Maintenance action |
| --- | --- |
| `fleetiq-backend` serving API, including commissioning, recovery, restore and export attempts | Block product ingress and scale to zero. Account for active API operations. |
| `fleetiq-ingest-tcp`, `fleetiq-replay-worker` | Stop the exact simulator attempt, then the listener. Use the reviewed compatible worker to drain replay if required. Apply the zero-replica phase before migration and observe both exits. |
| Semantic and current projection workers | Stop and observe committed queue/checkpoint state. |
| Analytics and notification workers | Stop claims and delivery; retain queues and reconcile uncertain deliveries. Stop Alertmanager where the selected phase requires settled delivery. |
| Archive worker | Stop and account for published and pending attempts. Retain database and archive state. |
| Simulator Jobs | Disable new attempts and account for every existing attempt, including checkpoints and uncertain wire effects. |
| Migration workflow and bootstrap Job | Suspend new attempts. Reconcile active/failed Jobs; only the exact authorized operation may proceed in its phase. |
| Rebuild current, calculator registration and one-shot calculation, reclaim, summarize and expire-history Jobs | Block launch and require any preceding operation to be accounted for. |

Reconcile the live apps, data and releases namespace controller/Job and Pod
inventory against the approved stage. Stop for any unaccounted writer. Use the
[database workflow's independent drain and CONNECT fence](workload-database-identities.md#operate-the-upgrade)
before granting temporary migration authority. Check prepared transactions as
well as client sessions. Desired replicas zero is an input to the gate.

## Installed interruption and compatibility probe

Run only with renewed permission for the positively identified disposable
minimal-demo target and a synthetic authenticated commissioning. Keep all
diagnostics in an owner-only directory. Use the matching network/DB gate
receipts and source/artifact identity, and reserve the measured phase/tooling
budget for the fixture. Other writers and simulator attempts must be absent
during the interruption exercise except any commissioning/diagnostic path already
authorized for the target. Record target/namespace, database OID, immutable
backend/source, worker Pod/container IDs, route/config digests, and application
fixture identity. Never log credentials, raw payloads, or opaque replay state.

### TCP acceptance

Use a bounded one-shot TCP witness from a separately approved admitted fixture
Pod in the simulator policy's exact attempt identity. Stage a reviewed immutable
Python image matching that probe's authority and reuse the [network witness
constraints](minimal-demo-network.md) for placement, token handling and DNS.
Use a private, single-line JSON fixture with the reviewed base64 Teltonika
handshake and one valid synthetic AVL frame and integer `recordCount`. Keep the
registered test identifier and fixture bytes private. The witness connects only
to the private IPv4 `tcp-ingestion` Service, requires the actual handshake byte
and reports the four-byte raw-acceptance ACK count separately. Use a terminal
independent of the DB observer. From the reviewed checkout, configure the exact
fixture Pod name and invoke:

```bash
PROBE=operations/minimal-demo-workers
mkfifo -m 0600 "$PRIVATE/tcp.stdin"
exec {TCP_INPUT}<>"$PRIVATE/tcp.stdin"
timeout 45s kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" \
  --request-timeout=40s -n "$APPS" exec -i "$TCP_POD" -- \
  python -I -B -c "$(<"$PROBE/tcp-witness.py")" < "$PRIVATE/tcp.stdin" \
  > "$PRIVATE/tcp.jsonl" 2> "$PRIVATE/tcp.err" &
TCP_PID=$!
cat "$PRIVATE/tcp-fixture.json" >&"$TCP_INPUT"
```

Require `{"handshake":"accepted"}` and the committed handshake checkpoint before
continuing. Have the approved PostgreSQL operator hold the following fault gate
in an independent interactive connection, only on the disposable target. Open
the gate after the handshake checkpoint and send the AVL frame within the
producer's 15-second socket idle limit. The lock blocks decoded-result inserts,
so the raw ACK and durable work can be observed separately. It changes no
schema or data. Hold it only for the documented stage and always roll back, even
on error. Server-side transaction timeout bounds abandonment.

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL transaction_timeout = '50s';
LOCK TABLE ingestion.decoded_message_results IN SHARE MODE;
-- Keep this session open only while the selected worker stops.
-- ROLLBACK at the end of the stop stage or on any failure.
```

Send the single reviewed frame and inspect the sanitized TCP receipt.

```bash
printf 'send\n' >&"$TCP_INPUT"
wait "$TCP_PID"
exec {TCP_INPUT}>&-
rm "$PRIVATE/tcp.stdin"
```

If the work completes before the intended interruption, the phase did not observe
a retained pending turn. Stop and review the fixture and lock timeline. Keep
ACK count, ingress and progress evidence separately. Use authenticated product
[ingestion diagnostics](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/ingestion-diagnostics.md)
to locate the exact synthetic message ID by device and receipt time.

### Replay interruption and fingerprint eligibility

Use an authorized least-privilege read-only observer service with verified TLS
and a bounded private service/password file, as in the [database guide](minimal-demo-data.md#runtime-and-retained-restart-qualification).
Grant the observer read access to the exact tables used by the query through
existing owner-approved authority. The two selectors are synthetic tenant and
message IDs used privately. The SQL probes their exact durable turn and outputs
database identity, receipt/status markers, fingerprint, lease and checkpoint.

```bash
sample() {
  PGSERVICE="$OBSERVER_SERVICE" timeout 8s psql -X -w -qAt \
    --set="database_oid=$DB_OID" --set="tenant_id=$1" --set="message_id=$2" \
    -f "$PROBE/observe-replay.sql" > "$PRIVATE/$3.json"
}
```

1. Start with ingestion running and replay stopped. Capture `accepted` while
   the fault lock is held, with the raw ACK, committed pending turn and exact
   live claim visible. Stop ingestion and observe actual termination before
   releasing the lock. Capture `ingest-stopped`.
2. With ingestion still stopped, capture `foreign-before` for a separate
   eligible pending turn with a different fingerprint from an independently
   reviewed producer artifact that accepts the same exact schema. Preserve the
   original fixture. If no such turn is available, the negative installed gate
   remains unverified. Do not write a replacement fingerprint.
3. Let the ingestion lease expire on the DB clock. Reacquire the short fault
   lock, start replay, capture its first new claim as `replay-claimed` and stop
   replay. Observe actual termination and capture `replay-stopped` before releasing
   the lock. If any deadline expires, release the fault lock and retain evidence.
4. With the lock released, start the exact compatible replay worker while
   ingestion stays stopped. Within 60 seconds of replay startup require the
   interrupted lease to expire and the durable work and decoded marker to
   complete together with the exact checkpoint. Capture `completed` and then
   `foreign-after`. Use polls spaced at least one second apart with the per-query
   deadline above. A running worker or a vanished queue item alone fails.

Compute the fingerprint from the reviewed exact platform source checkout by
combining the producer policy bytes and Cargo.lock. Verify the policy tag
against the producer implementation when the backend pin changes. Pass all
seven private samples to the receipt check.

```bash
revision=$(jq -er '.backend.source.revision' "$DEMO/backend.json")
git -C "$PLATFORM_SOURCE" cat-file -e "$revision:Cargo.lock" || exit 1
executionSha=$(
  set -o pipefail
  { printf 'fleetiq-replay-policy-1\0'; git -C "$PLATFORM_SOURCE" show "$revision:Cargo.lock"; } |
    sha256sum | cut -d' ' -f1
) || exit 1
jq -se --arg executionSha "$executionSha" -f "$PROBE/qualify-replay.jq" \
  "$PRIVATE"/{accepted,ingest-stopped,replay-claimed,replay-stopped,completed,foreign-before,foreign-after}.json \
  > "$PRIVATE/replay-receipt.json"
```

Retain the replay receipt with the independent wire, process and target
receipts. Always release the fault lock, close probe clients, remove only the
owned transient TCP fixture and reconcile affected worker replicas under operator
authority. Unobserved stages or failed cleanup leave qualification incomplete.

## Recovery

Restart the same digest after reviewing active lease generations and expiry,
and preserve the accepted bytes, original pre-state, artifacts and DB. Ordinary
replay does not send historical ACKs. Reconnections can create new accepted facts.
For poisoned or exhausted work, use the platform's audited recovery operations
and verify the exact outcome before allowing further work. Verify schema and
execution fingerprint compatibility before any image change. Drain affected work
with the original image and exact ledger before an incompatible migration.
Keep workers fenced in recovery-required state if an operation changes the schema
or compatibility is uncertain. Use the approved forward/restore procedure.
[Replay compatibility](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/protocol-replay.md#upgrades-and-compatibility)
|
[Audited recovery](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/work-recovery.md)
