# Installed device-to-web qualification

## TL;DR

`pnpm qualify:product` runs a real disposable Compose installation, HTTPS issuer,
Chromium and synthetic Teltonika tracker. It requires the reviewed images built by
`pnpm local build`. CI runs it after the existing infrastructure smoke test.
Neither test activates an environment or completes persistent D06 qualification.

## Run

With a local Linux Docker engine (including Docker Desktop in Linux-container
mode), pinned tools and source-read access:

```sh
pnpm install --frozen-lockfile
pnpm local sources
pnpm local build
pnpm qualify
pnpm qualify:product
```

The product edge builds the merged UI's own NGINX Dockerfile at the exact lock
revision, independently of the legacy diagnostic edge image. Its image ID, source
labels, UID, entrypoint and graceful-stop signal are checked before startup. The
TLS adapter changes only the upstream listener to HTTPS with the disposable leaf
certificate and points `/maps/` at the controlled fixture root. Upstream CSP,
proxy/header rules, asset-route handling, MIME types and SSE controls remain intact.
Template anchor changes fail closed and require adapter review.

The root and `/run/tls` certificate mount remain read-only. Only `/tmp` is writable:
32 MiB, UID/GID 10001, mode 0700, noexec/nosuid/nodev. No Caddy data/config caches,
additional service or host trust change are needed for this product composition.
The separate three-service infrastructure diagnostic still uses its existing
legacy adapter; its receipt cannot qualify the product image or publication.

The command verifies the local Docker context and daemon, builds the helper from
`local/qualification/product/inputs.lock.json`, and creates a randomly named
`product-<id>` project. No host ports are published. Do not run it against a
remote engine or non-Linux daemon. The Node driver validates the actual daemon
OS, local Unix transport and Compose version. CI runs installed and structural
regressions on Linux. No Kubernetes cluster or retained FleetIQ state is accessed.

The source-read credential needs contents:read on both locked source repositories.
It is supplied only to source retrieval. Build and runtime steps do not receive it.

## Actual acceptance path

1. Generate a two-day test CA and exact-name leaf certificates in an owned volume.
   Delete the CA signing key after signing. Install only the public CA into the
   fresh browser container's NSS database and the backend's additive trust input.
2. Start the private PostgreSQL database, maintained `oidc-provider` fixture,
   real backend and static edge. Database health probes use TCP loopback; the
   image's temporary initialization socket cannot satisfy readiness. A fresh-data
   fixture proves the socket is accepting while TCP is unavailable, pauses across
   health intervals, and leaves a required non-secret marker. No domain rows are
   inserted by the fixture. Bootstrap the synthetic platform operator through
   the backend CLI, not direct database fixture inserts.
3. Sign in through native HTTPS discovery, authorization, consent, callback and
   server-managed cookies. The test issuer's `form-action` permits its own origin
   and exact registered FleetIQ callback: Chromium checks redirects following form
   submission, including the final authorization redirect. Default resources and
   base URLs remain denied. Verify cookie flags and reject a different TLS hostname.
4. Through native same-origin browser fetch, create two tenants/actors, grant
   exact actions, register the tracker and assets, define properties/types, upload
   the compiled Teltonika component with its exact-byte `X-Artifact-Sha256` header,
   admit both worlds and activate its route.
   Assert CSRF rejection and actual cross-tenant denial.
5. Start ingestion, replay, semantic and current-state workers. Send a real IMEI
   handshake and CRC-protected Codec 8 packet over TCP. Require the durable record
   acknowledgement and the resulting exact current property and provenance.
6. Use the inspector UI to read history/provenance and start live delivery. Send
   another TCP record and require its new value on the existing page.
7. Stop only owned application workers/backend, restart the owned database, then
   rebuild only its current-state generation and resume them. Require the existing
   browser page to establish a fresh full SSE baseline and display another
   record while original provenance remains unchanged. If the finite transport
   retry budget expires during the outage, use the existing operator retry once;
   do not increase that budget or mask authorization/parse failures.
8. Render the real MapLibre map using the deployed raster/style endpoints and
   projected device positions. Across three route cycles, require one map canvas
   and one local map worker when active, and none after disposal.
9. Append temporal binding corrections through the protected API. Existing
   interpretations must remain unchanged; only the newly emitted record is
   attributed to the new asset with revision 2. Recheck original history.
10. Revoke telemetry permission during live delivery, require evidence removal
    and HTTP denial, then log out and require an unauthorized session response.
11. Require every inventoried assertion and a successful browser exit. Verify
    ownership before removing only this project's containers, networks and volumes.
    A failed assertion, prerequisite, process or cleanup fails the product group.

The page object owns accessible UI actions. The scenario owns assertions; setup
uses the real protected administration API because platform bootstrap screens are
not an application feature. There is no Playwright routing or response replacement.

## Evidence and failure diagnosis

