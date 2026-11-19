# Verification and evidence

## TL;DR

Run `pnpm check` and, after `pnpm local build`, `pnpm qualify` and `pnpm qualify:product`.
Install pinned offline manifest prerequisites first with `pnpm manifests:install`.
`pnpm installation:check` is the focused, offline D06 namespace/bootstrap gate;
its sensor also runs inside the existing manifests check.
A focused pass is not a complete acceptance pass. Missing prerequisites, failed
commands, changed source bytes or failed cleanup produce a nonzero exit.

## Guides and sensors

| Intent | Deterministic sensor |
| --- | --- |
| Exact source/base/tool versions | Artifact lock validation, Git checkout and image/OCI-label inspection |
| Private backend and database | Rendered Compose policy plus actual container port inspection |
| Restricted application containers | Rendered UID, read-only, capabilities, security options and bind-mount policy |
| HTTPS and routing | Trusted/untrusted/wrong-host TLS probes, SPA/API/static assertions |
| No silent identity downgrade | Complete config checks, entrypoint validation and explicit reset override |
| Cookie/Origin/Host/no-store | Synthetic upstream through the real HTTPS edge, then restored real backend |
| Device-to-browser acceptance | Separate product inventory, real OIDC/TCP/worker/browser flow, map disposal, analytics-to-receiver recovery and mandatory owned cleanup |
| Owned cleanup | Context, owner labels, project names and post-cleanup resource inventory |
| Durable restart | Database marker and public CA comparison after service restart |
| No secret exemptions | Pinned Gitleaks across candidate files, index and incoming history; allow comments ignored |
| CI does not omit checks | Exact reviewed workflow renderer plus mutation fixtures |
| Formatting and dependency policy | Biome CI, frozen lock install and pnpm advisory audit |
| Bootstrap intent is not ownership | Native Kustomize/strict schemas for exactly three namespace/quota pairs; closed ownership/Pod Security/retention/quota policy, with no live execution or adoption claim |
| Kubernetes package fitness | Real Helm/Kustomize rendering, pinned local Kubeconform schemas and parsed manifest policy with rejection fixtures |
| Immutable publication | Pinned Helm OCI push/pull/render in an owned registry, exact archive/manifest hashes, missing/retag/overwrite rejection |
| Candidate is not activation | Closed Ajv contracts, active-path rejection, registered protected-ref Argo source-graph checks and independent admission-context fixtures |

The executable catalogue is in `tools/verification-catalogue.mjs`. Groups are structural, manifests,
packages, docker, product, simulator, development and acceptance. Reports include group/check outcomes, source fingerprints,
Git head and timestamps. Docker measurements name the real images and checks,
but contain no raw command output, cookies, provider subjects or configuration.
All acceptance requires unchanged candidate file bytes before/after execution.

The secret sensor scans isolated worktree/index snapshots plus incoming Git
history. CI supplies the event's ancestor base SHA; local checks scan all history
when no base is supplied. Gitleaks ignore files and per-line allow directives
cannot silently bypass scanning. Missing scanners fail closed.

## Limits and review

Repository-owned policy can be changed by a PR. It cannot prove its own
independence; configure required checks/reviews externally. These settings and
the CI source-read secret are owner-managed and unverified by this repository.

The product group separately requires real HTTPS/OIDC sign-in, CSRF and tenant
isolation, TCP-to-property evidence, browser live recovery, correction and owned
cleanup. See [installed qualification](../operations/installed-product-qualification.md).
Infrastructure receipts still cannot attest authenticated acceptance. Neither
proves production restore, throughput, availability, image vulnerability SBOM
analysis or full build reproducibility.

Run behavioral fixtures with `pnpm test`. Test-file concurrency is bounded to two
so native renderers, scanners and loopback Git fixtures do not exhaust the host;
all assertions and existing deadlines remain required. They include policy mutation tests;
installation behavior is exercised against Docker by the docker group.
Linux structural CI and infrastructure CI use the same runner.

## CI prerequisites and evidence recovery

pnpm 12 installs a native executable. Its exact pinned global installation must
run its own setup scripts. Bootstrap explicitly allows only `pnpm@12.5.1`
with npm's strict script policy; do not add `--ignore-scripts` to that bootstrap
command. This does not enable lifecycle scripts for application dependencies. The shared adapter discovers native PATH/adjacent npm executables
and JavaScript/Corepack entries without a shell; only an exact successful version
probe qualifies a launcher. Broken or mismatched launchers fail closed.

Each job finalizes metadata-only CI evidence even when dependency installation,
source fetching or image building prevents the verifier from starting. A success
requires both successful preceding steps and a complete group receipt for the
current GitHub SHA, all inventoried checks passed, and equal source fingerprints.
A shell step returning zero without running verification cannot pass this gate.
The uploader explicitly includes hidden files for only `.verification/*.json`;
missing artifacts remain errors. Never widen that path to private installation
state, environment dumps or command logs.

The installation job needs the owner-configured repository secret
`FLEETIQ_SOURCE_READ_TOKEN` with contents:read on both locked source repositories.
A missing secret is reported as an incomplete prerequisite, never skipped or
replaced by the job token. See [installation](../operations/local-installation.md).

GitHub Actions use reviewed major tags. Runtime tools, images and application
source commits retain their exact version/digest pins. Change the authority in
`tools/ci.mjs` and render it together with the workflow; mutation tests protect
mandatory gates, major action versions and evidence collection.

