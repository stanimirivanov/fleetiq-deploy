# Minimal-demo private networking

## TL;DR

Render the three delegated namespaces and their scoped policies offline. Use the
provider's namespace-installation authority and the exact approved simulator
attempt. The installed probe requires separate authorization for a disposable
target. Run `ingestion`, `services` and `database` as separate fixture batches.
Collect the three phase receipts and the gateway and provider follow-on evidence
before closing the installed network gate.

## Ownership and flow contract

Use the [minimal-demo delegation](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/minimal-delegation.md)
for the provider-managed Cilium, Kubernetes, CNPG and namespace delegation. Check
that provider and target receipts refer to the same minimal-demo incarnation.
Apply namespace and network policy through the installation operator. The routine
reconciler can manage the routine-labeled private Service within its delegated
namespace. The operator owns policies and the bind ConfigMap. This composition
contains no new RBAC, Argo definitions, credentials, quotas or workload controllers.

| Network peer | Required route |
| --- | --- |
| Exact simulator attempt in `<consumer>-apps` | CoreDNS TCP/UDP 53, private `tcp-ingestion` TCP 55027 to Pod TCP 55027 |
| Ingestion and the named API/workers | CoreDNS and selected CNPG Pods on TCP 5432 |
| Edge | Backend TCP 8080 and CoreDNS |
| Notification worker | Alertmanager TCP 9093, plus its DB/DNS peers |
| Alertmanager | Receiver Service HTTPS 443 translated to receiver Pod TCP 8443 |
| Archive worker and backend | Object-store Service HTTPS 443 translated to object-store Pod TCP 9000 |
| Backend | Canonical issuer HTTPS 18443 through the local gateway listener TCP 8443 |
| Gateway ingress identity | Edge and issuer on TCP 8080 only |
| CNPG | Same-cluster peers, CoreDNS, selected operator ingress TCP 8000 and Cilium API-server identity TCP 6443 |

The simulator's policy selects the exact attempt label **and** its provider-created
`demo-run-…` ServiceAccount in the apps namespace. Ordinary controllers use a
different ServiceAccount and carry the provider's routine marker. Credential-bearing
network roles require that marker to be absent. Review the selected attempt digest
before rendering, verify the provider-approved operation is the simulator attempt,
and update the policy under the installation operator before any new attempt. A
same-name Pod or label by itself does not qualify. The policy follows endpoint
identity after Service translation. For the issuer, the reviewed private IPv4
address is an exact `/32` on HTTPS 18443 and the post-translation peer is Cilium's
local `host` identity on the owned worker on TCP 8443. Both addresses must serve
the same reviewed HTTPS witness through the canonical SNI and Host. No worker may
use an arbitrary cluster host or subnet as an issuer substitute.

