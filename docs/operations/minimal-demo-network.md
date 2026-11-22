# Minimal-demo private networking

## TL;DR

Render the three delegated namespaces and their scoped policies offline. Use the
provider's namespace-installation authority and the exact approved simulator
attempt. The installed probe requires separate authorization for a disposable
target. Its `ingestion` phase proves the short-name DNS and both Service and Pod
paths. Its `services` phase also requires the canonical issuer route.

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
local `host` identity on the owned worker on TCP 8443. Check both paths explicitly.
No worker may use an arbitrary cluster host or subnet as an issuer substitute.

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
pnpm manifests:check
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

Choose `PHASE=ingestion` for the initial network-only check. The fixture emits one
neutral TCP listener and three probe sources. The positive source uses the
already admitted `demo-run-…` account in apps. The same-namespace negative
source copies the attempt label but uses `default`. The foreign source copies
the attempt label and ServiceAccount **name** into a separate owned namespace.
Neither source needs a Kubernetes API token.

For `PHASE=services`, add the neutral DB, router, backend, receiver and object
store listeners and the additional source roles. The issuer branch requires the
reviewed canonical in-cluster DNS name and its 18443 route to the owned worker
8443 listener from [canonical demo TLS](https://github.com/stanimirivanov/fleetiq-deploy/issues/103),
or a separately approved disposable witness for those exact destinations.
The fixture bundle does not install the gateway or create that translation. The
probe exercises transport only. Browser/TLS and real producer operations are
separate acceptance gates.

On the exact capped worker, stage a reviewed immutable Python image using the
[provider staging procedure](https://github.com/stanimirivanov/k8s-infrastructure/blob/main/docs/minimal-database.md#scope-and-prerequisites).
Account for every fixture Pod before admission. The ingestion bundle has four
Pods and the services bundle has twelve, each with 5m CPU/16Mi requests and
100m CPU/32Mi limits. Do not co-locate the neutral fixture with the product
workload or run both phases at once. This fixture allocation does not establish
fit for the [candidate ledger](https://github.com/stanimirivanov/fleetiq-deploy/issues/92#issuecomment-7071204249).

```sh
pnpm --silent minimal-demo:network:render /private/network-selection.json "$PHASE" "$PROBE_IMAGE" > /private/network-probe.json
jq '{apiVersion,kind,items:[.items[] | select(.kind == "Namespace")]}' /private/network-probe.json > /private/network-probe-namespace.json
jq '{apiVersion,kind,items:[.items[] | select(.kind != "Namespace")]}' /private/network-probe.json > /private/network-probe-objects.json
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
| `phase` | `ingestion` or `services` |
| `candidate` | Reviewed `sha256:…` candidate identity |
| `target` | `{ "name": "qual-fleet-local", "workerUid": "…", "namespaceUids": { "apps": "…", "data": "…", "support": "…", "system": "…", "foreign": "…" } }` with full UIDs. `system` is `kube-system`, `foreign` is `<consumer>-network-probe-foreign`. |
| `probes` | `simulator`, `other`, `foreign` each mapped to `{ "name": "network-probe-ROLE", "podUid": "…", "probeImage": "…@sha256:…", "imageId": "sha256:…" }` |
| `issuerHostname` | Canonical issuer DNS name in `services`; omit in `ingestion` |

In `services`, `probes` also has `ingest-tcp`, `backend`, `edge`,
`notification-worker`, `alertmanager` and `archive-worker` in the same format.
To read Pod identity, the authorized operator can select the exact Pod with
`kubectl --kubeconfig "$KUBE" --context "kind-$TARGET" --request-timeout=10s -n
NAMESPACE get pod NAME -o json` and keep output in private diagnostics. Provide
an absolute, directly owned 0600 kubeconfig for the matching kind context. The
probe authorization needs scoped GET/list access to target identities, policies,
ConfigMap, Services, EndpointSlices and Pods, and `create` on `pods/exec` for the
named neutral sources. The gate checks actual access. Keep these permissions
outside the routine reconciler and the simulator launcher.

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
positive witness immediately before and after; a refused socket or exec failure
fails the gate. The probe sends no product payload and changes no Kubernetes
resources. A passing receipt records exact source and network fingerprints,
candidate, target and fixture identities, observed endpoint images and each
check outcome. It omits private IPs, paths, commands and raw diagnostics.

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
