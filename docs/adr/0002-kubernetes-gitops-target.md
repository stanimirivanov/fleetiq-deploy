# ADR 0002: Kubernetes packages and GitOps release orchestration

Status: Accepted for the ownership and execution boundaries below.
Proposed 2026-10-17 in issue #3. Boundaries accepted 2026-11-26.

## TL;DR

- Use the shared Kubernetes substrate, Helm OCI packages and Argo CD for
  FleetIQ's local-to-non-local deployment architecture.
- The infrastructure provider owns Argo CD installation and readiness.
  FleetIQ owns its Applications, Projects and selected desired state.
- Use provider-scoped Jobs for bounded administrative operations. Select Argo
  Workflows only on qualified profiles that need the approved maintenance path.
- Evaluate Dagger for preparation and CI in #125 while the existing package
  check remains authoritative.
- Preserve the pending development installation; cut over only after real
  identity, upgrade/recovery and isolation qualification.

## Context

The pending [Compose installation PR](https://github.com/stanimirivanov/fleetiq-deploy/pull/2)
provides a bounded local foundation. The owner now wants production-compatible
packaging and operation from the start, using the existing infrastructure project.
That project has reusable kind/Argo CD lifecycle code and a merged namespaced Workflows
add-on, but second-consumer isolation and required capabilities are not established.
A local cluster is not evidence of secure or recoverable non-local operation.

## Decision

Use the [shared substrate handoff](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/architecture/substrate-capability.md).
`k8s-infrastructure` owns cluster lifecycle, dedicated access, substrate DNS
and storage, and installation and readiness of the pinned Argo CD release.
FleetIQ selects a published infrastructure revision and reviewed profile.
The handoff identifies the exact cluster, context, observed `kube-system`
UID and verified capabilities. Recheck the UID before mutating the target.

`fleetiq-deploy` owns its Projects and Applications, workload namespaces,
identities and Secrets, release selection, migrations and product acceptance.
Keep one writer for each resource's desired state. Producer CI publishes
immutable artifacts. Render the selected Helm packages into reviewed Git
phases and use the protected activation boundary in
[ADR 0003](0003-protected-rendered-activation-sources.md). Argo CD reconciles
only the selected desired state.

For [bounded administrative Jobs](https://github.com/stanimirivanov/fleetiq-deploy/issues/100),
use the provider's exact Job grant and native Kubernetes submission. FleetIQ
owns the named operation inputs, independent observations and retained
receipts. Preserve submission intent before create and inspect the original
Job after a lost response. Keep one-off Job instances outside continuous
reconciliation.

Retain the qualified database upgrade Workflow in
[ADR 0004](0004-demo-environment-and-database-provisioning.md) and the current
[guided maintenance release checkpoint](https://github.com/stanimirivanov/fleetiq-deploy/issues/111).
Argo Workflows is an optional provider capability with separate authority,
admission and capacity evidence. Scope it to the selected maintenance path.
Retain target-bound receipts off-cluster and retain evidence requiring
host-loss protection in encrypted off-host storage.

## Alternatives and consequences

Keep Compose for short-lived developer diagnostics until Kubernetes parity.
Use the bounded [Dagger package-preparation pilot](https://github.com/stanimirivanov/fleetiq-deploy/issues/125)
to evaluate reusable CI preparation. Cut over only after evidence for the
current gate's functional, resource, cleanup and caller parity is reviewed.
Dagger stays outside live release execution.

Argo Workflows adds controller/server and transient-Pod overhead. Explicit
capacity limits and isolation are prerequisites. The existing capped demo
uses controlled maintenance for Argo. A profile with resident Argo CD needs
its own measured fit under [#92](https://github.com/stanimirivanov/fleetiq-deploy/issues/92).
A failed migration retains maintenance/recovery-required state and needs a
reviewed forward fix or restored target. Local and non-local environments share
packages and release semantics while declaring different durability and access.

## Adoption and verification

Qualify each selected profile with the published infrastructure pin, then prove
operator submission, exact-target recovery and installed product acceptance.
The three-node OpenTofu handoff established substrate readiness in a working
checkout. FleetIQ release authority, product behavior, and the capped demo
envelope each require their own evidence.
