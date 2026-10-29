# D06 staged persistent-installation approval


## TL;DR

This is a concrete execution proposal, not approval. The namespace/quota package
is implemented and offline-validated. Host disk/name/TLS and protected phase
sources remain outstanding. Foundation creation and complete application release
have separate hold points; no phase may silently continue past a failed gate.

Linux migration: `/var/lib/fleetiq/d06` and Docker context `default` are proposed
inputs, pending operator confirmation. Earlier host preparation and preview
evidence do not qualify this Linux target. Re-run provider previews and capacity,
path ownership, TLS and identity checks before requesting live approval.

## Fixed target and artifacts

Use the [proposed target](../../environments/local-installation/target.json),
[delegation](../../environments/local-installation/delegation.json) and
[exact preview](d06-target-preview.md). State is
`/var/lib/fleetiq/d06`; Docker is `default`; cluster/context
is `fleetiq-local` / `kind-fleetiq-local`; HTTPS is loopback 18443 to listener 8443.
Two nodes remain capped at 2 CPUs/4Gi and 2048 PIDs each after creation; initial
kind bootstrap is temporarily uncapped. No larger profile is proposed here.

The [bootstrap package](../../environments/local-installation/bootstrap/kustomization.yaml)
contains exactly `fleetiq-apps`, `fleetiq-data`, `fleetiq-releases` and one
consumer-owned quota per namespace. It declares consumer labels, versioned
restricted Pod Security and retention annotations. Those labels are intent, not
permission to adopt an existing namespace. The provider separately owns its
`database-storage` quota and fail-closed admission; no provider quota is overwritten.
Namespace quotas constrain admission; their sum is not reserved node capacity.

Run `pnpm installation:check` before approval. It runs actual pinned Kustomize
and strict schemas, then checks the complete six-object policy. The existing
`pnpm manifests:check`, structural and package gates include the same sensor.
No controller, Secret, workload, migration or Argo resource is in the package.

## Prepared byte identities

| Input / artifact | SHA-256 |
| --- | --- |
| `kustomization.yaml` | `sha256:aac83b5ea6fc784e9059d125ce433cae758871e16948cab5ec786677c6821c5e` |
| `namespaces.yaml` | `sha256:4a816a604fd8a073733ab6cd5b73f132617e7b9d45fa863eeea6ce77a5bb0298` |
| `quotas.yaml` | `sha256:f0874eca4c51a8bfbf569a3f347a7346fd0686a2bb3cd51b3e64ca617ce89765` |
| `bootstrap.yaml` | `sha256:e686b3ae2220954bd2d6cf76dc16eef06d6b044b6c623bec8cc157f3eb17a14c` |
| `provider-capacity.json` | `sha256:a3b159d3141b80aaf1987bd917660d0403be6978fd716c2c982b943c981fd22d` |

The public receipt is retained at
`target/d06-preparation/approval-20261023/bootstrap-preparation.json`. Its earlier target digest is stale after the Linux migration; regenerate it with
six valid schemas and current target/delegation digests. It grants no ownership or
execution authority. Rebuild and compare bytes from merged source before approval.

## Prerequisites before any live stage

1. Merge this PR with passing CI and bind the selected source and rendered bootstrap bytes to the approval record.
2. Complete disk/idle-window preparation from [host preparation](d06-host-preparation.md); hostname/TLS setup is required before Stage B, not to create the foundation. Recheck actual free host/engine resources; an engine maximum is not available capacity.
3. Reconfirm the selected provider archive/source, immutable release BOM and independent publisher/registry evidence. No new application image/chart is required for this bootstrap slice.
4. Confirm the idle benchmark window and exact target effects below. An earlier disposable qualification or state-path confirmation is not live approval.

## Capacity evidence and hold points

All pinned upstream Argo/database/network assets were downloaded, checksum-checked
and rendered without cluster access. Seventeen workload objects expand to nineteen
provider Pods; every provider workload has an explicit role selector. The report
is retained under `target/d06-preparation/approval-20261023/provider-capacity.json`.

| Node role | Provider Pods | Main-container CPU requests | Memory requests | Memory limits |
| --- | ---: | ---: | ---: | ---: |
| Control plane | 5 | 300m | 512Mi | 1664Mi |
| Worker | 14 | 800m | 1280Mi | 5632Mi |

These totals exclude kind/system, application/database Pods, init-container peak,
Pod overhead and rollout overlap. Four Cilium init-container definitions omit
individual CPU/memory limits; outer node caps still apply. The report does not
claim every container has a limit or that simultaneous maxima fit.

Argo contributes 3456Mi of the worker's main-container limits. Before Argo,
network/database controller limits on that worker total 2176Mi; system/init
headroom still needs live observation. With Argo, 5632Mi already exceeds the
worker's 4096Mi cap before FleetIQ's database/backend/edge. CPU limits are also
oversubscribed. Requests fitting is not a full-stack capacity qualification.
Approve a bounded foundation stage first; pause before Argo/application rollout.
If observed placement/peak or pressure is unsuitable, stop and review an explicit
provider profile change; do not patch the node budget or reduce controls locally.

## Stage A: foundation proposal, not yet authorized

