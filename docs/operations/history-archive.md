# Local archive worker

Use the reviewed backend producer that includes `fleetiq-server archive-worker`.
The local source lock and its verified build provenance select the application
image. Upgrade the backend and migrate the database before enabling the worker.
The locked worker source and reviewed publication are recorded in the
[packaging plan](../exec-plans/completed/m06-archive-packaging.md).

## Private configuration

Under the existing private instance directory, create `archive.json` with
exactly four settings.

```json
{
  "tenantId": "tenant-a",
  "endpoint": "https://archive.example/",
  "bucket": "fleet-evidence",
  "region": "us-east-1"
}
```

The endpoint uses HTTPS with a trusted certificate and an origin-only URL.
Provision the bucket separately. Give the storage identity permission to read
and conditionally create objects in the tenant's archive namespace. Keep the
single-line access key and secret in `archive-access-key` and
`archive-secret-key`. The instance directory must be private and the files
must be readable by the container UID. Keep both files inside that directory
with group and other writes disabled. Compose renders only their mount paths.

## Operation

Run `pnpm local archive-up <instance>` to select the overlay. The worker waits
for backend readiness, checks schema compatibility and processes one explicit
tenant under its lifecycle policy. The backend receives the same private storage
mounts for authorized restores. The worker has no host port and uses the private
database network plus an egress bridge. The bridge grants network connectivity
rather than per-destination enforcement.

Run `pnpm local archive-stop <instance>` to stop background archiving and
`pnpm local archive-restart <instance>` to restart it from the applied recipe.
The selection and lease remain durable after an interruption. Normal
`pnpm local up` starts the base services. To switch installation overlays, use
`pnpm local down <instance>` before selecting the next profile.

Archive publication leaves hot payloads intact. Reclamation requires separate
explicit platform approval and execution. Archive-provider failure leaves work
recoverable through its lease and retry rules.

## Verification

The deployment gate exercises the real worker's checked-schema startup,
graceful stop and restart with synthetic private mounts and an inactive archive
policy. The platform producer regression exercises interrupted durable
publication against PostgreSQL and S3. The [installed lifecycle runbook](history-lifecycle-qualification.md) describes the private provider and bounded recovery checks.
