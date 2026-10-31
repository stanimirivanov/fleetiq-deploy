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
| Device-to-browser acceptance | Separate product inventory, real OIDC/TCP/worker/browser flow, map disposal and mandatory owned cleanup |
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
packages, docker, product and acceptance. Reports include group/check outcomes, source fingerprints,
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

The Docker group also inventories analytics-routing: the pinned real Alertmanager
and a synthetic-only receiver exercise firing/resolved, unreachable router and
restart with owner-checked cleanup. No installed milestone outcome is implied.
