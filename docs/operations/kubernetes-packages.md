# Kubernetes package contracts

## TL;DR

D04 supplies two reusable Helm charts and an **offline-only** local preview.
It installs nothing. D05 owns reviewed artifact/promotion selection; D06 owns
provider compatibility, live activation, credentials and observed qualification.
Never deploy the preview's synthetic image digests or documentation IP addresses.

## Package ownership

| Package | Owned resources | External prerequisites |
| --- | --- | --- |
| fleetiq-runtime | Checked-schema backend, UX edge, private Services, token-free ServiceAccounts, HTTPS Gateway/route and NetworkPolicies | Producer images; trusted GatewayClass/controller and certificate; OIDC and database credentials/trust |
| fleetiq-data | Retained CNPG Cluster and network policy | Provider-owned CNPG operator/CRDs, retained StorageClass, separate owner/runtime credentials |
| local-preview Kustomize | Dedicated restricted namespaces and quotas | Nothing is activated; namespace ownership is qualified in D06 |

Helm owns workload parameters. Kustomize composes namespace policy without
patching Helm-owned fields. There are no controllers, CRDs, Argo Applications,
cluster RBAC, generated Secrets, migration hooks or bootstrap SQL in these packages.
The same chart sources support later local and non-local selections.

## Offline qualification

```powershell
pnpm install --frozen-lockfile
pnpm manifests:install
pnpm manifests:check
pnpm check
```

Installation fetches reviewed checksum-pinned Linux/Windows x64 tools and schema
snapshots into ignored target/tools/manifests. Validation then uses real Helm
lint/template, Kustomize build and strict Kubeconform with only local schemas.
Missing tools/schemas fail; there is no PATH, remote schema or cluster fallback.
The canonical manifest receipt records source identity, tools, resource counts
and state outcomes without rendered configuration or child diagnostics.

The fixture harness validates one complete named composition: fleetiq-local and
fleetiq-data, release fleetiq, host fleet.local.test. It is not an arbitrary
environment authorization tool. D05 adds reviewed selection and D06 introduces
qualified environment inputs before any deploy command or Argo Application.

## Runtime inputs and trust

Chart defaults are deliberately incomplete. Each closed values.schema.json is
the input contract; supply exact digest images, public DNS hostname, provider
GatewayClass, existing certificate Secret and complete OIDC configuration.
All application containers use UID/GID 10001, read-only roots, no capabilities,
no mounted service-account token, bounded resources and memory-backed /tmp.

The backend executes serve --check-schema. Existing namespace-local Secrets
supply DATABASE_URL and the OIDC client secret; neither enters chart values.
The runtime database URL must use its non-DDL login, sslmode=verify-full and
sslrootcert=/etc/fleetiq/database/ca.crt. Reference a separately provisioned public
CA ConfigMap for that mount. The optional OIDC public CA is mounted independently
and augments normal TLS trust. Secret contents and certificate validity cannot
be verified offline; D06 must prove them against actual services.

The gateway owns HTTPS. Only its explicit namespace/pod selector may reach the
private UX listener. The edge preserves the producer's same-origin API/cookie
contract. Its readiness listener binds loopback: probes use the producer's wget
command rather than an unreachable kubelet HTTP probe. Backend startup/readiness
uses /health/ready, liveness /health/live, and termination has a bounded grace.

## Data credentials and retention

CNPG's imageName retains a PostgreSQL version tag **and** a mandatory sha256 digest;
the tag conveys version metadata while the digest selects immutable bytes.
Tag-only and bare-digest PostgreSQL references fail the chart contract.
CNPG initdb creates the database owned by the migration login. Supply its existing
kubernetes.io/basic-auth Secret and a **different** existing runtime password
Secret in the data namespace. The runtime role has no ownership, elevated roles,
DDL privileges or migration-owner membership. Provision reviewed DML/ledger-read
grants after explicit migration, as required by the upstream runtime contract;
this chart does not grant those privileges or run application migrations.
The backend's connection-URL Secret lives in the runtime namespace; reference the
same runtime login without copying the migration credential into that namespace.

The Cluster has Helm keep and Argo Prune=false,Delete=false annotations. Namespace
deletion is also disabled for ordinary Argo reconciliation. These are deletion
guards, not backups or protection from an authorized direct Kubernetes deletion.
D06 must verify the selected StorageClass/PV reclaim behavior. Primary updates
are supervised; operator approval/observed switchover belongs to later release work.
Recovery and Barman/WAL backup configuration and acceptance belong to D07.

## Networks, maintenance and non-local limits

Both namespaces deny ingress/egress by default. Explicit rules cover gateway to
edge, edge to backend, runtime to database, CNPG peers/operator, cluster DNS,
OIDC HTTPS destinations and instance-manager Kubernetes API access. Select actual
provider pod labels, DNS architecture and post-translation API/issuer destinations;
offline rendering does not prove CNI enforcement, NAT behavior or isolation.
Do not replace a provider's networking stack to fit these fixtures.

maintenance=true renders both application Deployments at zero replicas while
retaining gateway, database and persistent desired state. The gateway remains
configured and has no healthy application backend. This is a reviewed maintenance
selection, not evidence that old Pods/connections have drained. D08/D10 must prove
quiescence, authorize a pinned migration separately and never undo SQL on failure.

profile=nonlocal requires at least two backend/edge replicas and three database
instances. It is a sizing floor, **not production readiness**: select suitable
quotas, placement/failure domains, durable storage, backup/evidence endpoints,
authenticated operations and recovery goals in later slices. No non-local active
environment or availability claim is created by D04.
