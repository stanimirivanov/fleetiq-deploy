# ADR 0004 – Demo environment and shared database provisioning

Accepted on 2026-11-23.

The explicitly selected Kubernetes demo environment owns its resource budget,
fixture image and Secret references, installation phase selection, and migration
and bootstrap Job composition. Define each selection once and check the rendered
result against its intended behavior. This applies to the offline candidate
introduced in [PR #117](https://github.com/stanimirivanov/fleetiq-deploy/pull/117)
and the installation profile proposed in
[PR #119](https://github.com/stanimirivanov/fleetiq-deploy/pull/119).
Use the existing normal-profile renders as compatibility fixtures during the move.

Provisioning distinct database identities for multiple FleetIQ workers is a
shared product capability. Specify the normal installation that needs it,
the upgrade path from the existing single runtime role, and who provisions,
rotates, and withdraws credentials before changing the shared package.

**Ownership amendment, 2026-11-23.** This supersedes the original assignment
of the command-level grant contract to the platform. FleetIQ deployment owns
the executable PostgreSQL grants and their provisioning, including role
selection, credential retirement, and recovery. The platform owns command
compatibility with the documented privilege boundary, schema migrations, and
verified PostgreSQL TLS. A platform change that alters required privileges
needs coordinated deployment grants and scoped-command verification.

Deployment owns reviewed PostgreSQL SQL files for workload grants and shared
database checks. CloudNativePG `DatabaseRole` resources reconcile login roles
and Secret references. The approved Argo `WorkflowTemplate` runs the pinned
backend migration command and passes the checked-in SQL directly to `psql`.
Argo CD and the credential operator retain their existing cutover authority.
Use native SQL and Kubernetes resources for this workflow.

Qualify the exact backend image digest and deployment SQL revision together.
Exercise API, TCP ingestion, and replay under their scoped identities.
When the backend changes without a privilege change, reuse the SQL revision
with fresh compatibility evidence for the new image.

The demo installation in [issue #96](https://github.com/stanimirivanov/fleetiq-deploy/issues/96)
consumes this capability as a prerequisite. Use an ordinary Kubernetes
installation running the API, TCP ingestion, and replay workers as the first
acceptance scenario. The shared work covers writer exclusion before grants
commit, continued CloudNativePG monitoring access, and detection of unintended
grants outside the product schemas.

Enable a runtime login only when its workload is selected. An installation
running the API, TCP ingestion, and replay needs three runtime logins and
three workload URL Secrets. The full demo can select all eight runtime
commands. Migration and initial operator bootstrap use temporary authority.

Existing single-role installations adopt per-workload credentials through an
explicit upgrade. Until selected, existing local and nonlocal profiles render
their current manifests. Stage the new credentials before the maintenance
window. Stop writers and verify writer exclusion before applying pending
migrations and changing grants. Verify the grants, resume the selected
workloads under their scoped identities, and verify their operations.
Qualification must cover interruption after a migration commits. Inspect the
migration ledger and effective grants before resuming from the verified state.

The credential operator creates, rotates, and retires both the database
password Secrets and the namespace-local workload URL Secrets. The data
package references the database-side Secrets. Each client receives its own
URL Secret and the public database CA. The operator verifies that the old
login has no remaining clients before retiring it.

Verify the database prerequisite independently of worker packaging. Exercise
the published API, ingestion, and replay commands against disposable
PostgreSQL with distinct identities. Verify operator reconciliation and
monitoring on a separately authorized disposable CloudNativePG target.
[Issue #97](https://github.com/stanimirivanov/fleetiq-deploy/issues/97) then
verifies that the packaged worker Pods consume the intended Secrets and CA
and perform their operations.

## Operational JavaScript removal

The scope spans platform and deployment. Include local and hosted operations
that prepare, provision, publish, qualify, activate, or recover an installation
or release. Release-gating checks in CI are in scope. Product JavaScript and
ordinary application and browser tests follow their existing lifecycle.

Use PostgreSQL SQL and `psql`, CloudNativePG, Helm or Kustomize, Argo, Compose
and existing OCI tools where they express the operation directly. Keep custom
code limited to FleetIQ-specific checks that need it, such as binding reviewed
release evidence. Preserve protections, error outcomes and operator evidence
before retiring an existing entry point.

1. Deliver the native database upgrade in [deployment PR #121](https://github.com/stanimirivanov/fleetiq-deploy/pull/121).
   Keep TLS and command compatibility in [platform PR #459](https://github.com/stanimirivanov/fleetiq-platform/pull/459)
   and retire its proposed SQL generation and separate publication. Verify the
   reviewed backend and SQL pair on clean and interrupted upgrades before selecting it.
2. Replace the remaining [platform publication operations](https://github.com/stanimirivanov/fleetiq-platform/issues/464)
   and [deployment release tools](https://github.com/stanimirivanov/fleetiq-deploy/issues/124)
   in owner-reviewed slices. Coordinate the release evidence format and retain
   the existing protected promotion and recovery gates.
3. Replace [local installation and lifecycle operations](https://github.com/stanimirivanov/fleetiq-deploy/issues/123)
   and [qualification orchestration](https://github.com/stanimirivanov/fleetiq-deploy/issues/125).
   Ship verified replacements incrementally while preserving equivalent
   installation, cleanup, and recovery checks.
