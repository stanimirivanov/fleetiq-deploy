# Workload-selected PostgreSQL identities

## TL;DR

Select the same workloads in the runtime and data chart values. Stage their Secrets,
stop every writer, observe CNPG's maintenance admission rules, and use the
published `migrate` command under the temporary owner. Apply and verify the
reviewed grants before admitting writers. Withdraw temporary credentials and
verify the old login has no clients before retiring it.

## Inputs and ownership

For the ordinary API, TCP ingestion and replay installation, use this
`workloadDatabase` value in both charts.

```yaml
workloadDatabase:
  workloads: ["serve --check-schema", ingest-tcp, replay-worker]
```

The credential operator provisions, rotates and retires the Secrets. Run
`node tools/manifests/workload-database.mjs 'serve --check-schema' ingest-tcp replay-worker`
to list the references. In the data namespace create one
`kubernetes.io/basic-auth` Secret per selected role, with `username` matching
the role and a unique password. Create one corresponding URL Secret per
workload in its namespace, with key `url`. Use the CNPG read/write endpoint,
`sslmode=verify-full` and the public CA at `/etc/fleetiq/database/ca.crt`.
The runtime chart mounts its existing `backend.databaseTrust` ConfigMap and
selects the per-command URL for the API and any packaged analytics workers.
TCP ingestion and replay packaging consumes the corresponding references in
[#97](https://github.com/stanimirivanov/fleetiq-deploy/issues/97).

The data chart reconciles the selected logins under CNPG. Unselected roles have
`NOLOGIN` and no password. For a selection change, repeat the maintenance
cutover with the desired set. The fence removes admission for previously selected
roles and verification rejects any unselected role that can still log in,
connect or be assumed by another role. Ordinary values without
`workloadDatabase` keep the existing single-role path. The data chart still
uses its declared initdb owner and accepts the existing legacy role names.
Run the installation with PostgreSQL 18 and a CNPG release with the dedicated
`cnpg_metrics_exporter` role. The retained database is named `fleetiq`.

The reviewed producer revision is
`c0d71a56dad0596d3c6a6b866e4338d25b597af2`. Use published backend digest
`sha256:628ad77776211aab854e179feaceb700257c64c1286f9129807c308efc3901a1`.
The SQL renderer checks the SHA-256 of both published contracts under
`contracts/postgresql`. Updating one requires reconciling both against the
new image and requalifying command operations and trigger handoffs.

## Cutover

1. Stage the new workload Secrets and public CA before maintenance. Save the
   release selections, check the recovery point, and acquire the installation's
   release lock. Keep migration and bootstrap URL Secrets accessible only in
   the authorized operations context. On a fresh database, start with the
   temporary owner Secret for CNPG initdb.
2. Put the runtime and worker deployment owners in maintenance. Wait for old
   Pods, operations Jobs, external clients and old pools to drain. Configure the
   data chart with `workloadDatabase.maintenance: true` and
   `workloadDatabase.migrationLogin: true`. Wait for CNPG to reconcile and
   reload admission on all relevant instances. Prove a new runtime connection
   is rejected and the migration owner can connect over verified TLS. Suspend
   other administrative activity and prevent owner credential use outside this
   operation. CNPG's fixed local/replication rules still serve the operator.
3. Render and execute `fence` as the migration owner against the primary. The
   database connection grant for the exporter is installed in the same
   transaction as the revocation of PUBLIC and legacy admission. A connected
   foreign session or prepared transaction blocks the change. Investigate any
   unexpected direct CONNECT grant and establish its owner before proceeding.
4. Execute the pinned image's `migrate` with its owner-only URL injected by
   the credential operator. Wait for the command to close all sessions. Execute
   `grant` as the owner, then execute `verify`. Keep maintenance active.
   The grant transaction checks the complete ledger and exact producer grants,
   including the trigger handoffs and the absence of access to additional user
   schemas. Require an application-database metrics scrape after CONNECT changes.
5. For initial operator bootstrap only, turn off `migrationLogin` and turn on
   `bootstrapLogin` while leaving maintenance on. Reconcile the role state
   and prove owner rejection and bootstrap-only admission. Run the producer's
   `bootstrap-platform-operator --check-schema` with the temporary bootstrap
   URL and the approved operator identity. Keep the existing bootstrap state
   during a single-role upgrade.
6. Turn off both temporary login flags, keeping maintenance in place. Verify the
   temporary processes and sessions have drained, then withdraw their URL and
   password Secrets. Remove the migration owner's initdb Secret after initdb
   completes to prevent CNPG's application-password refresh from restoring it
   after a primary restart. The reference stays in the retained Cluster spec.
   Verify both roles are withdrawn after CNPG reconciliation. Keep schema
   ownership with the migration owner.
7. Apply the new client Secret references before lifting maintenance. Verify API
   readiness and authorized reads/writes, TCP acceptance, replay claim and
   completion, and checked ledger reads. Observe each workload's PostgreSQL
   login and confirm the legacy role has no remaining clients or sessions.
   Set `retireLegacy: true`, confirm it is disabled, and withdraw the old
   Secrets.

## Commands and interrupted upgrades

Generate SQL on a trusted workstation. The arguments are operation, current
database owner, current legacy role, and the same complete selected workload set.
Use an independently selected connection with private authentication or approved
local peer access. SQL contains role names and public ledger identities.

```bash
node tools/manifests/workload-database-sql.mjs inspect fleetiq_migrator fleetiq_runtime \
  'serve --check-schema' ingest-tcp replay-worker > inspected-ledger.sql
psql -X --no-password --set=ON_ERROR_STOP=1 --file=inspected-ledger.sql
```

Use the same invocation with `fence`, `grant` or `verify` as appropriate.
Use `withdrawn` and then `retired` through the operator's administrative
connection to the primary. These checks validate password absence without
returning passwords or role verifiers.

After an interruption, re-establish maintenance admission and identify the
current primary. Recheck the observed role state and run `inspect` for a
verified migration prefix. Run `verify` to test the complete ledger and effective
grants. If both match, the grant transaction committed and the operator can
resume with credential reconciliation. If only a verified prefix exists,
re-establish the fence and resume the identical image's migration. If the
complete migration committed but grants did not, recheck the fence and run
`grant`. An unexpected grant or ledger mismatch needs investigation before any
retry. Keep maintenance in place while the result is uncertain. Restore only
through the reviewed recovery procedure.
