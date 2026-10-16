# ADR 0001: Pinned local HTTPS composition

Status: accepted for development installations.

## Decision

Build the merged platform and UX source pins into deployment-owned images.
Run PostgreSQL, backend and a Caddy/static-UX edge on separate Compose networks.
Only the HTTPS edge binds a configurable loopback host port.

The platform's pinned toolchain is Rust 1.98.1; its current Dockerfile selects
1.99.0. Our small backend Dockerfile uses the source toolchain and reviewed base
digest instead of modifying upstream source. SQLx uses committed offline metadata.
Compiler concurrency is bounded to two jobs. The UX image runs its complete
production build including its existing bundle-quality budget check.

Local image IDs and build labels bind startup to the reviewed source and
packaging digest. Named build caches reduce repeated compilation without changing
locked dependency resolution. Initial compilation remains substantially slower
than subsequent builds.

The Caddy base binary carries a low-port file capability. The derived image
removes it because the listener uses 8443 and runtime drops every capability.
The app and edge keep their nonroot users and no-new-privileges restriction.

## Consequences

The local CA requires explicit host/browser trust. It is not a production
certificate service. Confidential provider configuration is deployment-specific;
the backend retains its HTTPS-only discovery and signature validation.

No controlled OIDC provider is bundled in this slice. The backend currently has
no deployment setting for adding a private provider CA to its OIDC HTTP client.
The next browser-qualification slice must resolve that trust path explicitly;
disabling TLS or treating a proxy echo fixture as authentication is unacceptable.

[Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
and [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
are the underlying mechanisms. Compose bind-mounted secret permissions differ
from Swarm; the private host directory is the confidentiality boundary.
