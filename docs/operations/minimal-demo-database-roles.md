# Minimal-demo database roles and installation probe

## TL;DR

Render the reviewed role profile offline. On a separately authorized disposable
target, migrate with the temporary database owner, apply and test the producer
grants, withdraw the owner login, bootstrap through the checked platform
command, then withdraw the bootstrap login. Commission through authenticated
FleetIQ APIs. Capture the same bounded observation before and after an authorized
PostgreSQL restart.

## Reviewed inputs

Use the [private network composition](minimal-demo-network.md), provider
[database capability and verified images](https://github.com/stanimirivanov/k8s-infrastructure/blob/0d92be31e9c6a538bb9c2e69175deec2ec2f5089/docs/minimal-database.md)
and [operation delegation](https://github.com/stanimirivanov/k8s-infrastructure/blob/0d92be31e9c6a538bb9c2e69175deec2ec2f5089/docs/minimal-delegation.md)
for the exact target incarnation. Confirm the worker budget, retention policy,
installation authority and exact application/database image staging. The probe checks the container's
running manifest against the reviewed Linux amd64 child or its enclosing image
index.
The reviewed [backend selection](../../environments/minimal-demo-candidate/backend.json)
identifies the platform source, published backend and workflow report. Retain
the exact published `reports/migrations.json` and the grant JSON from that
exact source revision. The probe verifies their bytes against both pins and
checks every installed ledger row. Its grant stage also loads the producer SQL
fixture and retention query sources from the pinned revision in a local Git
checkout. [Producer privilege contract](https://github.com/stanimirivanov/fleetiq-platform/blob/c0d71a56dad0596d3c6a6b866e4338d25b597af2/docs/operations/postgres-runtime-grants.md)

Run these offline commands from this repository using installed pinned tools.

```sh
umask 077
for PHASE in installation bootstrap runtime; do
  pnpm --silent minimal-demo:data:roles "$CONSUMER" "$PHASE" > "/private/db-$PHASE.json"
  jq -e .cluster "/private/db-$PHASE.json" > "/private/db-$PHASE-cluster.json"
done
```

Review the phase-independent database candidate digest in `.candidate`, the
three phase fingerprints, and the proposed Cluster changes. The phase
documents contain references for workload construction and review. Provide
only the Cluster object to the separately authorized credential operator.
The owner retains bootstrap, role and minimum data sizing settings in all
three phases. The 768 MiB and 64-connection targets require installed evidence.
[Data resources and pool limits](minimal-demo-data.md)

## Credentials and workload trust

The credential operator supplies only the basic-auth Secret for each enabled
CNPG role in the data namespace. The role profile gives the exact Secret
names. Use a new, independent random password per identity. The schema owner
Secret has type `kubernetes.io/basic-auth` with username matching
`fleetiq_migrator`. Managed roles use the same Secret type with their own
username and password. Add `cnpg.io/reload: "true"` to controller password
Secrets. Never pass a password or URL on a command line, log it, or store it
in reviewed values or operation inputs.

Each active workload receives only the matching URL Secret referenced in
`.clients` and the mounted read-only public server CA ConfigMap. The producer
reads the URL from its own environment via `secretKeyRef`. Use exactly the
client's service DNS name and database, with `sslmode=verify-full` and
`sslrootcert=/etc/fleetiq/database/ca.crt`. Encode the username and password
as required by a PostgreSQL URI. Each URL Secret is namespace-local, with key
`url`, and separate from the CNPG password Secret. Provision the public
`fleetiq-database-trust` ConfigMap with CA key `ca.crt` in the client
namespace. Use the certificate issued for that Cluster. Keep private keys
with CNPG. Do not mount a migration, bootstrap or another runtime role's
Secret into a running application client.

## Phase sequence

Maintain an owner-held installation window and fence all writers, simulator
admission and other administrative operations. On a first installation, verify
an empty owned target before staging the review's `installation` Cluster.
Only the migrator can log in during this phase. Run the exact image's
`migrate` operation and retain its exit receipt.

### Submit the migration and bootstrap Jobs

Use a fresh `JOB` name for each attempt. From the deployment checkout, generate
the provider operation for `PHASE=installation` or `PHASE=bootstrap`. For
bootstrap, `OPERATOR_INPUT` names the separately provisioned data-namespace
Secret with the three exact keys below. Store the operation and Job manifests
privately. The image entrypoint runs as UID and GID 10001. Each data Job gets
100m CPU and 192 MiB requested, 1 CPU and 384 MiB at its limits, and a
300-second deadline. [Bootstrap producer contract](https://github.com/stanimirivanov/fleetiq-platform/blob/c0d71a56dad0596d3c6a6b866e4338d25b597af2/docs/operations/platform-bootstrap.md)

```sh
umask 077
DATA="$CONSUMER-data"
pnpm --silent minimal-demo:data:roles "$CONSUMER" "$PHASE" > /private/db-phase.json
jq -e --arg name "$JOB" --arg operator "${OPERATOR_INPUT:-}" '
  def operatorEnv:
    ["FLEETIQ_BOOTSTRAP_ACTOR_ID", "FLEETIQ_BOOTSTRAP_AUTHORITY_ID",
     "FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT"] |
    map(. as $key | {name: $key, valueFrom: {secretKeyRef: {name: $operator, key: $key}}});
  . as $review |
  (if .phase == "installation" then "migrate"
   elif .phase == "bootstrap" and ($operator | length) > 0
   then "bootstrap-platform-operator --check-schema"
   else error("select an installation operation and its required inputs") end) as $command |
  .clients[$command] as $client |
  {name: $name, namespace: $client.namespace, deadlineSeconds: 300,
   podSpec: {
     securityContext: {runAsUser: 10001, runAsGroup: 10001},
     volumes: $client.volumes,
     containers: [{
       name: "operation", image: $review.backendSelection.backend.reference,
       imagePullPolicy: "Never", args: ($command | split(" ")),
       env: ($client.env + (if $command == "migrate" then [] else operatorEnv end)),
       volumeMounts: $client.volumeMounts,
       resources: {requests: {cpu: "100m", memory: "192Mi"},
                   limits: {cpu: "1", memory: "384Mi"}},
       securityContext: {readOnlyRootFilesystem: true}
     }]
   }}
' /private/db-phase.json > /private/db-operation.json
```

From the pinned provider checkout, use the same private state root, Docker
context and HTTPS port as the owned target. Inspect the offline preview and
retain its operation digest. The provider operator explicitly authorizes and
configures this exact operation using the [delegation procedure](https://github.com/stanimirivanov/k8s-infrastructure/blob/0d92be31e9c6a538bb9c2e69175deec2ec2f5089/docs/minimal-delegation.md#configure-and-inspect).
The renderer gives the Job one completion, zero retries, worker placement
and a runtime ServiceAccount without a mounted API token.

```sh
provider=(uv run --locked --offline python -m scripts.minimal_delegation)
selection=(--consumer "$CONSUMER" --docker-context "$DOCKER_CONTEXT"
  --state-root "$STATE_ROOT" --https-port "$HTTPS_PORT"
  --operation /private/db-operation.json)
"${provider[@]}" configure "${selection[@]}" > /private/db-operation-review.json
ATTEMPT=$(jq -er '.operation.launcher' /private/db-operation-review.json)
"${provider[@]}" job "${selection[@]}" > /private/db-job.json
```

From the deployment checkout, render the approved attempt's route. The
authorized network operator stages only this policy pair. The attempt label
and runtime ServiceAccount bind DNS and PostgreSQL access to this Job in the
selected data namespace. Retain `.networkAttempt.fingerprint` with the
provider's operation digest.

```sh
pnpm --silent minimal-demo:data:roles "$CONSUMER" "$PHASE" "$ATTEMPT" > /private/db-attempt.json
jq -e '{apiVersion:"v1",kind:"List",items:.policies}' /private/db-attempt.json > /private/db-attempt-policies.json
```

Submit using the separately provisioned kubeconfig for this exact launcher
ServiceAccount. Use the provider-authorized read-only Pod observer for terminal
evidence. The launcher reads the named Job directly. These commands use Bash
and keep full API responses in private files.

```sh
launch=(kubectl --kubeconfig "$LAUNCHER_KUBE" --context "kind-$TARGET" -n "$DATA")
observe=(kubectl --kubeconfig "$OBSERVER_KUBE" --context "kind-$TARGET" -n "$DATA")
"${launch[@]}" --request-timeout=10s create -f /private/db-job.json -o json > /private/db-job-create.json
JOB_UID=$(jq -er '.metadata.uid' /private/db-job-create.json)
deadline=$((SECONDS+360))
while (( SECONDS < deadline )); do
  "${launch[@]}" --request-timeout=5s get "job/$JOB" -o json > /private/db-job-status.json || exit 1
  jq -e --arg uid "$JOB_UID" '.metadata.uid == $uid' /private/db-job-status.json >/dev/null || exit 1
  if jq -e '.status.conditions[]? | select(.status == "True" and (.type == "Complete" or .type == "Failed"))' /private/db-job-status.json >/dev/null; then break; fi
  sleep 5
done
"${observe[@]}" --request-timeout=10s get pods \
  -l "batch.kubernetes.io/controller-uid=$JOB_UID" -o json > /private/db-job-pods.json
jq -n -e --arg uid "$JOB_UID" --arg target "$TARGET" --arg attempt "$ATTEMPT" \
  --arg digest "$(jq -er '.operation.digest' /private/db-operation-review.json)" \
  --slurpfile job /private/db-job-status.json --slurpfile pods /private/db-job-pods.json '
  $job[0] as $j | $pods[0].items as $items | $items[0] as $p |
  select($j.metadata.uid == $uid and
    $j.metadata.labels["k8s-infrastructure.io/demo-attempt"] == $attempt and
    ($j.status.conditions | any(.type == "Complete" and .status == "True")) and
    $j.status.succeeded == 1 and ($j.status.failed // 0) == 0 and
    ($items | length) == 1 and
    ($p.metadata.ownerReferences | any(.uid == $uid and .kind == "Job" and .controller == true)) and
    $p.spec.nodeName == ($target + "-worker") and
    $p.status.phase == "Succeeded" and ($p.status.containerStatuses | length) == 1 and
    $p.status.containerStatuses[0].restartCount == 0 and
    $p.status.containerStatuses[0].state.terminated.exitCode == 0) |
  {jobUid: $uid, podUid: $p.metadata.uid, node: $p.spec.nodeName,
   imageId: $p.status.containerStatuses[0].imageID, operationDigest: $digest,
   job: $j.metadata.name, namespace: $j.metadata.namespace, exitCode: 0}
' > /private/db-job-receipt.json
```

Allow up to seven minutes for the polling block with its five-second
request bounds. Use the operation digest and recorded image ID to review the
terminal receipt against the approved attempt and staged image. A failed or
missing receipt blocks the next phase. After observing a terminal outcome,
the provider operator withdraws the launcher grant and the network operator
removes the exact owned policy pair. Use a different approved attempt for
bootstrap.

After migration exits, execute the `grant` stage below while writers remain
fenced. It checks the exact ledger before applying transactional grants and
matches PostgreSQL roles and ACLs to the producer contract. It then uses the
restricted identities in a rolled-back transaction to exercise the replay and
semantic trigger queue handoffs, deferred checks, and operations across worker
boundaries. The reserved synthetic fixture never commits and does not
commission a product tenant. Run it before the original operator exists.

After the grant receipt passes, stop use of the migrator and retire its two
exact Secrets with the credential operator. In the reviewed `bootstrap` phase,
CNPG sets the owner to NOLOGIN and clears the password while retaining
ownership. Keep the named initdb Secret reference as part of the immutable
bootstrap spec. CNPG reads this custom reference while the Secret exists, so
leave the retired Secret absent. Run the `bootstrap` probe before launching
the bootstrap Job to verify withdrawal and the new restricted login.
[CNPG owner Secret reconciliation](https://github.com/cloudnative-pg/cloudnative-pg/blob/v1.30.1/internal/management/controller/instance_controller.go)

After checked bootstrap returns its expected product outcome, retire both
bootstrap Secrets and apply the reviewed `runtime` phase. Observe successful
CNPG reconciliation and confirm the two temporary credentials' Secret
withdrawal separately through the credential operator's exact object-identity
receipts. The database probe checks NOLOGIN, NULL password and no remaining
sessions, and it never reads Secret values from Kubernetes. Start checked
serving and workers with their individual credentials after the `runtime`
probe passes. Commission through authenticated FleetIQ requests and use actual
TCP-to-history progress to supply the retained observation.

## Installed command and receipts

Execution requires separate authorization for this named disposable
`qual-…-local` target, its exact primary UID and claim, and the specific
database stage. Prepare a directly owned 0600 kubeconfig with the reviewed
`kind-$TARGET` context on loopback, embedded CA and embedded client
certificate/key or token, a private request, a password file,
the public CA PEM, and the two verified producer JSON files. Use only
`psql` major 18 and the repository's pinned `kubectl`. Build the password
file privately from the exact active credentials using libpq's
`hostname:port:database:username:password` format. The hostname is
`fleetiq-db-rw.<consumer>-data.svc` and the port is the selected loopback
tunnel port. Keep the files and raw diagnostics outside Git.

Obtain separately authorized scoped reads for the named namespaces, worker,
CNPG Cluster and primary Pod, bound PVC and PV, and StorageClass. Obtain
provider-approved `pods/exec` for the exact primary for the local PostgreSQL
peer-authenticated witness. This can inspect role attributes including
password retirement without returning any credential material. It is separate
from the workload launcher and the routine reconciler. Missing permission is
an incomplete gate. Secure an operator-owned, loopback-only port-forward to
that same primary Pod. Verify the target UID immediately before opening it and
close it at the end of each stage. The local `psql` transport verifies the
reviewed CA and the service DNS identity, and checks the same running database
identity as the peer witness.

```sh
timeout 300s kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" -n "$DATA" \
  port-forward --address 127.0.0.1 "pod/$PRIMARY" "$PORT:5432"
```

In a separate terminal while the tunnel is open, select the phase request
using this shape. Use full UUIDs in all UID fields. The candidate is the
database role render's `.candidate` and the CA digest is SHA-256 of exact PEM
bytes with a `sha256:` prefix.

```json
{
  "consumer": "qual-example",
  "target": {
    "name": "qual-example-local",
    "namespaceUids": { "apps": "…", "data": "…", "support": "…", "system": "…" },
    "workerUid": "…",
    "clusterUid": "…",
    "podUid": "…",
    "claimUid": "…",
    "volumeUid": "…"
  },
  "candidate": "sha256:…",
  "stage": "grant",
  "caDigest": "sha256:…",
  "port": 15432
}
```

```sh
pnpm --silent minimal-demo:data:probe --execute --confirm-target "$TARGET" \
  --confirm-candidate "$CANDIDATE" --confirm-stage grant --kubeconfig "$KUBE" \
  --request /private/db-probe-request.json --grants /private/runtime-grants.v1.json \
  --inventory /private/migrations.json --ca /private/db-ca.crt \
  --passfile /private/db.pgpass --platform "$EXACT_PLATFORM_GIT_CHECKOUT" \
  > /private/db-grant-receipt.json
```

For the `bootstrap` and `runtime` stages use the same command with the
matching `--confirm-stage` and request. Omit `--platform`. For `before-restart` and `after-restart`, add
`observation` containing the same short `tenant` and `message` IDs. Select a
real message with one to sixteen history rows. Keep the authenticated
commissioning evidence independently and require it for installation acceptance.
The database receipt marks authenticated commissioning as unverified. After the pass, the provider-authorized installation operator restarts
only the observed PostgreSQL primary. Re-establish its readiness, record the
exact current Pod identity and reconnect the tunnel. Run `after-restart` with
`--previous /private/db-before-restart-receipt.json`. The probe verifies a
different postmaster start, the same retained volume and claim, the image,
and the identical observation fingerprint. Its sampled database connections
also must fit the candidate role ceilings and the aggregate nonproduct
allowance of 26. The probe checks the exact server reserves of zero regular
reserved slots and three superuser-reserved slots. Retain the separate
workload and pool peak qualification for installation acceptance.

The probe snapshots its private connection inputs for the duration of the run.
The gate uses a four-minute deadline, eight-second API requests, up to
22 seconds for a peer witness, four seconds for database connection, eight
seconds per SQL statement and two seconds per SQL lock. Kubernetes route
staging, Job creation, Secret retirement and restart each use their own
separately authorized procedures. Receipts contain only selected identities,
fingerprints, bounded measurements and check names.

## Failure and recovery

For an identity, TLS or authority refusal, compare the review, delegated
namespace, exact primary incarnation and certificate hostname. For a role
or ledger failure compare the reviewed database settings and producer grant
contract. Diagnose private details with the authorized owner. Preserve the
retained claim, prior receipts and successful ledger rows. A failed mutation
or ambiguous exit requires reviewed reconciliation or recovery before
resuming. Preserve ownership while replacing a failed credential, and only
re-enable a temporary role in a separately authorized window. Use the same
approved grants and database identities through recovery.
