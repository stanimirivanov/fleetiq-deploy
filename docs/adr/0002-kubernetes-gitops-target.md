# ADR 0002: Kubernetes packages and GitOps release orchestration

Status: Proposed. Date: 2026-10-17. Decision review: issue #3.

## TL;DR

- Use Kubernetes, Helm OCI packages, Kustomize, Argo CD and Argo Workflows as
  FleetIQ's local-to-non-local deployment architecture.
- Keep consumer selection and release authority in `fleetiq-deploy`; use
  `k8s-infrastructure` only for qualified substrate/controller capabilities.
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

Adopt the [target architecture](../architecture/kubernetes-gitops-deployment.md)
and deliver it through the [PR sequence](../exec-plans/active/kubernetes-gitops-deployment.md).
Producer CI publishes immutable images and packages; environment review selects
candidates. Guarded activation selects pre-reviewed Git phases. Argo CD alone
reconciles declared workloads. Workflows orchestrates bounded migrations,
approvals, sync/acceptance and retained release evidence.

`fleetiq-deploy` owns FleetIQ's promotion records. `perfeng-environment` continues
to own Perfeng selections. The infrastructure owner receives a separate
[capability request](../handoffs/k8s-infrastructure-consumer-onboarding.md).
No cluster/controller lifecycle implementation is copied into FleetIQ.

## Alternatives and consequences

Keep Compose for short-lived developer diagnostics until Kubernetes parity;
maintaining a second production release path would duplicate security/recovery
semantics. Tekton is a viable upstream build engine, and Dagger may make builds
portable, but neither is needed to orchestrate already published deployment
artifacts here. Add them only for a concrete producer-side need.

Argo Workflows adds controller/server and transient-Pod overhead. Explicit
capacity limits and isolation are therefore prerequisites, not deferred cleanup.
Helm/Kustomize do not provide atomic database releases or automatic rollback.
A failed migration retains maintenance/recovery-required state and needs a
reviewed forward fix or restored target. Local and non-local environments share
packages and release semantics while declaring different durability and access.

## Adoption and verification

This ADR does not authorize a live deployment or claim production readiness.
The plan distinguishes M02 local operation, M04 real browser qualification and
M08 non-local readiness. Pending PR #2 keeps its independent review and CI gates.
Runtime checks remain mandatory in the owning implementation slices; this change
checks documentation, references and source observations only.
