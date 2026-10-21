# D06 onboarding readiness

## TL;DR

D06 is blocked on provider qualification and accepted artifact selections.
D01–D05 source work is merged; the first persistent Kubernetes installation has
not been deployed or qualified. Give the infrastructure-owning project the
[focused handoff](../handoffs/k8s-infrastructure-d06-unblock.md), then return its
immutable revisions and non-secret qualification evidence before resuming D06.

## Evidence inspected on 2026-10-19

Both the clean local provider checkout and GitHub main resolve to
`73a28e76059a880141f280c075aa563428396034`, merged in provider
[PR 21](https://github.com/stanimirivanov/k8s-infrastructure/pull/21).
The recent PR list contains no later merged onboarding capability. This review
read tracked source and GitHub metadata only; it did not inspect kubeconfig,
private state, credentials, Kubernetes resources or persistent data.

| Prerequisite | Observed source evidence | D06 implication |
| --- | --- | --- |
| I01: Consumer/target qualification | `scripts/local_kind.py` fixes `NAME = "perfeng-local"`, context `kind-perfeng-local` and the Perfeng placement profile. | No independently qualified FleetIQ target, allocation, cluster incarnation or dedicated access handoff is established. |
| I02: Delegated release capability | `scripts/workflows.py` and its guide supply the namespaced Perfeng add-on; the guide selects Workflows `v4.1.5`. | No qualified FleetIQ controller/managed namespace, shared-CRD reuse, submission boundary or delegated release identity is established. The current delivery plan includes I02 as a prerequisite; D08 owns workflow execution integration. |
| I03: Network/TLS qualification | The inspected profile and capability guide do not supply FleetIQ NetworkPolicy enforcement, a qualified Gateway implementation or trusted consumer ingress evidence. | Namespace manifests alone cannot establish isolation or trusted HTTPS. FleetIQ must not replace the provider CNI or install shared ingress components implicitly. |
| I04: Storage/database capability | The provider describes storage handoff responsibilities but has no inspected FleetIQ-qualified CloudNativePG/Barman/storage profile or its persistence/retention evidence. | D06 cannot create the database custom resources against an assumed operator or treat local disk as qualified recoverability. |
| Published artifacts | The backend and UX `publish-image.yml` run queries and deployment `publish-release.yml` run query each returned an empty retained run list. | No producer publication receipts or full immutable release BOM were selected for D06. Registry inventory was not queried; any publication outside retained workflow history needs independently verifiable evidence. |

These are **missing qualification claims**, not an inventory of what might be
running on the host. Installed CRDs, healthy controllers, passing source CI and
an existing cluster name do not establish the required consumer capability.

The provider's
[v0 capability contract](https://github.com/stanimirivanov/k8s-infrastructure/blob/73a28e76059a880141f280c075aa563428396034/docs/architecture/substrate-capability.md)
allows a human-readable non-secret handoff and defers a shared machine schema
until multiple implementations justify it. Preserve that interface; do not
invent a provider framework in FleetIQ to bypass missing qualification.

## Work that must precede live installation

1. The provider owner delivers I01 and its exact target/ownership/capacity handoff.
   I02–I04 can develop independently after the consumer boundary is established.
   Follow the [detailed capability request](../handoffs/k8s-infrastructure-consumer-onboarding.md)
   and exercise their actual allow/deny, persistence and ownership gates.
2. Review the returned merged revisions and evidence. Record unsupported or
   unexecuted capabilities explicitly. Do not choose a paid fallback or adopt
   the retained Perfeng target to make installation proceed.
3. Select reviewed producer revisions and perform their existing authorized
   publication procedures. Obtain package/image digests, publication run/attempt
   identities, report hashes and the migration inventory. Publication must be
   explicitly authorized; this readiness review dispatches no workflow.
4. Assemble and verify the full release inventory through
   [D05 producer verification](release-packages.md). Configure private repository
   and registry read permissions through private channels when needed.
5. Implement D06 consumer registration, narrow AppProjects/Applications and
   preview-first bootstrap against the actual qualified handoff. Replace D05's
   temporary no-Argo-source-graph rule with registered protected-activation-ref
   validation and rejection tests; preserve candidate/main separation.
6. Execute the reviewed first-install path on the exact qualified target.
   Observe empty-target ownership, perform the explicit initial migration, then
   reconcile only approved Git revisions and digest-addressed packages.

Do not commit accepted Applications, active records or synthetic success receipts
while these inputs are absent. No provider/cluster mutation is part of this review.

## D06 completion evidence still required

- Exact target/context/cluster incarnation, namespace/resource ownership and
  delegated bootstrap versus release permissions verified before mutation.
- Real trusted HTTPS/OIDC configuration, SPA deep links and private API routing;
  neither a synthetic upstream nor unconfigured identity mode is acceptance.
- Controlled initial migration with the selected inventory; serving performs
  schema checks without DDL.
- Actual allowed and denied network probes, including cross-consumer denial and
  protection of backend/database Services.
- Seeded database data survives an owned Pod restart; retained resources remain
  protected during the reviewed cleanup/removal path.
- Wrong owner/context, stale receipt, foreign resources, missing trust and
  incomplete cleanup fail closed. Retain safe, source-bound qualification evidence.

D06 remains open in the [delivery plan](../exec-plans/active/kubernetes-gitops-deployment.md).
This prerequisite assessment is not an installation receipt or a live gate pass.
