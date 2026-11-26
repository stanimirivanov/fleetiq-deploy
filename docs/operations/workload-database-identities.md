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

The credential operator provisions, rotates and retires the Secrets. Use the
references in the reviewed data and workload manifests. In the data namespace create one
`kubernetes.io/basic-auth` Secret per selected role, with `username` matching
the role and a unique password. Create one corresponding URL Secret per
workload in its namespace, with key `url`. Use the CNPG read/write endpoint,
`sslmode=verify-full` and the public CA at `/etc/fleetiq/database/ca.crt`.
The runtime chart mounts its existing `backend.databaseTrust` ConfigMap and
selects the per-command URL for the API and any packaged analytics workers.
TCP ingestion and replay packaging consumes the corresponding references in
[#97](https://github.com/stanimirivanov/fleetiq-deploy/issues/97).

CloudNativePG reconciles the workload and bootstrap logins through standalone
`DatabaseRole` resources. The Cluster continues to manage the migration owner
and the legacy login. Unselected roles have `NOLOGIN` and no password. Converge
those declarations before running the cutover. For deselection, keep the role
manifest and disable its login. The retain policy preserves the PostgreSQL role
if its Kubernetes object is accidentally removed.

The current protected local Argo data project permits Cluster resources and
network policies. Stage the new `DatabaseRole` objects through the separately
authorized data operator. Keep that opt-in authority outside the ordinary Argo
project. Verify the operator's `DatabaseRole` reconciliation status before
testing authentication. Ordinary chart values keep the existing single-role
path. This workflow targets PostgreSQL 18, the `fleetiq` application database,
and CNPG 1.30.1 with the dedicated `cnpg_metrics_exporter` role.

Select the backend image from the successful protected platform publication's
`publication.json`. Use the `migrations.json` from the same publication attempt
and verify its SHA-256 against the receipt's `inventory.digest`. Use the
[existing release verification and registry access procedure](release-packages.md#full-release-and-producer-verification).
The deployment-owned SQL is under `operations/workload-database/base/sql/`.
Qualify its reviewed Git revision and the exact backend digest together.

## Retained installation upgrade

### Prepare the reviewed release

Copy `operations/workload-database/` from the reviewed deployment revision
into release staging. Replace the synthetic inputs in its `example/` overlay
with the reviewed backend and PostgreSQL client digests. Copy the verified
`migrations.json` as `inventory.json`. Set the CNPG read/write service DNS,
live database OID, migration owner, legacy role, selected workload commands,
and release digest in `reviewed-upgrade.env`. Use the release digest as the
basis for a unique `nameSuffix`. The release request digest binds the backend
digest, deployment SQL revision and these reviewed selections. Keep the rendered
manifest and the overlay with the release evidence.

```bash
kustomize build operations/workload-database/example
```

This renders two immutable, content-named ConfigMaps and a versioned
WorkflowTemplate. The workflow controller owner registers that template name
with its existing namespace admission. Stage the three resources under the
approved template authority.

The credential operator stages `workload-database-owner` with key `password`
and `workload-database-ca` with key `ca.crt` in the workflow namespace. The
migration connection and psql operations use the same selected
username, service and verified CA. Give the workflow namespace only the
database route approved for this operation. The provider's existing
`release-executor` identity needs no extra API mutation privileges.

Before opening maintenance, verify that the `release-executor` Pods can pull
both pinned images. For a private backend image, have the provider supply
read-only registry access through its existing image-pull configuration.

### Operate the upgrade

1. Review the recovery point and acquire the installation release lock. Have
   the credential operator stage the workload identities. Activate the
   reviewed maintenance phase through Argo CD. Observe writer and Job drain,
   CNPG reconciliation and rejection of new runtime connections. Keep the
   temporary migration login available for the approved workflow.
2. Submit the reviewed template and release digest as the provider's suspended
   release request. The independent approver verifies the observed maintenance
   phase and starts the request. The workflow takes its namespace lock and runs
   fence, migrate, grant and verify in order. It validates the request digest
   and checks the database OID and owner before changing grants. View the
   workflow's step outcomes in Argo. Keep the runtime fenced on failure.
3. After success, retain the workflow UID, template, release digest and step
   outcomes with the phase receipts, along with the backend publication run
   and attempt, backend digest, inventory digest and deployment SQL Git
   revision. Check that CNPG can scrape metrics from the application database.
   Through reviewed desired state, withdraw the temporary
   credentials and switch clients to the scoped logins. Verify the selected
   workloads and confirm the legacy role has no remaining clients or sessions
   before the credential operator retires it. Observe the credential retirement
   and keep schema ownership with the migration owner.

An interrupted request is retained as evidence. Wait for its Pods to
terminate, confirm the same target and maintenance phase, and submit the
same template and release digest for fresh independent approval. The fence
checks the successful migration prefix and verifies that no other writer is
connected. The pinned migration command validates the committed ledger and
runs pending migrations. Grant application is transactional, and verification
checks the complete ledger and effective grants before writers return. Use a
reviewed recovery procedure if the database identity, ledger or ACL check fails.

## Published backend qualification

The first scoped upgrade pairs the backend at
`ghcr.io/stanimirivanov/fleetiq-platform@sha256:11bebfe12129c95bc2c3854b482c388190b324264ba660921907816da68c22b0`
with the deployment SQL at Git revision
`d269d16a4d23169e34042a29cb594b66c08d6e22`. The 59-entry migration inventory
has digest `sha256:67772e214e26fdc892b65b1636acd721d14ca1291bb49f1c209c9ffba8f64927`.
[Protected backend publication, attempt 1](https://github.com/stanimirivanov/fleetiq-platform/actions/runs/45691686449/attempts/1)

The disposable Kubernetes qualification covers the retained 58-to-59 upgrade
with CNPG 1.30.1 and Argo Workflows 4.1.5. The demo environment still needs
its own composition and installed acceptance before activation.
[Minimal demo database settings](https://github.com/stanimirivanov/fleetiq-deploy/issues/96)
