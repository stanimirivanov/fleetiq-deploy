# Handoff prompt: qualify the Kubernetes substrate for FleetIQ

Status: Proposed request to the project that owns `k8s-infrastructure`.

## TL;DR

- Give the instructions below to the infrastructure-owning project.
- Extend its neutral consumer capability; do not move FleetIQ application code,
  secrets, promotions or release templates into the infrastructure repository.
- Preserve existing Perfeng state and permissions. No live apply, adoption,
  cluster replacement or non-local spending is authorized by this request.
- Return immutable merged provider selections and evidence for each capability.
  An open branch, successful render or installed CRD is not live qualification.

Related: [FleetIQ target architecture](../architecture/kubernetes-gitops-deployment.md)
and [delivery sequence](../exec-plans/active/kubernetes-gitops-deployment.md).

## Instructions for the owning project

Act as the maintainer of `k8s-infrastructure`. FleetIQ intends to consume your
local Kubernetes/Argo CD substrate using Helm OCI packages and Kustomize, with
Argo Workflows executing bounded releases. FleetIQ needs the same packaging and
release technology for future secure, recoverable, upgradeable, multi-user
non-local deployments. Prepare changes through your repository's normal reviewed
workflow; split the four coherent local onboarding slices below. Do not execute
live changes to an existing environment merely because this prompt was supplied.

### Evidence and conflicts to resolve first

