# Minimal-demo PostgreSQL installation

## TL;DR

Render the three demo phases with the retained data chart. Stage the migration
phase, run the shared Argo fence/migrate/grant/verify sequence, and then run
the provider-approved Job for checked platform-operator bootstrap. Reconcile
the runtime phase and withdraw both temporary credentials before admitting
writers. Keep the exact target, publication, workflow and Job receipts. Run the
runtime probe and compare the commissioned observation across a retained restart.

## Prerequisites and identities

Select a disposable `qual-` consumer with separate execution authorization.
Confirm its target ownership, provider incarnation and kube context. The
provider supplies Cilium, PostgreSQL 18 with CNPG 1.30.1, Argo Workflows and
delegated namespaces, identities and admission. Apply the regular demo namespace
and deny/allow policies through the authorized network operator before creating
the Cluster. Keep product writers, the archive worker and simulator fenced
during installation. Use the worker image staging and release authority from
[provider Argo lifecycle](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/minimal-argo-lifecycle.md)
and [private networking](minimal-demo-network.md).

The [demo values](../../environments/minimal-demo/data.yaml) select a 256 MiB
PostgreSQL request, 768 MiB limit, 64 connections, verified TLS and a 4 GiB
claim on `local-retained`. These are qualification targets.
[Resource ledger](https://github.com/stanimirivanov/fleetiq-deploy/blob/75b65e1f7dab9b04e3c3e586797ff7cce15970b3/docs/capacity/minimal-demo-candidate-ledger.md)

The [backend selection](../../environments/minimal-demo/backend.json) records
the reviewed backend release and qualified deployment SQL revision. Retrieve
its publication archive and validate the archive, publication record and
`migrations.json` against the selected digests. Check the record's producer,
image, platform, run and attempt. Confirm the operation SQL bytes match the
qualified revision. Stage the exact two image references on the owned worker
through the provider's image procedure. A source or image change needs fresh
compatibility evidence. [Publication verification](release-packages.md#full-release-and-producer-verification),
[qualified workload identities](workload-database-identities.md#published-backend-qualification)

The selected producer's serving/worker pools total 34 without archive and 36
with archive. One serialized administrative operation adds up to two, leaving
26 of the 64 configured connections for nonproduct traffic and reserved slots.
Check real reserved capacity, health traffic, and observed connections by role.
The producer bounds migration at one connection and checked bootstrap at ten.
Fence archive and the simulator while performing routine administrative
operations. [Serving pool](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/crates/server/src/runtime.rs#L52),
[bootstrap pool](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/crates/server/src/bootstrap.rs#L129),
[migration pool](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/crates/server/src/migration.rs#L64)

## Render the phases

Run from a reviewed deployment checkout with pinned tools, Bash and `jq`.
`PRIVATE` is an existing mode-0700 directory outside Git. `CONSUMER` is
the exact reviewed consumer. Preserve the rendered phases with the evidence.

```bash
set -euo pipefail
umask 077
pnpm install --frozen-lockfile
pnpm manifests:install
pnpm verify manifests
DEPLOY=$PWD
HELM=$DEPLOY/target/tools/manifests/helm
KUSTOMIZE=$DEPLOY/target/tools/manifests/kustomize
DEMO=$DEPLOY/environments/minimal-demo
DEMO_OPERATIONS=$DEPLOY/charts/fleetiq-minimal-demo-operations
DATA=$CONSUMER-data
RELEASES=$CONSUMER-releases
PIN=$DEMO/backend.json
BACKEND=$(jq -er '.backend.reference' "$PIN")
POSTGRES=$(pnpm exec yaml --json --single < "$DEMO/data.yaml" | jq -er .image)
WORKLOADS=$(pnpm exec yaml --json --single < "$DEMO/runtime.yaml" |
  jq -ec .workloadDatabase.workloads)
for phase in migration bootstrap runtime; do
  "$HELM" template fleetiq charts/fleetiq-data --namespace "$DATA" \
    --kube-version 1.35.0 -f "$DEMO/data.yaml" -f "$DEMO/$phase.yaml" \
    > "$PRIVATE/db-$phase.yaml"
done
```

The credential operator owns the Cluster and separately reconciles
`DatabaseRole` resources. Record the Cluster, role and claim UIDs and available
CNPG conditions in each phase. Use the same Cluster and claim throughout.
The operator owns both namespace-local client credentials and CNPG password
Secrets. The names and logins in the phase renders are the provisioning contract.
[Workload-selected credentials](workload-database-identities.md#inputs-and-ownership)

## Migration and grants

1. Stage the data namespace's `fleetiq-db-migrator` basic-auth Secret and the release
   namespace's `workload-database-owner` Secret with key `password` for the
   same login. Publish the public database CA at `workload-database-ca`, key
   `ca.crt`, in the release and data namespaces. Reconcile the migration render.
   Wait up to 180 seconds for Cluster readiness and verify all eleven declared
   roles. Confirm the temporary owner is the only product login, every scoped
   runtime and bootstrap role exists as NOLOGIN, and the legacy role is disabled.
   Verify the PostgreSQL database OID through the owner connection using
   `SELECT oid FROM pg_database WHERE datname = current_database()`.
2. Have the release owner bind that OID, backend publication, SQL revision,
   selected workloads and intended phase to the reviewed request digest.
   `DB_OID` is the observed OID. The request below also binds the deployment
   revision, target, and each rendered database phase. Review the saved request
   before staging. `MIGRATIONS` points to the verified publication's `migrations.json` from the
   previous section. Populate a fresh private staging copy.

```bash
SQL_REV=$(jq -er '.qualifiedSqlRevision' "$PIN")
git diff --exit-code "$SQL_REV" HEAD -- operations/workload-database/base/sql
for phase in migration bootstrap runtime; do
  sha256sum "$PRIVATE/db-$phase.yaml" | cut -d' ' -f1
done | jq -Rn '[inputs | "sha256:" + .]' > "$PRIVATE/db-phase-digests.json"
jq -nS --arg target "$CONSUMER-local" --arg revision "$(git rev-parse HEAD)" \
  --argjson oid "$DB_OID" --argjson workloads "$WORKLOADS" --arg postgres "$POSTGRES" \
  --slurpfile pin "$PIN" --slurpfile phases "$PRIVATE/db-phase-digests.json" \
  '{target:$target, deploymentRevision:$revision, databaseOid:$oid,
    workloads:$workloads, postgres:$postgres, backendSelection:$pin[0],
    phaseDigests:$phases[0]}' > "$PRIVATE/db-reviewed-request.json"
RELEASE_DIGEST=sha256:$(sha256sum "$PRIVATE/db-reviewed-request.json" | cut -d' ' -f1)
cp -R operations/workload-database "$PRIVATE/workload-database"
cp "$MIGRATIONS" "$PRIVATE/workload-database/demo/inventory.json"
printf '%s  %s\n' "$(jq -er '.migrationInventory.digest | sub("^sha256:"; "")' "$PIN")" \
  "$PRIVATE/workload-database/demo/inventory.json" | sha256sum --check --status
(
  cd "$PRIVATE/workload-database/demo"
  printf '%s\n' "PGHOST=fleetiq-db-rw.$DATA.svc" PGUSER=fleetiq_migrator \
    "FLEETIQ_DATABASE_OID=$DB_OID" FLEETIQ_LEGACY_ROLE=fleetiq_runtime \
    "FLEETIQ_WORKLOADS=$WORKLOADS" "FLEETIQ_RELEASE_DIGEST=$RELEASE_DIGEST" \
    > reviewed-install.env
  "$KUSTOMIZE" edit set namespace "$RELEASES"
  digest=${RELEASE_DIGEST#sha256:}
  "$KUSTOMIZE" edit set namesuffix -- "-${digest:0:16}"
  "$KUSTOMIZE" edit set image "invalid.invalid/fleetiq-migrate=$BACKEND" \
    "invalid.invalid/psql=$POSTGRES"
  "$KUSTOMIZE" build . > "$PRIVATE/db-workflow.yaml"
)
```

3. Stage the two immutable ConfigMaps and reviewed WorkflowTemplate. Register
   that exact template name through the provider's allowlist. Choose a fresh
   `WORKFLOW_NAME` and submit a suspended Workflow with that explicit name, the
   reviewed template, and `RELEASE_DIGEST` through the approved release identity.
   Confirm the submitted object and retain its UID. Render the route for that
   exact name, review both policies in the same attempt, and have the authorized
   network operator install both before independent approval. Confirm the live
   selectors match the workflow name, executor account, maintenance component,
   and release namespace. On a retry choose a fresh name and review fresh routes.

```bash
"$HELM" template fleetiq "$DEMO_OPERATIONS" --namespace "$DATA" \
  --kube-version 1.35.0 --set operation=migration-route \
  --set-string "workflowName=$WORKFLOW_NAME" > "$PRIVATE/db-migration-route.yaml"
```

   Release suspension only after confirming the exact request, template and
   target. Wait at most 900 seconds for `Succeeded`, `Failed` or `Error`.
   Require all four steps to succeed and verify the exporter can still scrape.
   Preserve Workflow and Pod UIDs, step outcomes, publication and SQL identities
   and effective resource bounds. [Provider submission and approval](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/delegated-argo.md#submission-approval-and-identity)

4. Remove the temporary migration route after the workflow Pods terminate.
   Reconcile the bootstrap render, verify the owner is NOLOGIN, and have the
   credential operator retire the exact migration password Secrets. Preserve the
   initdb Secret reference in the Cluster and the owner role's schema ownership.
   Keep the release fenced after a failed or ambiguous step. The shared workflow
   checks interrupted migration prefixes, fencing, and transactional grants.
   [Recovery procedure](workload-database-identities.md#operate-the-upgrade)

## Checked operator bootstrap

The credential operator stages the bootstrap basic-auth and URL Secrets named
by the data render and operation, and creates `fleetiq-bootstrap-operator` using
the three producer-defined keys shown in the operation. Use a verify-full URL
with the exact Cluster service DNS and CA path `/etc/fleetiq/database/ca.crt`.
Observe the Cluster HBA and CNPG bootstrap role reconciliation. Leave all product
writers fenced. Choose a fresh provider Job name `JOB`.

Submit the reviewed `bootstrap` request through
[the administrative operator command](minimal-demo-administration.md#preview-and-submit).
Use the reviewed backend selection digest and stage the previewed bootstrap
route. The producer reads the temporary URL and three operator identity inputs.
[Platform bootstrap contract](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/platform-bootstrap.md)

Require exactly one succeeded Job Pod, the approved worker placement and an
exit-zero checked bootstrap reporting `platform operator bootstrapped`. For a
reviewed recovery attempt, `platform operator was already bootstrapped` requires
independent confirmation that the same intended identity was recorded.
Capture Job and Pod UIDs, image ID and the operation digest. On a failed or
expired Job, retain its outcome and recover under a fresh approved attempt.
Withdraw the launcher grant and both temporary route objects after the Pod
terminates. Reconcile the runtime render and observe NOLOGIN for the bootstrap
identity. Withdraw the bootstrap password, URL and operator input Secrets and
retain exact withdrawal receipts before admitting runtime writers. Keep the
provider's release controllers dormant during demo steady state when the
approved Argo lifecycle permits it.

## Runtime and retained restart qualification

Use the same primary Service and CA. Have the credential operator configure a
mode-0600 `PGSERVICEFILE` and password file with one service named for each
reviewed role, `sslmode=verify-full` and `connect_timeout=5`. Capture the
expected role names and the owner-observed `DB_OID` from the reviewed migration
request and runtime contract. Reuse these same files after restart.

```bash
jq -er '.databaseOid | select(type == "number" and . > 0)' \
  "$PRIVATE/db-reviewed-request.json" > "$PRIVATE/expected-database-oid.txt"
pnpm exec yaml --json --single < "$DEMO/runtime.yaml" |
  jq -er '.workloadDatabase.workloads[] | "fleetiq_" + (split(" ")[0] | gsub("-"; "_"))' \
  > "$PRIVATE/expected-roles.txt"
test -s "$PRIVATE/expected-roles.txt"
ENTRIES=$(jq -er '.migrationInventory.count' "$PIN")
test "$(jq -er '.migrations | length' "$MIGRATIONS")" = "$ENTRIES"
jq -er '.migrations | sort_by(.version | tonumber)[] | "\(.version):\(.checksum)"' "$MIGRATIONS" \
  > "$PRIVATE/expected-ledger.txt"

probe_roles() {
  local phase=$1 role
  while IFS= read -r role; do
    PGSERVICE="$role" timeout 30s psql -X -w -qAt --set=ON_ERROR_STOP=1 \
      --set="expected_role=$role" \
      --set="expected_database_oid=$(<"$PRIVATE/expected-database-oid.txt")" \
      --set="expected_ledger_entries=$ENTRIES" -f "$DEMO/probe.sql" \
      > "$PRIVATE/$phase-$role.json"
  done < "$PRIVATE/expected-roles.txt"
  PGSERVICE=fleetiq_serve timeout 30s psql -X -w -At --set=ON_ERROR_STOP=1 -c \
    "SELECT version || ':' || encode(checksum, 'hex') FROM public._sqlx_migrations ORDER BY version" \
    > "$PRIVATE/$phase-ledger.txt"
  cmp "$PRIVATE/expected-ledger.txt" "$PRIVATE/$phase-ledger.txt"
}
```

Repeat a bounded connection using the same known-good credentials and
`--dbname="service=fleetiq_serve sslmode=disable"`. Require HBA rejection and
keep diagnostics private. The probe checks the exact runtime login, database
OID, reviewed ledger count, role withdrawal, DDL denial and role assumption
denial. The shared workflow verifies grant coverage and exporter admission.

From an approved observation connection `OBSERVER_SERVICE` with full
`pg_stat_activity` visibility, sample all database client connections by role
and the live reserves. Retain samples with timestamps during bounded workload
and administrative activity. Verify the effective database container memory limit
is 768 MiB and check Pod restarts and termination reasons over the same window.

```bash
observe_db() {
  PGSERVICE="$OBSERVER_SERVICE" timeout 30s psql -X -w -qAt --set=ON_ERROR_STOP=1 \
    --command="SET statement_timeout = '8s'" "$@"
}
observe_db --command="
  SELECT json_build_object('sampled_at', clock_timestamp(),
    'max_connections', current_setting('max_connections')::integer,
    'reserved_connections', current_setting('reserved_connections')::integer,
    'superuser_reserved_connections', current_setting('superuser_reserved_connections')::integer,
    'clients', coalesce(json_object_agg(usename, sessions), '{}'::json))
  FROM (SELECT usename, count(*) AS sessions FROM pg_stat_activity
        WHERE backend_type = 'client backend' AND usename IS NOT NULL
        GROUP BY usename) AS counts" >> "$PRIVATE/db-connection-samples.jsonl"
```

Count the observation connection in nonproduct usage. Require the enabled
resident pool totals to stay within their reviewed 34/36 connections and the
serialized administrative operation to stay within its reviewed command bound.
Use `64 - superuser_reserved_connections - reserved_connections` as the ordinary
connection budget. At every sample, require ordinary slots to remain available.
For the steady-state envelope, add the reviewed 38 product and routine
administrative connections to the measured peak nonproduct usage and require
that total to fit in the ordinary budget. Measure bootstrap separately with
writers fenced. Report sampling interval, duration, covered roles and observed
peaks. Synthetic held connections exercise the database envelope. Whole-demo
fit requires observed real workers and their workload activity.
[Worker Pod, replay and trigger handoffs](https://github.com/stanimirivanov/fleetiq-deploy/issues/97)

### Capture the retained observation

Commission a synthetic tenant through authenticated `POST /api/v1/admin/tenants`
with the reviewed `provisioning_id`, `tenant_id` and
`initial_administrator_actor_id`. Use the operator's bearer-authenticated
`GET /api/v1/admin/tenants?limit=100` as the bounded observation. Set
`QUAL_TENANT` to the commissioned ID and keep the bearer and trust settings in
mode-0600 `CURL_CONFIG`. Use the same tenant and comparable observation after
restart. Any additional reviewed product fixture, such as a device message,
needs its own bounded stable read and comparison.

Set `KUBECONFIG_FILE` and `KUBE_CONTEXT` to the selected authorized target.
Have an operator authorized to read the retained storage metadata capture the
exact bound data claim `DB_PVC`, confirmed from the live primary's data volume.
Use the same observer connection to record the PostgreSQL system identifier.

```bash
kube_db() {
  timeout 20s kubectl --kubeconfig "$KUBECONFIG_FILE" --context "$KUBE_CONTEXT" \
    --request-timeout=10s "$@"
}
capture_retained() {
  local phase=$1 pv
  curl --disable --config "$CURL_CONFIG" --proto '=https' --fail --silent --show-error \
    --max-time 10 \
    --max-filesize 131072 "$PRODUCT_ORIGIN/api/v1/admin/tenants?limit=100" |
    jq -ceS --arg tenant "$QUAL_TENANT" \
      '[.. | objects | select(.tenant_id? == $tenant)] | select(length == 1) | .[0]' \
    > "$PRIVATE/$phase-observation.json"
  kube_db -n "$DATA" get cluster.postgresql.cnpg.io fleetiq-db -o json |
    jq -er '.metadata.uid' > "$PRIVATE/$phase-cluster-uid.txt"
  kube_db -n "$DATA" get pvc "$DB_PVC" -o json |
    jq -ceS 'select(.status.phase == "Bound") | {uid: .metadata.uid, pv: .spec.volumeName}' \
    > "$PRIVATE/$phase-claim.json"
  pv=$(jq -er '.pv | select(length > 0)' "$PRIVATE/$phase-claim.json")
  kube_db get pv "$pv" -o json |
    jq -ceS --arg uid "$(jq -er '.uid' "$PRIVATE/$phase-claim.json")" \
      'select(.spec.claimRef.uid == $uid and .spec.persistentVolumeReclaimPolicy == "Retain") |
        {uid: .metadata.uid, claimUid: .spec.claimRef.uid}' > "$PRIVATE/$phase-volume.json"
  observe_db --command='SELECT system_identifier FROM pg_control_system()' \
    > "$PRIVATE/$phase-system-id.txt"
  jq -er '.database_oid' "$PRIVATE/$phase-fleetiq_serve.json" \
    > "$PRIVATE/$phase-database-oid.txt"
  jq -er '.started_at' "$PRIVATE/$phase-fleetiq_serve.json" \
    > "$PRIVATE/$phase-postmaster-start.txt"
}
probe_roles before
capture_retained before
```

### Fence, drain, restart and verify

Fence all writers and new release activity. Stop the simulator and archive,
wait for in-flight operations to finish and close all producer connection
pools, including the backend used for the observation. Observe the affected
Pods terminate or the pools close before restarting. With the same observer
service, require no unexpected clients on `fleetiq`. Confirm the existing
exporter identity before allowing its short monitoring connections.

```bash
test "$(observe_db --command="SELECT NOT EXISTS (
  SELECT FROM pg_stat_activity WHERE datname = 'fleetiq'
    AND backend_type = 'client backend' AND pid <> pg_backend_pid()
    AND usename IS DISTINCT FROM 'cnpg_metrics_exporter')")" = t
primary_identity() {
  local primary
  primary=$(kube_db -n "$DATA" get cluster.postgresql.cnpg.io fleetiq-db -o json |
    jq -er 'select(any(.status.conditions[]; .type == "Ready" and .status == "True")) |
      .status.currentPrimary | select(length > 0)') || return
  kube_db -n "$DATA" get pod "$primary" -o json |
    jq -ce --arg claim "$DB_PVC" 'select(.metadata.labels["cnpg.io/cluster"] == "fleetiq-db"
      and .metadata.deletionTimestamp == null
      and any(.status.conditions[]; .type == "Ready" and .status == "True")
      and any(.spec.volumes[]; .persistentVolumeClaim.claimName? == $claim)) |
      {name: .metadata.name, uid: .metadata.uid}'
}
primary_identity > "$PRIVATE/before-primary.json"
```

With separate restart authorization, gracefully restart only the recorded
single-instance Pod. Apply the UID precondition and allow up to 180 seconds for
CNPG to replace it with a Ready primary mounting the same claim. Preserve the
Cluster and retained storage. If replacement is ambiguous, keep the installation
fenced and preserve the evidence. [Kubernetes DeleteOptions](https://kubernetes.io/docs/reference/kubernetes-api/definitions/delete-options-v1-meta/)

```bash
OLD_UID=$(jq -er '.uid' "$PRIVATE/before-primary.json")
PRIMARY=$(jq -er '.name' "$PRIVATE/before-primary.json")
jq -n --arg uid "$OLD_UID" \
  '{apiVersion: "v1", kind: "DeleteOptions", preconditions: {uid: $uid}}' \
  > "$PRIVATE/restart-delete-options.json"
kube_db delete --raw "/api/v1/namespaces/$DATA/pods/$PRIMARY" \
  --filename "$PRIVATE/restart-delete-options.json" > "$PRIVATE/restart-delete-result.json"
deadline=$((SECONDS + 180))
while (( SECONDS < deadline )); do
  if primary_identity > "$PRIVATE/after-primary.json" &&
      test "$(jq -er '.uid' "$PRIVATE/after-primary.json")" != "$OLD_UID"; then
    break
  fi
  sleep 2
done
test "$SECONDS" -lt "$deadline"
```

Recommission the checked backend only for the authenticated read, rerun all
role and ledger probes, and compare the retained evidence before reopening
writers.

```bash
probe_roles after
capture_retained after
for component in observation.json cluster-uid.txt claim.json volume.json system-id.txt database-oid.txt; do
  cmp "$PRIVATE/before-$component" "$PRIVATE/after-$component"
done
test "$(<"$PRIVATE/before-postmaster-start.txt")" != "$(<"$PRIVATE/after-postmaster-start.txt")"
```

A new claim, lost observation, incomplete drain, or failed probe leaves the
qualification pending. Preserve data and sanitized evidence and keep credentials
and raw diagnostics outside Git.
