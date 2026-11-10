# Local environment design
Status: proposed. No services were started during planning.

## TL;DR
Extend deployment-owned Compose with an explicit persistent demo profile. Reuse the existing real UI, TCP pipeline and PostgreSQL. One-command startup applies after tool, source access, DNS and public-CA trust prerequisites; do not hide those prerequisites.

## Options
| Concern | Compose — recommended v1 | kind — later packaging qualification |
|---|---|---|
| Existing assets | Normal installation, TCP workers, issuer/seed/browser patterns already exist | Existing runtime/data charts and isolated provider profiles |
| Responsibility | Deployment owns application composition | Infra owns substrate; deployment owns charts/credentials/product tests |
| Startup | Fewer controllers; warm target ≤180 seconds proposed, unmeasured | Cluster, CNI, Argo, cert-manager/database operators increase stages; startup UNVERIFIED |
| Footprint | Base plus TCP service caps total 3584 MiB; demo issuer/simulator/seed/browser extra | Full local profile requires engine ≥8 CPUs/24 GiB and separate host prerequisites |
| TCP / UDP | Existing TCP loopback 55027; no UDP product listener | Raw TCP requires explicit L4 route/service exposure; HTTP Gateway route is insufficient; UDP remains unsupported |
| Hot reload | Explicit dev overlay with source build provenance | Requires dev mounts/sync/image loading and separate qualification |
| Teardown | Owned project down retains state; explicit owned reset | Provider target identity/state/kubeconfig gates; never generic cluster deletion |
| Reuse outcome | No new broker required | Relevant later, no infrastructure changes for Compose |

