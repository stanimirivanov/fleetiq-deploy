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
"$HELM" template fleetiq "$DEMO/operations" --namespace "$DATA" \
  --kube-version 1.35.0 --set operation=migration-route > "$PRIVATE/db-migration-route.yaml"
```

3. Stage the two immutable ConfigMaps and reviewed WorkflowTemplate. Register
   that exact template name through the provider's allowlist. Stage the rendered
   migration routes. Resume the approved provider Argo phase, submit the
   suspended Workflow bound to `RELEASE_DIGEST`, and have the independent approver
   release its suspension. Confirm the exact request, template and target.
   Wait at most 900 seconds for the workflow's `Succeeded`, `Failed` or `Error`
   outcome. Require all four steps to succeed and verify the exporter can still
   scrape. Preserve Workflow and Pod UIDs, step outcomes, publication and SQL
   identities and effective resource bounds. [Provider submission and approval](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/delegated-argo.md#submission-approval-and-identity)
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

```bash
"$HELM" template "$JOB" "$DEMO/operations" --namespace "$DATA" \
  --kube-version 1.35.0 --set operation=bootstrap --set-file "backend=$PIN" |
  pnpm exec yaml --json --single | jq -er '.data["operation.json"]' \
  > "$PRIVATE/db-bootstrap.json"
```

Pass the JSON to the provider's `minimal_delegation configure` offline
preview and `job` renderer. The provider returns the exact Job and approved
launcher digest. Use its `demo-launch-…` identity as `LAUNCHER`. Apply only
the reviewed route pair and submit the provider-rendered Job through its
scoped launcher. The ephemeral Job has a 300-second deadline and no retry
budget. [Provider operation approval](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/minimal-delegation.md#approve-an-operation),
[platform bootstrap contract](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/platform-bootstrap.md)

```bash
"$HELM" template fleetiq "$DEMO/operations" --namespace "$DATA" \
  --kube-version 1.35.0 --set "operation=bootstrap-route,attempt=$LAUNCHER" \
  > "$PRIVATE/db-bootstrap-route.yaml"
```

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

Run on the separately authorized target using the same primary service, its
public CA and a bounded client owned by the credential operator. For each
selected runtime identity, configure a mode-0600 private libpq service and
password file with `sslmode=verify-full`, `connect_timeout=5`, and the
matching role. Set `PGSERVICEFILE` to that file and `PGSERVICE` to its service
name. Use per-request timeouts in addition to the SQL timeouts.

```bash
timeout 30s psql -X -w -qAt --set=ON_ERROR_STOP=1 -f "$DEMO/probe.sql" \
  > "$PRIVATE/$PGSERVICE-role-receipt.json"
timeout 30s psql -X -w -At --set=ON_ERROR_STOP=1 -c \
  "SELECT version || ':' || encode(checksum, 'hex') FROM public._sqlx_migrations ORDER BY version" \
  > "$PRIVATE/observed-ledger.txt"
jq -r '.migrations[] | "\(.version):\(.checksum)"' "$MIGRATIONS" \
  > "$PRIVATE/expected-ledger.txt"
cmp "$PRIVATE/expected-ledger.txt" "$PRIVATE/observed-ledger.txt"
```

Repeat a bounded connection with `PGSSLMODE=disable` using identical known-good
credentials and require HBA rejection. If your libpq service sets `sslmode`
directly, override it in the connection parameters via
`--dbname="service=$PGSERVICE sslmode=disable"`. Use short-lived connection
test credentials and private diagnostic output. Confirm CNPG's effective
database container memory limit, live reserved connection slots and sampled
connections during the selected workers' measured service/administrative
activity. Distinguish samples from peak evidence. The scoped probe checks
actual ledger reads, expected role withdrawal, denial of DDL and role assumption,
and session measurements. The shared workflow verifies grant coverage and
exporter admission. [Worker Pod, replay and trigger handoffs](https://github.com/stanimirivanov/fleetiq-deploy/issues/97)

Commission a bounded synthetic tenant and its observation through authenticated
FleetIQ product APIs. Record the same tenant/device/message identities and
bounded observation before and after the separately authorized retained
restart. Compare the result, Cluster UID and exact PVC/PV UIDs. Require the
PostgreSQL start time to change and rerun the role and ledger probe. A new claim,
lost observation, missed sample, incomplete protected operation or failed
probe leaves the corresponding gate pending. Preserve data and sanitized
evidence on failures and keep credentials and raw diagnostics outside Git.
