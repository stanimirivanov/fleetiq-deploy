# D06 exact persistent-target preview

## TL;DR

The operator confirmed `C:\Users\sonof\FleetIQ\state\d06`. Four pinned-provider
offline previews passed; no cluster or ownership journal was created. This is a
review package, not live approval. Resolve disk, name/trust, phase-ref and private
installation prerequisites below before requesting an idle-window execution.

## Reviewed inputs

Use [target.json](../../environments/local-installation/target.json) and the
[initial delegation](../../environments/local-installation/delegation.json).

| Boundary | Selection |
| --- | --- |
| Provider | `stanimirivanov/k8s-infrastructure` at `41c558a54bc923fa69d7afc42bc663b763c3add5`; archive SHA-256 `95de6cf55807579b5f3e1f6e31ce1da4e12ca7ccc1063db7d523b5223fadc926` |
| Cluster / contexts | `fleetiq-local` / `kind-fleetiq-local` / Docker `desktop-linux` |
| Profile / durable state | `isolated-network-local` / `C:\Users\sonof\FleetIQ\state\d06` |
| Kubeconfig after creation | `C:\Users\sonof\FleetIQ\state\d06\.local\fleetiq-local.kubeconfig` |
| Ingress | `https://fleet.local.test:18443`; loopback `127.0.0.1:18443` to worker listener `8443` |
| Capacity | Two nodes, each 2 CPUs/4Gi, 2048 PIDs, no swap; bootstrap temporarily uncapped. Engine minimum 4 CPUs/12Gi. |
| Delegation | Workloads `fleetiq-apps`, `fleetiq-data`; database authority only in `fleetiq-data`; releases `fleetiq-releases`; provider controllers in consumer system namespaces. |
| Persistence | `fleetiq-db`, one instance, 2Gi `local-retained`; no deletion/rebind/recovery drill on the retained target. |
| Argo | Registered runtime/data projects; locked `refs/heads/environments/local/active`; manual sync. Reserved template `fleetiq-release-v1` is not installed; D06 uses `workflowTemplate: null`. |

The earlier AppData proposal was rejected by the canonical-path check: this Codex
installation resolves it into its package `LocalCache`. A newly prepared empty
cache directory remains unused; it contains no ownership journal. The selected
non-AppData directory is canonical, ordinary and private (inheritance disabled;
access limited to the current user and SYSTEM). No private file contents were read.

## Replay the native offline previews

Required tools: provider-pinned `uv 0.12.5`, locked Python 3.12 and dependencies.
The verified source export is at the exact path below; all 113 archive source
files matched their retained pinned archive bytes. Do not substitute another
working checkout. Commands omit `--execute`; do not add it during preparation.
The public delegation file is intentionally committed; no credentials enter it.

```powershell
Set-Location C:\Source\fleet-iq\fleetiq-deploy\target\d06-preparation\provider-41c558a
uv run --locked python -m scripts.consumer_kind up --profile isolated-network-local --consumer fleetiq --docker-context desktop-linux --state-root C:\Users\sonof\FleetIQ\state\d06 --https-port 18443
uv run --locked python -m scripts.network apply --profile isolated-network-local --consumer fleetiq --docker-context desktop-linux --state-root C:\Users\sonof\FleetIQ\state\d06 --https-port 18443 --hostname fleet.local.test
uv run --locked python -m scripts.database apply --profile isolated-network-local --consumer fleetiq --docker-context desktop-linux --state-root C:\Users\sonof\FleetIQ\state\d06 --https-port 18443 --delegation C:\Source\fleet-iq\fleetiq-deploy\environments\local-installation\delegation.json
uv run --locked python -m scripts.delegated_argo apply --profile isolated-network-local --consumer fleetiq --docker-context desktop-linux --state-root C:\Users\sonof\FleetIQ\state\d06 --https-port 18443 --delegation C:\Source\fleet-iq\fleetiq-deploy\environments\local-installation\delegation.json
```

Every report must say `execution: not-performed` and agree on the exact cluster,
contexts and state path. Database namespaces must be `["fleetiq-data"]`; Argo's
delegation digest must be `40700ac8e3c0990041e7b63a792b7d65a951ac724a7e91df146daa523b3275c8`.
Reports and their exact SHA-256/input bindings are retained locally under
`target/d06-preparation/exact-target-20261023/`. These are offline previews, not
health, cluster-incarnation, namespace-ownership or installation evidence.

## Preview evidence: 2026-10-23

Exact UTF-8 file-byte SHA-256 values (no JSON reserialization):

| Input / report | SHA-256 |
| --- | --- |
| `target.json` | `f27096f4db87a5ea2da10e0e60bfeb115e163499ecfeae8d08a01e0ee130ecd8` |
| `delegation.json` | `a842a94cfdf15ff6f7d5521905b05586e39954d3c0dcdba84ef15936b3af503a` |
| `cluster.json` | `8aef46ac54b9ebc7878691091107cfe6765bfe2249d18a7b43d81e3dc2e3a773` |
| `network.json` | `4ff74d045b3e46b143722fe4250e884fa0f86ad5e32896b0e8ecd2b1d5ae3715` |
| `database.json` | `236e3e7a09baea43b9b85835856764c39a7ef223408f2fd02f066ae71ca01765` |
| `argo.json` | `624ec6624e3551fe07e9a5ee5d16512a47ab84924fd27d5b74d4eafbf08f1107` |