Sources: [Compose](../../../local/compose.yaml), [pipeline](../../../local/pipeline/compose.yaml), [runtime chart](../../../charts/fleetiq-runtime/values.yaml), [data chart](../../../charts/fleetiq-data/values.yaml), [provider resources](https://github.com/stanimirivanov/k8s-infrastructure/blob/e3d5f1845217cf047c44d0809cdbe20f03570f07/docs/isolated-local-consumers.md), [D06 readiness](../../../docs/operations/d06-readiness.md).
The 3584 MiB total is the sum of configured service caps, not observed usage or guaranteed aggregate accounting for children. Proposed developer baseline: four available CPUs, 8 GiB available RAM, 20 GiB free disk; cold Rust/image builds may need more. Measure rather than certify these estimates.

k3d/minikube offer local clusters but would duplicate the repository's kind lifecycle and ownership protections. No provider adoption is recommended. Bare Docker Compose commands must not bypass the existing owner checks.

## Topology
- Browser → loopback HTTPS Caddy/static reviewed UI → backend HTTP on private application network.
- Browser and backend → same canonical HTTPS demo issuer URL. No tokens are handed to the UI.
- Simulator → `tcp-ingestion:55027` on device-ingress only. Optional host-launched simulator targets `127.0.0.1:55027`.
- Ingestion/replay/semantic/projection → private PostgreSQL.
- Short-lived seed runner → HTTPS backend using real OIDC session and CSRF. It alone sees private identities and admitted component bytes needed to create the matching metadata.
- No simulator database mount, Docker socket, backend secret, public host binding or internet route fetch.

Use names `fleet.fleetiq.test` and `issuer.fleetiq.test` as proposed local names, explicitly mapped to 127.0.0.1 by the operator. Selected example ports 58443/59443 must be checked free. Container network aliases resolve those same names to their respective edge/issuer services; listen internally on the selected issuer port, so discovery/token URLs match. Certificates include exact SANs. Register the exact UI origin plus `/api/v1/auth/callback`; validate the browser/backend issuer string equality. Hostnames are proposed, not existing DNS records.

The existing issuer is an internal disposable fixture; adapt it to explicit demo mode with generated private client/cookie/signing material, stable owned issuer identity, restart behavior and no external federation. Label its account as synthetic. Refuse externally bound hosts and reject origin mismatches. Local machine users/processes are trusted for this isolated demo. [Existing issuer](../../../local/qualification/product/issuer.mjs)

## Startup contract
Existing setup commands, from deployment, remain valid:
`pnpm install --frozen-lockfile`, `pnpm local sources`, `pnpm local build`.
They need approved tool installs and private repository access; they are not run in planning. [Runbook](../../../docs/operations/local-installation.md)

Proposed **[new]** `pnpm local demo-up simulator-demo`:
1. Validate tools, selected artifacts, resource bounds, hostname resolution, ports and owner identity before mutations. Create only a fresh owned demo instance if absent.
2. Generate private identities, credentials, local CA and server certificates once. Export public CA only. First invocation can stop as prerequisites-incomplete with instructions for reviewed host/browser trust; no automatic trust-store modification.
3. After DNS/trust setup, the same command starts private DB/backend/issuer/edge; waits for actual HTTPS discovery and readiness.
4. Run existing one-shot initial-operator bootstrap under explicit demo ownership, then browser-session-based tenant/device/component/admission/route/property/binding provisioning. Store a private content fingerprint, reconcile exact existing state and refuse drift/foreign ownership.
5. Start pipeline and simulator only after provisioning succeeds. Report URL, scenario, safe status and owned instance, not IMEIs/credentials. A bounded probe verifies projection, not just process health.
6. On a partial failure, report failed stage and owned resources; retain recoverable evidence and allow bounded rerun/down. Never delete the database to retry.

A warm configured start is one command. A first-ever trusted HTTPS installation cannot honestly be zero-prerequisite. Host trust is outside a container and cannot be silently supplied by it.

The initial demo covers the full device-to-browser chain. Analytics/notifications/archive remain explicitly selectable existing overlays, not silently started integrations with real services. A future all-feature scenario must supply local receiver/object storage fixture credentials and qualify those features independently. [Analytics overlay](../../../local/analytics/compose.yaml), [archive overlay](../../../local/archive/compose.yaml)

## Provisioning and restart
Bind one synthetic communication device to one asset with two integer location properties; map `gps.latitude_e7`/`gps.longitude_e7` through explicit signal-binding revisions. UI map selects `encoding=e7`. Admit the exact locked guest via existing upload/admission APIs. Package names in different docs are examples, not automatic registration. [Working seed](../../../local/qualification/product/api.mjs), [map link](../../../local/qualification/product/page.mjs)

On down/up retain private IMEIs, tenant IDs, owner nonce, profile/config digest and unacknowledged queue. Read-before-create plus content comparison handles exact retries; optimistic-revision collisions fail. Changed scenario configuration requires a new run or explicit compatible resume, not mutation of already queued packets. Migrations remain the existing application lifecycle's responsibility, with no invented downgrade path.

The demo issuer has one stable synthetic subject and one exact client registration derived from owned config. Persist signing keys, cookie keys, client secret and issuer identity in its private volume. Login sessions, grants and authorization codes are deliberately ephemeral: issuer restart invalidates them, and browser/seed must complete a fresh OIDC flow. No persistent identity database or dynamic client registration is introduced. The seed runner authenticates through the same synthetic local login/consent flow as the browser, with its own isolated session; it never imports an existing browser cookie. On restart, existing backend bootstrap state must match the configured authority/subject, otherwise startup refuses. Test logout/relogin and issuer restart alongside retained application data. Normal user instances cannot select the synthetic issuer by omission.

Before each provisioning request, write a private intent journal with owner nonce, deterministic namespaced resource ID, expected content digest and expected revision. IDs are generated once under that nonce, not fixed shared qualification names. After an interrupted request, read the resource and compare the recorded intended content: absent means retry creation; exact means record completion and continue; different means stop. Use the existing API's immutable idempotency key or expected revision where provided. Preserve earlier completed resources on later failure, and resume the remaining dependency graph. Missing journal/owner state never permits adopting a matching-looking tenant. Test interruption before request, after server commit and before journal completion for every provisioning stage. If a required verification read is absent from the selected published contract, report a platform prerequisite rather than bypassing the API with SQL.

**[new]** `pnpm local demo-down simulator-demo` closes simulator first, then stops owned services and networks; retains DB/CA/queue. **[new]** `pnpm local demo-reset simulator-demo --confirm-owned-instance simulator-demo` additionally deletes only verified owned state/volumes. It refuses path links, owner mismatch, foreign Docker context or an active unowned process; output is redacted. Acceptance must cover failure and cleanup, not just the happy path.

## Development reload
Production-built UI and locked backend are default. UI already has `pnpm dev`; it does not currently configure a connected HTTPS backend proxy. [Vite configuration](https://github.com/stanimirivanov/fleetiq-ui/blob/cdffdc25b1c45048e56dd861170807f136d6ca52/apps/web/vite.config.ts)

A separate **[new]** dev overlay routes static/HMR traffic through the same HTTPS edge to Vite while API/SSE/auth remain on the backend. Require exact-origin WebSocket and CSRF checks. Never use sample mode as a connected fallback. No HMR credentials, unrestricted CORS or browser bearer tokens.

Backend default is explicit rebuild/restart. Optional **[new]** `pnpm local demo-rebuild-backend simulator-demo` builds an explicitly selected development source revision with matching live/replay executors, then controlled restart; do not swap only the server binary or rerun migrations implicitly. Automated watch is deferred; this is slower but preserves process/ABI provenance. Acceptance switches back to reviewed images.

## Qualification and limits
Run deployment `pnpm check`, `pnpm local build`, `pnpm qualify`, `pnpm qualify:product` and **[new]** `pnpm qualify:simulator`. The last gate must exercise actual host-facing URLs, OIDC, TCP and browser map/Inspect, retry/offline/restart, private-input redaction, and owned cleanup. Use an isolated browser trust profile; host trust is manually confirmed for interactive use.

Ubuntu/Bash/Linux containers are the supported first target. WSL2/macOS require separate DNS, CA, bind-mount permission, file-watch and Docker networking evidence. No new Windows scripts. Actual timing/RSS/CPU/socket/FD/queue measurements must be recorded for one/two product sessions and 100 reference-peer sessions separately. No production capacity promise.