Effects: create only the absent named two-node target; install its pinned Cilium,
Envoy/Gateway and shared APIs; establish consumer namespaces/quotas; install the
pinned certificate/database/storage controllers and selected database admission.
Ten provider Pods request 650m/1216Mi before kind/system overhead. Certificate
controllers may generate their internal in-cluster TLS Secrets; no consumer
credential is provisioned or exported and no host trust store is changed. No
FleetIQ database, Argo controller, application, SQL or active ref is created.
Preserve state on failure; no destruction, adoption or engine restart is included.

1. Native preflight must prove absent target/state or exact original ownership. Never interpret an empty label query or desired namespace labels as proof. Record the target's new incarnation through the provider's public handoff, not a raw journal export.
2. After separate approval, use the exact provider command from the [preview](d06-target-preview.md) with `consumer_kind up --execute`. The implementation installs Cilium as part of creation; do not perform a competing CNI install. Recovery of a partial creation requires inspected ownership and the identical provider `network apply --execute` path.
3. Prove provider base/network readiness and observe each node's limits, allocatable resources, actual placement and pressure. Stop on pressure, failed readiness, identity mismatch or resource drift.
4. After proving all three namespaces absent, create only the three reviewed Namespace objects with the dedicated kubeconfig/context and field manager `fleetiq-bootstrap`. If any creation returns AlreadyExists or fails, stop before quotas. Record all three newly created namespace UIDs against the target incarnation; verify those same identities before creating the quota objects. On retries, stop for an explicit ownership/reconciliation review; do not adopt, relabel or automatically apply to an existing namespace.
5. Use provider `database apply --execute` with the same target and committed delegation. It installs its operators, retained StorageClass, native admission and separate `database-storage` quota before database Argo authority.
6. Stop. Retain safe provider handoffs and actual API-server/DNS/operator identities. Check capacity again before proposing Stage B. No `down`, delete/rebind drill or disposable `qualify` command belongs to this retained target.

The two creation commands below use the exact source-byte digests listed above;
the pure local Kustomize package validates their complete six-object composition.
They are shown for review only. Do not paste both commands as an unattended batch.

```bash
kubectl --kubeconfig /var/lib/fleetiq/d06/.local/fleetiq-local.kubeconfig --context kind-fleetiq-local create --field-manager=fleetiq-bootstrap -f /path/to/fleet-iq/fleetiq-deploy/environments/local-installation/bootstrap/namespaces.yaml
```

Stop on nonzero exit or AlreadyExists. Obtain and retain the new namespace UIDs
and recheck them against the same cluster incarnation before the quota step:

```bash
kubectl --kubeconfig /var/lib/fleetiq/d06/.local/fleetiq-local.kubeconfig --context kind-fleetiq-local get namespace fleetiq-apps fleetiq-data fleetiq-releases -o json
```

Only after that ownership checkpoint succeeds:

```bash
kubectl --kubeconfig /var/lib/fleetiq/d06/.local/fleetiq-local.kubeconfig --context kind-fleetiq-local create --field-manager=fleetiq-bootstrap -f /path/to/fleet-iq/fleetiq-deploy/environments/local-installation/bootstrap/quotas.yaml
```

These writes are not an atomic transaction. Preserve partial creations, stop on
identity changes and review the exact owned objects before any retry. No command
in this procedure grants permission to reconcile an existing namespace by name.

## Stage B: hold for observed inputs and separate approval

Before any Argo/application activation, require all of the following:

- Accept actual capacity or review a provider-owned profile change; no implicit overcommit acceptance.
- Render the verified immutable charts using observed target API/DNS/issuer destinations and reviewed values. The earlier fixture CIDR is not a real input. Validate normal and maintenance phases against the complete manifest policy and schemas; retain exact package/value/render hashes.
- Prepare reviewed phase commits and the locked activation ref, then run [source verification](argo-source-graphs.md). The ref still returns 404; no ref/protection has been created. GitHub private-repository protection support and Administration read permission must be available. [GitHub documents the supported plans](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). A 404 for unprotected main does not prove protection is configured.
- Provision the [listed private prerequisites](d06-target-preview.md#private-installation-prerequisites) only after authorization. Also register Argo's Git credential: Secret `fleetiq-gitops-system/fleetiq-deploy-source`, type `Opaque`, label `argocd.argoproj.io/secret-type: repository`, keys `type=git`, `url=https://github.com/stanimirivanov/fleetiq-deploy.git`, `username` (GitHub actor), `password` (read-only repository credential). This is separate from GHCR pull access; never commit its values.
- Install delegated Argo only after database admission and capacity checks. Admit the exact closed project/application graph, protected source revision and current target incarnation. Do not enable automated sync or source overrides.
- With application writers absent, execute the published migrations with the migrator role, grant reviewed runtime privileges and bootstrap the initial operator privately. Scope migration/bootstrap credentials to the release namespace, never the serving Pods.
- Reconcile only the reviewed normal phase and perform the complete [D06 acceptance](d06-qualification.md): real trusted HTTPS/OIDC, private Services, network allow/deny, runtime DDL denial and owned database-Pod restart persistence.

## Recovery and completion

A failed stage retains its private state and node-local data. Resume only an
inspected, identical owned target. No automatic rollback, PVC deletion, cluster
recreation, changed ownership or force apply is authorized. D07 owns off-host
backup/restore; local Retain does not survive node/host loss. D06 remains incomplete
until Stage B and all live acceptance gates pass.