During this review on 2026-10-17, [PR 21](https://github.com/stanimirivanov/k8s-infrastructure/pull/21)
merged as `73a28e76059a880141f280c075aa563428396034`. Initial source inspection
used `feature/issue-20` at `ae4a447bfb05186bf8d7c4bbce13adcefa051180`;
the final plan uses the merged Workflows capability as its starting point.
Do not create a competing installer or mistake merged source for a qualified
live consumer installation.

- `scripts/local_kind.py` validates only `perfeng-local`,
  `kind-perfeng-local` and the existing three-node Perfeng placement profile.
- `scripts/workflows.py` fixes the controller/server namespace to
  `argo-workflows`, uses `--namespaced`, and rejects pre-existing shared Workflow
  CRDs when its owned namespace is absent. It cannot simply be run again to
  create a second consumer controller.
- `docs/architecture/substrate-capability.md` promises only a human-readable v0
  handoff and prohibits consumer workload/credential ownership here. Preserve
  that boundary; a premature cross-provider machine framework is unnecessary.
- Local-kind/Argo CD guides still say the operator cutover is pending, while
  `perfeng-environment/docs/local-infrastructure-release.md` records an accepted
  cutover and its lock selects provider
  `5970bffa1f3d200e73d5a55e0cd4ef34ed9ef3b7`. Reconcile the records against actual
  immutable adoption; do not rerun or undo the cutover.
- No inspected source establishes a FleetIQ placement/capacity allocation,
  enforced cross-consumer NetworkPolicy, trusted application ingress,
  recoverable storage or secure multi-user release service.

Refresh these observations against current main before implementing. Do not
change hashes to make a validator accept an unreviewed provider.

### I01: Consumer onboarding and independently qualified target profiles

Deliver a documented FleetIQ consumer contract and explicit local qualification
profile without weakening the preserved Perfeng compatibility identity.

- Keep cluster lifecycle/controller ownership here. FleetIQ owns its namespace
  desired state, application Secret references, AppProjects/Applications,
  database custom resources, release templates and product acceptance.
- Support an explicitly selected FleetIQ/disposable target profile as well as
  the retained Perfeng profile; do not hard-code all consumers to the same
  cluster/state root or infer an existing cluster may be adopted.
- For shared-cluster operation, qualify a FleetIQ placement/capacity envelope,
  quotas and access without occupying Perfeng's reserved benchmark workers.
  Account for controller overhead and host resource contention. If that cannot
  be proven, return the blocker and a reviewed separate-profile proposal using
  the same provider technology. Do not recreate the retained cluster or move its
  persistent workloads to obtain space.
- Return non-secret target identity, cluster incarnation, exact context,
  dedicated kubeconfig reference, provider revision, supported Kubernetes/node
  architectures, capacity/placement and readiness. Do not return kubeconfig bytes
  or copy Perfeng credentials into FleetIQ.
- Reconcile the stale cutover guidance and publish one current capability map.

Prove previews are offline and non-mutating, unsupported/mismatched/foreign
identities fail, unrelated resources remain untouched, and explicit cleanup
cannot delete another consumer's target or retained state.

### I02: Isolated FleetIQ release execution capability

Extend the merged Workflows add-on for an isolated consumer instance. Prefer
controller/server namespace `fleetiq-workflow-system`, with
`--namespaced --managed-namespace fleetiq-releases`; do not widen the existing
Perfeng controller to watch every namespace.

- Give shared Workflows CRDs and PriorityClass one explicit infrastructure owner
  and a reviewed compatibility/upgrade procedure. A second controller instance
  reuses verified compatible APIs; it must neither adopt foreign CRDs nor apply
  a competing cluster-scoped manifest. No broad cluster-admin binding.
- Document the two-phase namespace delegation: FleetIQ supplies its managed
  workflow namespace through approved consumer bootstrap; infrastructure binds
  only its controller permissions there. Label resource ownership explicitly;
  two reconcilers must not own the same Namespace/Role/ConfigMap field.
- Keep controllers disjoint and servers private. Return exact version,
  controller/managed namespaces, instance identity, readiness and bounded resource
  overhead. Controller ServiceAccounts do not get FleetIQ app/database credentials.
- Apply Secure template referencing and a narrow admission/submission boundary.
  FleetIQ owns approved release templates. Submitters may name an approved
  template and release digest, not override entrypoints, accounts, images,
  commands, volumes or target namespaces. Do not mistake a namespace Role or
  Secure referencing alone for complete safe submission.
- Define delegated viewer/releaser/approver permissions, short-lived automation
  identity, audit and controlled resume. Support the interfaces needed for
  persistent evidence without using FleetIQ's app database as the recovery log.
- Review the shared Argo CD revision-override boundary. Qualify
  `application.sync.requireOverridePrivilegeForRevisionSync` and deny general
  manifest/revision override to release principals. Any global setting change
  needs compatibility evidence for existing Perfeng operators. FleetIQ will sync
  only desired sources already bound to approved selections.

Prove a FleetIQ release template runs with its own minimal executor identity,
Perfeng workflows are unchanged, cross-namespace execution/Secret access and
submission overrides are denied, controller restart is recoverable, foreign or
incompatible CRDs are refused, and removal of a consumer instance preserves
shared CRDs and the other consumer. Test template restrictions, not just rollout.

### I03: Qualified network and trusted TLS capabilities

Deliver a supported local profile with a policy-enforcing CNI and a maintained
Gateway implementation, plus a documented certificate/trust interface.

- Declare controller/CRD ownership and pinned versions. A NetworkPolicy object
  without actual allow/deny traffic evidence is not a qualified capability.
- Support a configurable local HTTPS origin without exposing the Kubernetes API,
  Argo servers, backend or database broadly. Non-local administration remains
  private/source-restricted; do not reuse a development port-forward as ingress.
- FleetIQ supplies HTTPRoutes, hostnames, certificate/Secret references and
  application policies. Preserve Host, Origin and browser cookies through the
  capability; backend OIDC trust remains FleetIQ's responsibility.
- Public trust material may be handed off; CA private keys and provider
  credentials may not. No insecure TLS flags, anonymous administrative access,
  wildcard project grants or automatic host trust-store changes.
- Treat CNI replacement or listener collision on the existing substrate as a
  reviewed maintenance/migration operation, not a repair during FleetIQ apply.

Prove trusted/untrusted/wrong-host TLS behavior, requested routing, actual
cross-consumer denial and required DNS/provider/registry egress. Report current
capabilities absent until their real boundary tests pass.

### I04: Qualified persistent storage and database operator capabilities

Provide a supported storage and CloudNativePG/Barman Cloud Plugin capability
profile. Pin and qualify the operator/plugin API versions instead of installing
an old deprecated object-store backup mechanism for convenience.

- Infrastructure owns cluster-wide operator/CRD installation and upgrades.
  FleetIQ owns Cluster/Backup/ScheduledBackup resources, databases, PVC selection,
  credentials, backup schedule/retention and restore acceptance.
- Return StorageClass/access mode, actual capacity, retention/reclaim/expansion
  semantics and failure-domain limitations. Prove retained data is not deleted
  with a consumer Application or controller instance.
- Declare backup/evidence endpoint and workload-identity integration capability
  without reading or exporting consumer secrets or creating FleetIQ buckets as
  an implicit provider action. A local endpoint/PVC is not off-cluster recovery.
- Do not store recovery metadata solely in the application database being
  restored. Define where provider/control-plane state can be recovered.

Prove provisioning, restart persistence, retention and operator/API readiness
with neutral fixtures. Provide the handoff needed for FleetIQ's separate seeded
backup/restore drill; controller health alone does not attest that drill passed.

### Required handoff and future non-local work

For each slice, report exact merged revision, supported profile/versions,
ownership/delegated permissions, capability evidence, live checks not run,
resource/cost footprint, recovery/removal procedure and unchanged Perfeng state.
Follow your own CONTRIBUTING/ADR/issue workflow. Keep this prompt in the consuming
project; do not commit task-specific handoff or issue text into provider docs.

A non-local profile remains a separate provider-owned deliverable: account/region,
private admin access, workload identity/SSO, encryption/key custody, durable
storage/failure domains, off-cluster backup/evidence and measured recovery, plus
cost eligibility and bounded spending policy. Obtain those choices and explicit
execution authorization when that project reaches the work. Do not select a paid
fallback, cloud account, cluster replacement or provider identity from this prompt.

FleetIQ will reject absent capabilities rather than repair your installation.
No FleetIQ images, Workflows, release selection, database migration or application
acceptance belongs in the provider repository.
