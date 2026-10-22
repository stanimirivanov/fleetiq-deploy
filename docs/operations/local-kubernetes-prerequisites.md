# D06 local Kubernetes prerequisites and publication handoff

## TL;DR

- I01-I04 provider work is merged; select infrastructure revision
  `41c558a54bc923fa69d7afc42bc663b763c3add5` before preparing a new target.
- This prerequisite fixes package compatibility and verifies offline/OCI behavior.
  **D06 remains incomplete: no persistent FleetIQ installation is accepted.**
- Corrected charts and the backend/UX images are published from reviewed main.
  Complete independent artifact verification and the persistent-target prerequisites
  in the [current readiness record](d06-readiness.md) and
  [qualification preparation](d06-qualification.md).
- Never deploy preview digests, adopt the disposed infrastructure qualification
  cluster, disable TLS/OIDC, or remove the candidate/activation boundary guard.

## Provider capabilities and limits

The selected provider source includes independently qualified isolated target,
Argo, networking and database capabilities. See
[provider I04 PR 29](https://github.com/stanimirivanov/k8s-infrastructure/pull/29),
[networking contract](https://github.com/stanimirivanov/k8s-infrastructure/blob/41c558a54bc923fa69d7afc42bc663b763c3add5/docs/networking-and-ingress.md)
and [database contract](https://github.com/stanimirivanov/k8s-infrastructure/blob/41c558a54bc923fa69d7afc42bc663b763c3add5/docs/database-and-storage.md).
Source completion does not prove a new FleetIQ target is healthy or authorized.

The supported local profile is `isolated-network-local`: a control plane and worker
capped after bootstrap at four CPUs/eight GiB total. Its temporarily uncapped
bootstrap and shared-host resource effects require an explicitly authorized live
preview. Argo, database, networking and application capacity must be assessed
*together*. The separate provider qualification target was destroyed; it is not
an environment that FleetIQ can adopt.

Infrastructure owns shared controllers/CRDs, GatewayClass and retained storage.
FleetIQ owns its delegated namespaces, Applications, database resources, routes,
certificates, Secret references and release records. Database namespace delegation
must opt into provider admission/quota enforcement before database Argo rights.
Provider credentials, private keys and kubeconfigs never enter Git or reports.

## Port and ingress contract

| Meaning | Qualified-local fixture | Responsibility |
| --- | --- | --- |
| Public DNS hostname | `fleet.local.test` | Certificate, Gateway/HTTPRoute hostname and edge host matcher |
| External browser HTTPS port | `18443` | Browser origin, OIDC redirect origin and the explicit provider loopback mapping |
| Gateway/node listener | `8443` | Selected Cilium host-network listener behind that mapping |
| Application HTTP listener | `8080` | Private edge/backend Services; never host-published |
| OIDC issuer HTTPS port | `19443` | Fixture-only trusted issuer; backend egress follows the configured issuer port |

`public.port` defaults to 443 and is omitted from the canonical browser origin at
that default. `gateway.listenerPort` independently defaults to 443. The provider
fixture overrides both; they must not be substituted for each other.

Keep `FLEETIQ_PUBLIC_AUTHORITY` hostname-only: Caddy's host matcher strips the
request port before matching. The backend instead receives the full explicit
`FLEETIQ_BROWSER_ORIGIN`. The existing edge preserves the incoming Host header;
no client-provided forwarded identity becomes configuration authority.
See [Caddy matching](https://caddyserver.com/docs/caddyfile/matchers#host).

The ordinary `pod-selector` ingress mode retains a namespace-and-Pod-scoped
Gateway allow. Only that mode requires Gateway namespace/Pod selector inputs.
The explicit `cilium` mode replaces that phantom Pod allow with a
CiliumNetworkPolicy selecting only the edge and permitting only `ingress` identity
on TCP 8080. It adds no egress, backend/database access, world identity, cluster
identity or namespace-wide selector. Cilium's policy union supplies that allow
alongside the unchanged namespace default deny and bounded edge egress.
See [Cilium Gateway identities](https://docs.cilium.io/en/stable/network/servicemesh/gateway-api/gateway-api/).
Actual traffic allow/deny and trusted TLS remain D06 live gates.

## Storage and identity contract

The provider supplies non-default `local-retained`: RWO, WaitForFirstConsumer,
Retain and no expansion. Opted-in namespaces admit whole 1-4Gi claims, at most two
database instances, and 8Gi/four-claim accounting. The provider-local fixture uses
one instance and a 2Gi request with replacement headroom. Requests are not physical
quotas, reservations, replication or protection against kind/host loss.

The fixture's PostgreSQL version tag mirrors the qualified 18.4 family, but its
digest is deliberately synthetic. Actual acceptance requires the selected,
verified PostgreSQL artifact and fresh provider handoff, not this fixture.

Normal backend startup still requires complete trusted HTTPS OIDC discovery,
client identity, confidential Secret reference and optional independent public CA
bundle. A non-default HTTPS issuer port is valid; the chart derives the one egress
port from the issuer URL. No plaintext, skipped verification, extra broad port
list or identity-disabled fallback is added. Live client credentials and endpoints
must be configured privately when the installation is authorized.

## Publication sequence

1. Merge this prerequisite PR after its real rendering/policy/OCI checks pass.
2. Have a maintainer authorize the three publication workflows for exact reviewed
   current-main revisions. Deployment charts must include these corrections;
   source branches and local archives are not accepted published artifacts.
3. Retain producer/package publication receipts, verify live OCI digests and
   provenance with the existing release verifier, then construct the real BOM.
4. Preview a fresh named target and combined capacity. Obtain the provider-required
   authorization for its exact context, private state, ports and lifecycle.
5. Register and enforce protected activation source graphs before adding any
   Applications. Bootstrap admin and release/app authority must remain separate.
6. Configure private credentials/trust, explicit migration/bootstrap and normal
   OIDC. Run the complete D06 install, deep-link, private API, TLS, isolation,
   restart persistence and retained-data lifecycle gates. Missing input is
   incomplete verification, never a successful installation.

On 2026-10-20, source inspection observed provider main at the revision above,
platform main `76bc728a23b23610874fe6dd710cb079662358be`, UX main
`6a52bee99f02d7da483af3cab24ae2deb4a11862`, and pre-correction deployment main
`a9985b35b803b8778b85c80bf7fae25734e0f289`. No runs existed for the platform/UX
`publish-image.yml` or deployment `publish-release.yml` workflows. These are dated
readiness observations, not reviewed artifact selections or publication authority.
Re-resolve inputs and receipts at publication time.

## Verification and remaining work

The two preview families have synthetic images, documentation addresses and
nonexistent credential references. Their real Helm/Kustomize/Kubeconform checks
prove schema/packaging invariants, not a working environment. The native Cilium
schema is checksum-pinned alongside the existing schema catalog; missing inputs
fail rather than fetching or skipping during verification.

[Issue 11](https://github.com/stanimirivanov/fleetiq-deploy/issues/11) owns this
prerequisite. The merged PR 10/issue 9 assessment is historical; the
[current readiness record](d06-readiness.md) supersedes its missing-provider status. No activation
record, Argo source graph or live apply command is introduced here. The existing
no-Argo-graph guard stays enforced until protected source-graph validation exists.

The [D06 plan](../exec-plans/active/kubernetes-gitops-deployment.md#pr-d06-onboard-fleetiq-and-qualify-the-first-persistent-kubernetes-installation)
is complete only after actual immutable artifacts are installed and its live gates
pass. D07 still owns external backup/restore; D08 owns workflow execution; D10
owns full real-provider browser journeys. Local persistence is not production
readiness or disaster recovery.