All reports use provider revision `41c558a54bc923fa69d7afc42bc663b763c3add5`;
the source archive and extracted files were byte-checked before preview. Reports
assert no execution; they do not prove registry availability or live admission.

## Current installation preparation

The [staged approval](d06-installation-approval.md) adds a native-validated
namespace/quota package and replaces the earlier aggregate-only capacity estimate
with actual pinned provider placements. Follow [host preparation](d06-host-preparation.md)
for explicit disk/name/TLS actions. Historical observations below are not current
completion or live approval.

## Remaining prerequisites

| Gate | Observed status / required next action |
| --- | --- |
| Host capacity | On 2026-10-23: 4 logical CPUs, about 9.0Gi free physical RAM and 5.2Gi free on C:. Free additional disk before image extraction/builds; target 15-20Gi of extra headroom, then recheck actual Docker backing storage. This is a preparation recommendation, not a qualified disk quota. |
| Engine / target / port | `desktop-linux` responds, Linux engine, 4 CPUs/about 15.4Gi; zero containers with the exact `fleetiq-local` kind label; port 18443 not listening. Recheck immediately before execution; a label query is not an absent/owned-target proof. |
| Capacity acceptance | Steady main-container requests subtotal 1500m/2176Mi across 22 Pods. Their memory limits total about 8.5Gi, excluding kind/system, init, migrations and rollout overlap, above the 8Gi node envelope. Requests fitting does not prove capacity. Review staged/per-node readiness and aggregate limits; do not silently raise the profile or claim full-fit acceptance. |
| Name resolution | The normal host resolver cannot resolve `fleet.local.test`. The operator must map it to `127.0.0.1` before browser qualification. No hosts-file edit has been made. |
| Browser trust | Provision a matching certificate/key as `fleetiq-apps/fleetiq-tls` and explicitly trust its issuing CA in the browser/OS used for qualification. No CA key, certificate or trust-store change was made. Do not disable TLS validation. |
| Auth0 | Public discovery succeeds for the selected issuer and advertises Basic; application type, connection and Basic method are operator-confirmed. Both default private files exist to the native runtime; contents/validity remain unchecked. Follow [Auth0 onboarding](auth0-onboarding.md) for provisioning and the eventual browser gate. |
| Phase selection / Git protection | Main is readable; GET of `environments/local/active` returned 404. Prepare reviewed phase payload commits separately, establish the required locked-ref protection, then run [source verification](argo-source-graphs.md). No ref, protection or selection was changed. |
| Immutable release | Retain the verified release BOM `sha256:2d794c978f1a2b7ed59b5a1f96ea70a6d2182a843bbf30325e17efb3e43cd65e`; recheck producer/registry availability and evidence before live admission. No image/chart was rebuilt, retagged or republished here. |
| Actual network inputs | Observe target DNS/API-server destinations and CNPG/Cilium identities after creation; revalidate bounded issuer egress and rendered manifests. The earlier fixture API-server CIDR is not an installation input. |
| Operator authorization | Requires this exact target, effects, resource envelope, persistent retention and an idle benchmark window. State-path confirmation alone is not live approval. |

## Private installation prerequisites

Provision these only during an authorized installation; no Secret creation or
custom credential-copy/injection utility is part of preparation.

| Namespace / object | Required keys / source |
| --- | --- |
| `fleetiq-apps/fleetiq-oidc` Secret | `client-secret`: operator's private Auth0 file. |
| `fleetiq-apps/fleetiq-registry` Secret | Standard `kubernetes.io/dockerconfigjson`, key `.dockerconfigjson`: GHCR read-only credential for immutable private application images. |
| `fleetiq-data/fleetiq-migration-owner` Secret | `kubernetes.io/basic-auth`: `username` is `fleetiq_migrator` and unique `password`. |
| `fleetiq-data/fleetiq-database-runtime` Secret | `kubernetes.io/basic-auth`: `username` is `fleetiq_runtime`, with a distinct `password`. |
| `fleetiq-apps/fleetiq-runtime-database` Secret | `url`: TLS-verified runtime connection using the runtime login and actual database Service identity. No migrator password in this namespace. |
| `fleetiq-apps/fleetiq-database-trust` ConfigMap | `ca.crt`: public database CA; match the chart's trust volume and actual certificate. |
| `fleetiq-apps/fleetiq-tls` Secret | `kubernetes.io/tls`: `tls.crt`, `tls.key`, matching the browser hostname and reviewed CA. |

Bootstrap the three consumer namespaces with exact provider labels and reviewed
quotas first. Database capability establishes its own `database-storage` quota
and native admission before delegated Argo database rights. Keep provider and
consumer field ownership separate; never adopt an existing namespace by relabeling.
Run the 30 published migrations explicitly with the migrator role, then grant the
reviewed runtime privileges and bootstrap the initial operator using its private
subject. Serving must remain `serve --check-schema` with no startup DDL.

## Execution order and recovery

After the prerequisites and separate live approval: prove absent/exact ownership,
create the selected network cluster, bootstrap consumer namespaces, establish
database admission, install delegated Argo, provision trust/credentials, admit
reviewed phase sources, migrate/bootstrap and reconcile the approved runtime.
Then perform the [full D06 acceptance](d06-qualification.md): real TLS/OIDC, traffic
allow/deny, role separation and owned database-Pod restart persistence.

Keep state and node-local data on failure. Inspect retained ownership evidence;
resume only the identical owned target after review. Do not recreate or delete
the cluster to repair it. Retain storage is not off-host backup; D07 owns recovery
from node/host loss. No automatic rollback or disposable neutral drill is approved.