The authoritative receipt is `.verification/product-<uuid>.json`. It records
source revisions, runtime image IDs, completed check names and cleanup outcome.
On failure, it also records identity-checked service state, health/exit codes, OOM
flags and fixed diagnostic categories before cleanup. Raw container logs, health
output and environment values are inspected only privately and are never retained.
Browser failures additionally expose only a fixed browser step and cause, such
as callback timeout or content-security-policy rejection. Provider URLs, codes,
state/nonce values, cookies and assertion bodies remain excluded. API contract
failures expose only a fixed operation identifier and numeric actual/expected
status, without request paths, bodies or headers. Fixed UI fallback categories
distinguish tenant-discovery schema rejection from loading or transport failure.
Diagnostic collection failures are marked incomplete and cannot replace the
original failure or satisfy an acceptance check.
CI uploads only `.verification/*.json`; private volumes and control directories
are excluded. A docker/infrastructure receipt cannot satisfy the product group.

Public coordination markers live in `.local/product-<id>/control/`. They contain
only phases and fixed check names. A missing/failed marker or timeout is an error;
markers cannot overwrite an earlier phase. The browser deliberately does not
retain raw assertion output, network bodies, screenshots, videos, traces, cookies,
OIDC URLs or provider diagnostics. Inspect the last completed check and CI stage
and the service summary rather than widening artifact collection to secret-bearing
logs. A successful helper build followed by `start-trusted-services` failure is a
runtime startup failure, not a Dockerfile base-argument warning. The helper now
has a valid immutable default that is checked against its canonical input lock.

The helper's Linux build executes Bash syntax and behavior tests for the backend
entrypoint, including complete LF/CRLF secret files and rejected partial/empty or
embedded-line-break inputs. Cross-platform Node fixtures verify frame bytes and
split TCP acknowledgements, credential isolation, ownership and incomplete evidence.

## Boundaries

This is an integration qualification against exact reviewed source builds, not
publication, promotion, an image-security attestation, hardware qualification,
load/HA certification or a Kubernetes/persistent storage recovery claim.
The synthetic tracker sends representative Codec 8 GPS records; real devices and
additional codecs remain covered by their separate protocol/hardware program.
The self-hosted raster grid is deliberately synthetic, with no external map calls;
it verifies map transport/rendering and disposal, not geographic cartographic data.

The issuer deliberately authenticates a fixed synthetic account through its test
interaction button. It has no host ports and cannot be configured as the normal
installation provider. Its private keys and disposable credentials never leave
owned runtime volumes. Real deployments continue to require their own provider.

No host trust store, Docker engine setting, other project, image cache or global
volume list is modified. Existing diagnostic Compose roles and their infrastructure
qualification remain intact. D06 and full-profile qualification stay deferred.

## Diagnosed integration prerequisites

- Issuer interaction CSP permits its own origin and the exact registered FleetIQ
  callback. Chromium checks the consent POST redirect chain; `form-action 'self'`
  alone blocks the cross-origin callback. Default resource and base URI policies
  remain closed, and the helper waits for the restored application route.
- Raw component uploads include `X-Artifact-Sha256` computed over their exact bytes.
  The actual backend validates this digest before admission.
- Tenant discovery must describe all five supported grants. The installed local
  run exposed the older `OperatorTenant.actions.maxItems: 3` constraint. Platform
  PR #349 corrected it; UI PR #99 regenerated the official Effect contract.
  Both merged fixes are now included in the reviewed source pins. UI PR #101
  removes the unpatched Caddy/Smallstep JOSE dependency through native NGINX;
  product qualification must exercise that source-owned runtime, not the older
  deployment-owned Caddy build. Do not remove grants or patch generated code.
  Installed acceptance still requires the complete real browser/TCP receipt.
  D06 and full-profile qualification remain deferred.

## Local NGINX handoff evidence: 2026-10-29

The selected backend is platform PR #349 merge `a1ca9e24035efdffca69ae50c2118228257936e4`;
the selected UI is PR #101 merge `e09ccec246ad024ef587701223e76aadadcc604a`.
The reviewed local build, infrastructure qualification and structural group passed
(207 tests, formatting, native manifests, release contracts, secrets and audit).

Two independent full product runs passed every one of the 14 checks above and
ownership-checked cleanup. Ignored local receipts are:

- `.verification/product-cd10c355-44b4-4bbb-be5e-0b9f7a09556f.json`
- `.verification/product-017af4f3-75f3-49fa-a866-1cd6e70ddd8c.json`
- `.verification/docker-3298f18e-a7da-4b03-bfdd-0bc1c49bfe24.json`
- `.verification/structural-0e0ae7ad-544c-4de2-916e-f24663b83fdb.json`

An initial product trial failed during the first TCP exchange. Its displayed
metadata-context category described the open page, not a proven TCP cause.
Fixed connect/identification/record phases and closed TCP causes now take precedence
in diagnostics. The initial close was not reproduced in the two subsequent full
runs; its exact cause remains unconfirmed. No device retry, worker omission,
longer deadline or relaxed assertion was added. CI must still pass the complete
gate for the final commit; these local receipts do not imply infrastructure,
publication or persistent D06 acceptance.