The Docker group also inventories `demo-lifecycle`: the pinned simulator, normal
installation and real browser provisioning prove readiness ordering, retained
down/up state, foreign-owner/context rejection and owned reset with unrelated
resource canaries. It does not claim map/Inspect acceptance. Browser CA trust is
confined to disposable qualification state.

The Docker group also inventories analytics-routing: the pinned real Alertmanager
and a synthetic-only receiver exercise firing/resolved, unreachable router and
restart with owner-checked cleanup. No installed milestone outcome is implied.


## Published simulator acceptance

`pnpm qualify:simulator` is the separate `simulator` group. Its mandatory
`installed-simulator` check runs the reviewed producer through normal Compose,
real OIDC, projection, map-point selection and Inspect, then proves rejection of
an unknown identity, unchanged accepted data and owned cleanup. CI invokes this
same command and records `ci-simulator` evidence; a missing or incomplete receipt
cannot become a successful qualification. Existing Docker/product groups remain
mandatory. The same simulator check now stops the owned ingestion service,
captures a three-record offline backlog, and compares the private checkpoint,
identity and replay inputs across actual demo down/up. Resume must deliver every
source timestamp with exact authenticated history/provenance, and a completed
resume must leave accepted-message totals unchanged. The normal demo service
keeps its read-only input mount; only this disposable qualification adds an owned
writable replay directory, removed by reset. Private inputs, packet bytes and
checkpoints are never evidence artifacts.

Real idle/lifetime qualification additionally uses monotonic persistent playback:
three source captures 20 seconds apart, then 33 captures every 10 seconds through
320 seconds. One-second queue polling releases the first capture promptly; empty
ticks transmit nothing. It observes only established ingestion socket identities inside the
restricted producer namespace (no proxy, traffic capture or changed server limits).
The idle case must witness closure after 15 seconds and a replacement; the lifetime
case must retain the original socket to the 300-second boundary before replacement.
Sparse/missing observations, early churn, accelerated playback, short runs or missing
ACK/history/checkpoint/cleanup evidence fail acceptance. Only elapsed milliseconds,
connection counts and fixed check names enter public evidence; socket identities
remain transient. The extra real-time qualification takes approximately six minutes.
No physical-device or broader simulator-scenario outcome is implied.


The browser fixture build runs
`node --test local/qualification/product/export-response.test.mjs local/qualification/product/inspect-response.test.mjs` against real
Chromium and synthetic loopback HTTP. It consumes an export receipt in the UI, crosses a
document lifecycle boundary, and verifies qualification without relying on an
evicted CDP response body or replaying the export PUT. Status, selected job,
download filename, coverage, row/byte limits and Parquet checks remain required.
The Inspect cases likewise evict hot/restored response bodies after UI consumption.
They require the exact same-origin request URL/status and an independent bounded
authenticated read of the immutable interpretation; the installed witness still
checks the selected route and rendered provenance. Wrong restore selection, denied
reads and different evidence fail. The Inspect action is never repeated.

## Explicit development qualification

SIM-PR20 has a separate `development` inventory. Prepare network-only reviewed
source objects with `pnpm development:sources`, build the normal artifacts, then
run `pnpm qualify:development`. This group cannot replace structural, Docker,
product or simulator acceptance; CI runs each independently. No development
image changes the reviewed artifact lock or passes reviewed image admission.

The smoke requires absent `.local/dev-sources/ui` and `platform` directories.
It creates owned disposable clones, installs frozen UI dependencies without
source credentials, trusts the disposable public CA only inside Chromium, and
checks authenticated HTTPS, SSE, a real source edit through HMR without document
reload, logout, and sample/foreign-origin rejection. It then rebuilds the backend
and matching executors, preserves and resumes a pending producer queue, returns
to reviewed images, and proves owned cleanup. Existing developer clones are
never adopted or reset. See [developer reload](../operations/simulator-demo.md#explicit-unqualified-development-reload)
for manual preparation, recovery, and the source scanner ownership boundary.

## Installed simulator fault envelope

SIM-PR18 adds a qualification-only second registered device; normal demo startup
still creates one. The installed simulator gate requires all eight explicit fault
actions, a two-member/six-capture product fleet, a 12-login disconnect workload
alongside a healthy three-capture producer, and preflight queue-overflow rejection.
A shared start barrier coordinates the concurrent producers. All use the normal
restricted image and private ingress; qualification inputs are mounted read-only.

Fleet execution must report at most 64 KiB queued bytes, six queued records,
256 MiB process RSS, 64 sampled descriptors and five seconds of user+system CPU.
The two-member workload must reach two active client attempts; the neighbor uses
one slot alongside the disconnect producer. These are measured producer workload
bounds, not installed throughput or backend-resource guarantees. FD peaks are
sampled, and producer CPU excludes preparation as defined by the reviewed runtime.

Authenticated history must contain every required source timestamp and no output
from malformed, unregistered or before-write-disconnected records. Duplicates and
optional after-write acceptance remain explicitly allowed. Terminal ingestion
diagnostics require all persisted turns decoded: the pinned live executor rejects
bad input before enqueue, so no poisoned replay record is invented. Relative to
a measured fleet baseline, require eight registered handshakes and four valid data
turns, plus at most one valid after-write turn. The reconnect workload adds exactly
12 empty handshake turns and no decoded data; overflow adds no frames on either
device. The real browser opens each device's selected historical interpretation
in Inspect. Closed receipts/diagnostic
shapes reject private fields; public evidence contains fixed checks and numeric
resource peaks only. Every producer is owner-checked before removal, then the
parent lifecycle must reset its owned installation and retain unrelated resources.