Package the ingester with `app.kubernetes.io/name: fleetiq-ingest-tcp` and a
`FLEETIQ_TCP_BIND_ADDRESS` reference to key `FLEETIQ_TCP_BIND_ADDRESS` in ConfigMap
`fleetiq-ingest-tcp-network`. The explicit bind is `0.0.0.0:55027`. Use ordinary Pod
networking with no host port. The package and producer credentials remain part
of [TCP worker packaging](https://github.com/stanimirivanov/fleetiq-deploy/issues/97).
The listener uses the platform's [trusted identifier-routing TCP contract](https://github.com/stanimirivanov/fleetiq-platform/blob/5b31f959bb4a45611820aca72027959f74535e18/docs/operations/tcp-ingestion.md).
The simulator requires the literal configured name `tcp-ingestion` and validates
all IPv4 DNS answers before connecting. Private literal and arbitrary DNS inputs
remain outside that [producer contract](https://github.com/stanimirivanov/fleetiq-simulator/blob/cda938df36b468ef0296b2118e982ff3d417529a/src/transport/tcp.ts).

## Render and stage

Use a private directory outside Git and the selected clean deploy revision with
pinned dependencies and tools. The selection file contains exactly these keys.
The values below are illustrative. Select the exact consumer, the approved
launcher name from the provider and the actual reviewed private issuer address.

```json
{
  "consumer": "qual-fleet",
  "simulatorAttempt": "demo-launch-0123456789abcdef01234567",
  "issuerAddress": "172.18.0.4"
}
```

```sh
pnpm install --frozen-lockfile
pnpm manifests:install
pnpm verify manifests
umask 077
pnpm --silent minimal-demo:network:render /private/network-selection.json > /private/network.json
```

Separately authorize the provider target and intended mutation before staging.
Confirm the owned Docker context and Kubernetes target using the provider receipt.
Use the Namespace objects from `network.json` to prepare only absent workload
namespaces before provider delegation. After the provider verifies delegation,
stage the exact rendered default-deny rules first, then the named allows and
private Service and bind ConfigMap. Use `kubectl --kubeconfig "$KUBE" --context
"kind-$TARGET" --request-timeout=10s create -f FILE` only on an approved clean
stage, with an explicitly reviewed object subset. Existing object identities and
a partially installed policy must be reconciled by the authorized owner before
admitting a workload. Do not reuse the old preview, alter provider quotas, run on
an existing non-minimal profile, relabel a foreign namespace or rely on ordinary
reconciliation for the install stage.

Choose `PHASE=ingestion` for the initial network-only check. The positive
source uses the already admitted `demo-run-…` account in apps. The same-namespace
negative source copies the attempt label but uses `default`. The foreign source
copies the attempt label and ServiceAccount **name** into a separate owned
namespace. These sources have no Kubernetes API tokens. The foreign namespace's
second Pod runs a neutral TCP listener. First confirm the foreign source can
reach it, then test that simulator egress times out, then confirm the foreign
source still reaches it. The probe requires empty Kubernetes and Cilium policy
lists in that fixture namespace and an empty cluster-wide Cilium policy list on
the disposable target. Refer unexpected policies to the owning operator.

Choose `PHASE=services` for the neutral DB, router, backend, receiver and object
store routes. Before running this phase, have the authorized gateway operator
review the canonical in-cluster DNS name and the 18443-to-8443 mapping on the
owned worker. Stage one disposable HTTPS listener behind both addresses. It
must serve HTTP 200 at `/.well-known/fleetiq-network-witness` for the same canonical
SNI and `Host: <issuerHostname>:18443`. Use a dedicated leaf certificate and a
unique 1–4096 byte response body for the reviewed listener. Keep the witness
private key with the listener owner. Record the SHA-256 of that certificate's DER
bytes and the exact response bytes from the owner-reviewed setup. The probe
checks the leaf pin before sending the request and verifies both response
digests before and after the negative checks. Separate product TLS trust,
browser and real producer checks remain required under
[canonical demo TLS](https://github.com/stanimirivanov/fleetiq-deploy/issues/103)
and the other product acceptance issues.

Choose `PHASE=database` for the additional database clients and two neutral
same-cluster DB peers. It repeats the ingestion and TCP DNS checks, measures
Service and endpoint routes for all four clients and checks both directions on
the peer's TCP 5432 and 8000 ports.

On the exact capped worker, stage a reviewed immutable Python image using the
[provider staging procedure](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/minimal-database.md#scope-and-prerequisites).
Account for every fixture Pod before admission. Each requests 5m CPU and 16Mi
and is limited to 100m CPU and 32Mi. Run one batch at a time on an otherwise
unoccupied target of the same incarnation. Clean up each fixture batch before
starting the next, using the verified object UIDs. Preserve the fixture namespace
between phases if reusing its UID and clean up its per-batch contents first.

| Phase | Apps | Data | Support | Foreign | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ingestion` | 3 | 0 | 0 | 2 | 5 |
| `services` | 8 | 1 | 2 | 2 | 13 |
| `database` | 7 | 2 | 0 | 2 | 11 |

The maximum apps count is eight under the provider's 10-Pod quota. This
allocation covers neutral fixture Pods only. See the
[candidate ledger](https://github.com/stanimirivanov/fleetiq-deploy/issues/92#issuecomment-7071204249)
for product resource qualification.

```sh
pnpm --silent minimal-demo:network:render /private/network-selection.json "$PHASE" "$PROBE_IMAGE" > /private/network-probe.json
jq '{apiVersion,kind,items:[.items[] | select(.kind == "Namespace")]}' /private/network-probe.json > /private/network-probe-namespace.json
jq '{apiVersion,kind,items:[.items[] | select(.kind != "Namespace")]}' /private/network-probe.json > /private/network-probe-objects.json
# First batch only, or after the authorized owner removed the old namespace.
kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" --request-timeout=10s create -f /private/network-probe-namespace.json
kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" --request-timeout=10s create -f /private/network-probe-objects.json
```

Wait at most 60 seconds for fixture Pods to become Ready. Use an exact Pod name
from the rendered fixture with `kubectl --kubeconfig "$KUBE" --context
"kind-$TARGET" --request-timeout=65s -n NAMESPACE wait --for=condition=Ready
pod/NAME --timeout=60s`. Each Pod ends after 600 seconds with no restart, even if
the probe never runs. Keep setup and each phase within the authorized window.

## Run the installed gate

Prepare an owned 0600 request with the following fields. Get exact namespace and
worker UIDs from the reviewed target and verify them against recorded provider
ownership. Collect fixture Pod UIDs and `status.containerStatuses[0].imageID`
from the admitted Pods. Compare image IDs with the worker's digest-verified
staging receipt. Record the `sha256:…` component of each running ID; keep the
manifest digest reference in `probeImage`. Use the selected candidate digest.

| Request field | Value |
| --- | --- |
| `selection` | The exact object used in the offline render |
| `phase` | `ingestion`, `services` or `database` |
| `candidate` | Reviewed `sha256:…` candidate identity |
| `target` | `{ "name": "qual-fleet-local", "workerUid": "…", "namespaceUids": { "apps": "…", "data": "…", "support": "…", "system": "…", "foreign": "…" } }` with full UIDs. `system` is `kube-system`, `foreign` is `<consumer>-network-probe-foreign`. |
| `probes` | `simulator`, `other`, `foreign`, `foreign-listener` each mapped to `{ "name": "network-probe-ROLE", "podUid": "…", "probeImage": "…@sha256:…", "imageId": "sha256:…" }`. Use one immutable image reference per batch. |
| `issuerHostname` | Canonical issuer DNS name in `services` only |
| `issuerWitness` | `{ "certificate": "sha256:…", "response": "sha256:…" }` in `services` only, using the exact DER certificate and response body digests from the reviewed setup |

In `services`, `probes` also has `ingest-tcp`, `backend`, `edge`,
`notification-worker`, `alertmanager` and `archive-worker`. In `database`, it
also has `replay-worker`, `semantic-worker`, `project-current`,
`analytics-worker`, `database` and `database-peer`.
To read Pod identity, the authorized operator can select the exact Pod with
`kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" --request-timeout=10s -n
NAMESPACE get pod NAME -o json` and keep output in private diagnostics. Provide
an absolute, directly owned 0600 kubeconfig for the matching kind context. The
probe authorization needs scoped GET/list access to target identities, policies,
ConfigMap, Services, EndpointSlices and Pods, and `create` on `pods/exec` for the
named neutral sources. It needs read access to the `kube-system/kube-dns` Service
and a read-only list of cluster-wide Cilium policies. The foreign listener
needs read access only. Keep these permissions outside the routine reconciler
and the simulator launcher. Select the exact Kubernetes client version
`v1.35.0` on PATH to match the provider profile and manifest tool lock. The
gate verifies the client version offline before running any configured command.

```sh
umask 077
pnpm --silent minimal-demo:network:probe --execute --confirm-target "$TARGET" \
  --kubeconfig "$KUBE" --request /private/network-probe-request.json > /private/network-probe-receipt.json
```

Each connection has two seconds, each kubectl command at most eight seconds,
and the phase has a 300-second deadline. The probe requires exact namespace and
worker UIDs, exact installed policy rules, Ready Pods and endpoint identities.
It repeats ownership, policy, fixture and endpoint observations after the
socket attempts. Negative checks time out against endpoints that accept the
positive witness immediately before and after. A refused socket or exec failure
fails the gate. The probe sends no product payload and changes no Kubernetes
resources. The receipt records the client version, exact source, fixture and
network fingerprints, candidate, target and fixture identities, observed
endpoint images and check outcomes. It omits private IPs, paths, commands and
raw diagnostics. Cache cleanup finishes before receipt emission. A cleanup
failure produces a failed receipt and a nonzero exit.

A passing receipt covers only its named phase. Compare the reviewed candidate,
provider target incarnation and network artifact across the three phase
receipts. Two mandatory follow-on gates remain pending in each receipt:

- `gateway-ingress-edge-and-issuer` requires the actual Cilium ingress identity
  to reach edge and issuer TCP 8080 under the canonical gateway composition.
  Collect it with [canonical demo TLS](https://github.com/stanimirivanov/fleetiq-deploy/issues/103).
- `cnpg-operator-and-apiserver` requires the actual provider CNPG operator to
  reach the owned data Pods on TCP 8000 and those Pods to reach the provider API
  on TCP 6443. Collect provider evidence for the same target incarnation.

Keep the installed gate open until both follow-on results and all three local
phase receipts pass. The offline manifest checks cover the policy declarations
for the provider-owned paths.

## Troubleshoot and recover

- For target or authority failures, compare the exact namespace/worker incarnation
  and selected context with the provider receipt. Check the authorized account
  and selected Pod names. Do not broaden routine RBAC.
- For DNS or Service failures, check CoreDNS readiness, same-namespace search domains,
  the assigned private IPv4 ClusterIP and ready EndpointSlices. Keep the short
  approved name and bind address. A listener outage does not establish denial.
- For policy or translation failures, inspect the exact Cilium endpoint identities,
  service backends, canonical issuer resolution and worker listener port under
  provider authority. Keep private data outside Git. Do not widen a policy to
  a node/Pod subnet, add a host port or bypass HTTPS to obtain a receipt.

Retain the failed receipt and affected objects for inspection. Pause workload
admission until the scoped owner repairs and re-runs the failed phase. Use fresh
fixture identities on another attempt following explicit cleanup. Remove only
the owned, unused fixture namespace, ServiceAccount, Pods and fixture Services
after checking their UIDs. Keep the workload namespaces, PVCs/PVs, shared
controllers and evidence. Whole disposable-target removal follows the provider's
[explicit cleanup procedure](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/minimal-bootstrap.md#failure-diagnosis-and-explicit-cleanup).
