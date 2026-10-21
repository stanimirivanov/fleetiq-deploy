# Prompt: unblock FleetIQ D06 consumer onboarding

## TL;DR

Historical request from 2026-10-19: I01-I04 are now merged. Use the
[current D06 readiness record](../operations/d06-readiness.md) before acting.
The original prompt below was addressed to the owner of `k8s-infrastructure`. It requests
provider-owned capability work, not FleetIQ workloads or a change to the retained
Perfeng environment. The detailed I01–I04 requirements remain in the
[original handoff](k8s-infrastructure-consumer-onboarding.md).

## Prompt for the owning project

FleetIQ has merged its immutable image interfaces, runtime/data Helm charts,
OCI package publisher and candidate/promotion contracts. Its D06 first persistent
Kubernetes installation is blocked by the provider prerequisites documented in
the consumer repository's `docs/operations/d06-readiness.md`.

On 2026-10-19 both your local checkout and GitHub main were still
`73a28e76059a880141f280c075aa563428396034` (PR 21). The inspected implementation
supports only `perfeng-local` / `kind-perfeng-local`, with Perfeng placement and
the existing namespaced Workflows add-on. Refresh this evidence before acting.
No live cluster inspection or ownership change was performed by FleetIQ.

Follow your own repository instructions and issue/PR workflow. Deliver these
cohesive capabilities, with I01 first and I02–I04 parallelizable after its boundary
is agreed. Use the full FleetIQ I01–I04 handoff for acceptance details:

1. **I01 — Qualified consumer and target profile.** Preserve Perfeng identity and
   retained state. Provide an explicitly selected FleetIQ/disposable profile or
   prove safe shared-cluster allocation without occupying reserved benchmark
   workers. Qualify ownership, placement/capacity, exact context and incarnation,
   dedicated access references and cleanup isolation. Reconcile stale cutover
   guidance without repeating the existing ownership cutover.
2. **I02 — Isolated delegated release capability.** Qualify disjoint FleetIQ
   Workflows controller/execution namespaces, single ownership of compatible
   shared CRDs, safe submission/template restrictions and narrow viewer/releaser/
   approver permissions. Qualify the shared Argo CD revision-override boundary.
   FleetIQ owns its templates and application release decisions.
3. **I03 — Enforced networking and trusted ingress.** Supply a supported,
   policy-enforcing CNI and maintained Gateway capability with exact versions,
   ownership and certificate/trust interfaces. Prove real allow/deny traffic,
   cross-consumer isolation, DNS/required egress and trusted/untrusted/wrong-host
   TLS behavior. Do not replace the retained cluster's CNI as an implicit repair.
4. **I04 — Persistent database/storage capability.** Qualify infrastructure-owned
   CloudNativePG/Barman controller APIs and storage capacity/access/retention.
   Prove neutral-fixture restart persistence and retained-data behavior. Return
   backup/evidence integration capabilities and their limitations; FleetIQ owns
   its database, secrets, schedules and later backup/restore acceptance.

Keep offline preview, explicit apply and explicit removal separate. Work against
an exact authorized target with bounded timeouts and ownership checks. Obtain
execution authorization for the concrete disposable profile before live creation
or controller changes. This prompt authorizes no retained-cluster mutation,
adoption, deletion, secret export, paid resources or automatic host trust changes.

Return the following non-secret handoff for each delivered capability:

- Merged immutable provider revision, supported profile and exact tool/API versions.
- Target name, context, cluster incarnation and dedicated kubeconfig **reference**;
  never kubeconfig bytes, tokens, Terraform state or Secret contents.
- Ownership/delegated permission map, placement/capacity, namespaces, storage,
  networking, trust and controller interfaces relevant to the capability.
- Actual qualification evidence with source/target identity, outcomes, failure
  cases and timestamps. Clearly list checks not run and capabilities unsupported.
- Resource footprint, persistence/recovery/removal limits and evidence that
  Perfeng state and access remain unchanged.

Use your existing human-readable v0 capability contract. A new cross-provider
machine framework is not a prerequisite. Do not put task-specific FleetIQ issue
text or FleetIQ workload desired state into the provider repository.

After the handoff is accepted, FleetIQ will select real producer publications,
register its protected activation source graph and execute D06's separate product,
isolation and persistence qualification. Provider CI alone does not complete D06.
