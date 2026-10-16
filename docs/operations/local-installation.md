# Local development installation

## TL;DR

Build reviewed sources, initialize private configuration, configure a real HTTPS
OIDC provider, start, export/trust the public local CA, then explicitly bootstrap
the first operator. Only the chosen loopback HTTPS port is reserved. Do not use
this development composition as a production installation.

## Prerequisites and first build

Use Node 24.18.0, pnpm 12.5.1 and Docker Linux containers with Compose 5.5.1.
On Windows start Docker Desktop. On Linux CI the checksum-verified Compose
installer is available as `node tools/install-compose.mjs`.

```powershell
pnpm install --frozen-lockfile
pnpm secrets:install
pnpm local sources
pnpm local build
pnpm local init development
```

Git must be authenticated for the private platform repository. Source preparation
uses isolated ignored checkouts at exact commits. Existing sibling working trees
are untouched. The first backend build can be lengthy; subsequent builds reuse
BuildKit layers and bounded Rust caches. Do not prune unrelated caches.

## Private instance configuration

Edit `.local/instances/development/config.json`:
- `httpsPort`: a free integer from 1024 to 65535; default 58443.
- `oidc.issuer`: exact provider HTTPS issuer, including its realm path.
- `oidc.clientId`: confidential browser application registered at the provider.
- `oidc.authority`: stable FleetIQ external-identity namespace, not a tenant ID.

Replace `oidc-client-secret` in the same private directory with the actual
single-line confidential client secret. Do not put the secret in config.json.
The generated database password is random and must remain unchanged after
initialization unless PostgreSQL credentials are rotated explicitly.

Initialization removes inherited Windows ACLs on the instance directory and grants
the current user full access, or creates mode 0700 on Unix. Mounted secret files
are readable inside their containers. Keep the parent private and do not copy
configuration into a public/shared folder. Docker administrators remain trusted.

Register exactly:
- Redirect URI: `https://localhost:58443/api/v1/auth/callback`.
- Post-logout return: the same origin, if your provider requires registration.

Check the backend's published identity contract when configuring a provider.
A different selected port changes the origin and redirect URI. The provider
must expose discovery/token/JWKS endpoints reachable by the backend over trusted
HTTPS. Browser requests use server sessions, not provider tokens in JavaScript.
The issuer/client/authority are validated before startup; discovery or signature
errors remain backend failures. Workload-bearer mode is not part of this composition.

## Start, trust and bootstrap

```powershell
pnpm local up development
pnpm local trust development
```

The trust command exports **only** `root-ca.crt` into the instance directory.
Review its SHA-256 fingerprint with your OS certificate tooling, then import
that certificate into your user/browser trusted roots. On Windows use
`certutil -user -addstore Root <absolute-path-to-root-ca.crt>` after review.
On Linux use your distribution/browser certificate store.
Never export `root.key`. Never disable TLS verification or use a browser
ignore-certificate-errors launch option.

Open the configured HTTPS origin. Before first privileged use create a private
`bootstrap.json` next to config.json with exactly:
```json
{
  "actorId": "initial-operator",
  "authority": "development-oidc",
  "subject": "the-exact-provider-subject"
}
```

```powershell
pnpm local bootstrap development
```

The authority must match config.json and the subject must come from the real
provider. Bootstrap is an explicit one-shot command; it is never performed by
startup or a health probe. It creates the immutable initial operator audit and is
idempotent for the same identity. Tenant provisioning is a subsequent operation.

## Stop, recovery and artifact updates

`pnpm local down development` stops/removes containers and networks while
preserving database and CA volumes. Starting the same instance again reuses
them. Restart services with `pnpm local restart development`. A changed Docker
context or owner label blocks lifecycle commands; investigate rather than bypass it.

Readiness is `/health/ready` (204 No Content) and includes PostgreSQL. The edge's local probe
only checks its listener; installation qualification separately checks real
backend readiness through HTTPS. API paths do not fall back to HTML.

A host-port conflict is a normal startup error: choose another free port in
config.json and update provider redirect registration. Host PostgreSQL 5432 is
never touched. A failed start can be stopped with the down command even if
identity configuration is not yet valid. Recovery uses the last validated
rendered Compose recipe; it does not need credentials or a fresh image build.

To update artifacts, review the exact new source commits/base image manifests
in `local/artifacts.lock.json`, rebuild and rerun both gates. Reverting a pin
does not reverse schema migrations. Back up important data and assess migration
compatibility before rollback; no automated database downgrade is provided.
Do not delete volumes as a repair shortcut. User-instance destructive cleanup is
deliberately not an automated command in this slice.

## CI and qualification

Configure repository secret **FLEETIQ_SOURCE_READ_TOKEN** with contents:read access
only to the private platform repository. Do not grant write or administration
permissions. CI passes it only to source preparation, never to the image build, Docker
build arguments or images. Do not paste it into issues or logs.
Until the owner configures this secret the hosted image-build job cannot pass;
local authenticated builds are independently usable.

`pnpm check` and `pnpm qualify` are required for this slice. Qualification
uses a unique owned project, free port and real artifacts. Its identity mode is
explicitly unconfigured and its synthetic proxy test is not a sign-in test.
Only its own containers, networks and volumes are removed. Metadata stays in
`.verification/`; private configuration, source checkouts and caches are not
uploaded as CI artifacts.
