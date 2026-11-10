# Ordered PR-sized implementation tasks
Status: proposed. No issues, branches or repositories created.

## TL;DR
First deliver one Codec 8 device through the real pipeline and browser using PRs 1–7. Then add realistic state/scenarios and independent protocol coverage. Platform and infrastructure need no mandatory v1 change. All proposed command additions are **[new]**, not commands available today.

## Gates and workflow
- **S [new]**, simulator: `pnpm check` = format/lint, strict types, unit/wire/session tests, build and current dependency/secret scans. **SC [new]** `pnpm test:coverage`; **SR [new]** `pnpm test:reference`; **SI [new]** `pnpm image:qualify`. Their scripts must be implemented before they are cited as passed. See [constraints](CONSTRAINTS.md).
- **D existing**, deployment: `pnpm check`, `pnpm local build`, `pnpm qualify`, `pnpm qualify:product`. Add **DS [new]** `pnpm qualify:simulator` in PR7. Existing focused command: `pnpm test`; narrower `node --test <test-file>` is **[new]** for each newly added test file.
- **U existing**, UI: `pnpm check`, `pnpm e2e`, `pnpm verify --group browser-quality`.
- **P existing**, platform reference: `cargo test --locked -p fleetiq-teltonika`, `cargo test --locked -p fleetiq-protocol-wasm --test teltonika` from [package README](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/packages/teltonika/README.md). These verify the selected backend independently; they do not validate our encoder by themselves.
- If scope expands into platform implementation, use `cargo xtask verify --group acceptance --base origin/main` and `cargo xtask verify --group supply-chain` before PR creation, plus the applicable [CONTRIBUTING](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/CONTRIBUTING.md) checks. No platform change is pre-authorized by this plan.
- Infra change is not required. Its existing offline gates are `make verify`, `make validate`; live target operations require separate authorization. [Contributor policy](https://github.com/stanimirivanov/k8s-infrastructure/blob/e3d5f1845217cf047c44d0809cdbe20f03570f07/CONTRIBUTING.md)

Each PR creates/reuses its dedicated issue in the responsible repository after approval, uses `feature/issue-N`, commits `[#N] ...`, opens a linked PR, and stops. Do not create one issue spanning several repositories. No automatic merge, image publication or environment promotion. New producer pins follow qualification/publication policy. Preserve issue #59 and its physical not-run status.

Paths below are repository-relative. All simulator paths are **[new]**. Deployment/UI paths are marked individually. LOC estimates exclude generated output and locks. Tests ship with behavior.

## DAG summary
| ID | Repository / title | Depends on | Parallel lane | Size |
|---|---|---|---|---|
| SIM-PR1 | Simulator: encode a validated Codec 8 record | — | A | M, ~450 |
| SIM-PR2 | Simulator: bounded TCP handshake and ACK | 1 | A | M, ~400 |
| SIM-PR3 | Deployment: explicit host-accessible demo identity | — | B | M, ~450 |
| SIM-PR4 | Deployment: reconcile owned demo metadata | 3 | B | M, ~450 |
| SIM-PR5 | Simulator: qualified restricted image | 2 | A | M, ~250 |
| SIM-PR6 | Deployment: compose the one-device demo lifecycle | 4,5 | C | M, ~450 |
| SIM-PR7 | Deployment: qualify device-to-map and Inspect | 6 | C | M, ~400 |
| SIM-PR8 | Simulator: Codec 8 Extended fidelity | 2 | A | M, ~350 |
| SIM-PR9 | Simulator: route and model IO playback | 8 | A | M, ~450 |
| SIM-PR10 | Simulator: capture triggers and bounded batching | 9 | A | M, ~350 |
| SIM-PR11 | Simulator: durable offline queue recovery | 10 | A | M, ~450 |
| SIM-PR12 | Simulator: deterministic wire fault scenarios | 11 | A | M, ~400 |
| SIM-PR13 | Simulator: bounded fleet scheduling and metrics | 12 | A | M, ~450 |
| SIM-PR14 | Simulator: UDP envelope and ACK correlation | 8 | D | M, ~400 |
| SIM-PR15 | Simulator: Codec 16 independent conformance | 14 | D | M, ~300 |
| SIM-PR16 | Simulator: Codec 12 read-only command fixture | 2 | E | M, ~350 |
| SIM-PR17 | Deployment: qualify offline/restart recovery | 7,11 | C | M, ~400 |
| SIM-PR18 | Deployment: qualify faults, bounds and diagnostics | 13,17 | C | M, ~450 |
| SIM-PR19 | UI: opt-in connected development routing | 7 | F | M, ~300 |
| SIM-PR20 | Deployment: compose development reload | 18,19 | F | M, ~350 |

Parallel means dependencies satisfied and file ownership coordinated. PR8/14/15 share encoder helpers; merge 8 before 14, and isolate transport from codecs. PR16 touches TCP parsing, so rebase after PR2 and coordinate any PR12 changes. PR17 can proceed while 12/13 develop. No numeric merge order overrides the DAG.

## Merge order and checkpoints
1. PR1 + PR3 → checkpoint C1: S; deployment `pnpm check`; identity HTTPS happy/rejection tests. Human review of config/privacy/topology.
2. PR2 + PR4 → checkpoint C2: S; D; provisioning exact retry/collision and real OIDC tests. No claim of installed simulator yet.
3. PR5 → PR6 → PR7 → checkpoint C3: S, SI, D, DS. **First complete thin slice.** Read actual receipts and verify cleanup; human review before expanding simulation behavior.
4. PR8 → PR9; PR16 may proceed → checkpoint C4: S, SC, SR; existing DS on unchanged product pins need not be rerun merely for standalone command tests.
5. PR10 → PR11 → PR17 → checkpoint C5: S, D, DS; offline capture and retained down/up recovery.
6. PR12 → PR13 → PR18 → checkpoint C6: S, SC, D, DS; loss/duplicate/overflow counters and two-session product bounds.
7. PR14 → PR15 (parallel with stages 4–6 where boundaries permit) → checkpoint C7: S, SR; UDP/16 remain simulator conformance only.
8. PR19 → PR20 → checkpoint C8: U, D, DS, SI and S/SC on final simulator artifact. Verify reviewed-image acceptance separately from dev mode. Human review of final evidence and deferred gaps.

## SIM-PR1 — Encode a validated Codec 8 record
**Owner / scope:** simulator, M08. Functional offline encode/validate CLI plus the minimum repository/toolchain/CI contract consumed by all later PRs. No sockets.
**Acceptance:** literal independent byte/CRC vectors and invalid-width/count cases pass; identities are file-only and redacted; CLI rejects unknown fields and oversized inputs before allocation.
**Files:** `package.json`, `tsconfig.json`, `src/wire/codec8.ts`, `src/cli.ts`, `tests/codec8.test.ts`, plus minimal CI/constraint/schema metadata **[new]**.
**Tests first / gates:** begin with a failing known-byte encoder test and CLI invalid-input test; S and SC **[new]**. Add deliberately failing quality fixtures to prove gates fail closed.
**Contract / size:** new config/CLI version 1, no product change; M ~450 LOC, ~8 files. One-time bootstrap file-count exception keeps this a usable offline tool, not an empty scaffold.

## SIM-PR2 — Bounded TCP handshake and ACK
**Owner / scope:** simulator. Send one record to an independent socket peer. No route engine.
**Acceptance:** partial/coalesced replies and login refusal handled; only exact count completes packet; strict single-batch mode retires every connection before the next batch, including after success; persistent mode explicitly assumes no unsolicited duplicate server ACKs.
**Files:** `src/session/tcp.ts`, `src/session/state.ts`, `src/cli.ts`, `tests/tcp.test.ts`, `tests/peer.ts` **[new/modified after PR1]**.
**Tests first / gates:** failing real-loopback tests for a valid ACK followed by a delayed duplicate during an equal-count next batch, missing ACK and bounded shutdown; S, SC. Inject clock for retry logic, retain real socket tests.
**Contract / size:** observable retry/exit semantics new; M ~400 LOC, 5 files. Depends PR1.

## SIM-PR3 — Host-accessible demo identity
**Owner / scope:** deployment. Add opt-in local issuer, canonical origins, certificates and trust-preflight design. Do not change normal OIDC startup.
**Acceptance:** same issuer URL works for host/browser and backend; invalid SAN/origin/issuer fails; generated credentials and CA key stay private; stable registrations/signing identity survive restart while sessions expire and seed reauthenticates.
**Files:** `local/demo/issuer.mjs`, `local/demo/identity.yaml`, `tools/demo-identity.mjs`, `tools/tests/demo-identity.test.mjs` **[new]**; `docs/operations/local-installation.md` modified.
**Tests first / gates:** failing issuer-origin/trust/restart tests, actual loopback HTTPS discovery; D. Explicitly distinguish operator CA trust prerequisite from automated isolated-browser trust.
**Contract / size:** additive BEHAVIOR-ADJACENT demo identity; M ~450 LOC, 5 files. No production authentication claim.

## SIM-PR4 — Reconcile owned demo metadata
**Owner / scope:** deployment. Provision private generated identity → tenant/assets/device → package admission/route → coordinate bindings using existing trusted APIs.
**Acceptance:** exact rerun and interruption after each provisioning step preserve IDs/revisions; incompatible or foreign state refuses; distinct synthetic devices are correctly routed and denied outside tenant.
**Files:** `tools/demo-seed.mjs`, `local/demo/seed.mjs`, `tools/tests/demo-seed.test.mjs`, `docs/operations/simulator-demo.md` **[new]**.
**Tests first / gates:** failing content-collision/restart tests then authenticated real API provisioning; D. Read existing seed as precedent, do not reuse fixed disposable IDs blindly.
**Contract / size:** BEHAVIOR-ADJACENT local state creation, existing APIs unchanged; M ~450 LOC, 4 files. Depends PR3. Reset is not a provisioning retry.

## SIM-PR5 — Qualified restricted simulator image
**Owner / scope:** simulator. Package the working CLI as an immutable nonroot image and define its source/result identity.
**Acceptance:** image starts CLI with read-only root/no capabilities; no embedded identities/secrets; scan and source-label tests pass.
**Files:** `Dockerfile`, `.dockerignore`, `tools/image-qualify.mjs`, `tests/image.test.ts`, CI metadata **[new]**.
**Tests first / gates:** negative image/secret/identity fixtures; S, SI **[new]**. Publication remains separately authorized.
**Contract / size:** new artifact identity contract; M ~250 LOC, 5 files. Depends PR2.

## SIM-PR6 — One-device demo lifecycle
**Owner / scope:** deployment. Compose normal installation, pipeline, seed and simulator, with owned up/down/reset. No extra product features.
**Acceptance:** startup waits for real provisioning/readiness before simulation; down/up retains exact state; reset refuses foreign owner/context and preserves unrelated containers/volumes.
**Files:** `local/demo/compose.yaml`, `tools/demo.mjs`, `tools/tests/demo.test.mjs` **[new]**; `tools/local.mjs`, `local/artifacts.lock.json` modified.
**Tests first / gates:** failing ownership and service-order tests, real lifecycle/cleanup; D. Pin qualified simulator source/image, extend lock validation in the existing owner if required; split lock-schema work only if actual size exceeds this slice.
**Contract / size:** additive BEHAVIOR-ADJACENT lifecycle commands; M ~450 LOC, 5–6 files. Depends PR4/5. Ordinary down is nondestructive.

## SIM-PR7 — Device-to-map and Inspect acceptance
**Owner / scope:** deployment. Add DS for one actual simulator process using normal UI and real OIDC. Keep existing product fixture.
**Acceptance:** one Codec8 record produces wire ACK, durable/projection query and selected map point; Inspect shows matching source timestamp/package/coordinate evidence; wrong IMEI cannot create accepted data and owned cleanup succeeds.
**Files:** `tools/simulator-qualification.mjs`, `local/demo/browser.mjs`, `tools/tests/simulator-qualification.test.mjs` **[new]**; `package.json`, `tools/ci.mjs` modified (workflow rendering follows existing policy).
**Tests first / gates:** first run must fail with absent simulator output, stale/sample UI or broken binding; D, DS **[new]**. Poll bounded real outcomes rather than sleep-based assertions.
**Contract / size:** new evidence schema/check IDs; M ~400 LOC, 5 files plus generated workflow. Depends PR6. This completes the first thin slice.

## SIM-PR8 — Codec 8 Extended fidelity
**Owner / scope:** simulator. Add two-byte IO IDs/counts and variable IO, preserving fixed-width bytes.
**Acceptance:** reviewed independent vectors match; ID/count/variable boundaries reject; 8 and 8E do not get conflated.
**Files:** `src/wire/codec8e.ts`, `src/wire/codec8.ts`, `src/config/schema.json`, `tests/codec8e.test.ts` **[new/modified]**.
**Tests first / gates:** failing golden and malformed-length tests; S, SC, SR **[new]**. Compare with real platform package separately for supported inputs.
**Contract / size:** additive config enum, schema-version compatibility documented; M ~350 LOC, 4 files. Depends PR2.

## SIM-PR9 — Route and model IO playback
**Owner / scope:** simulator. GeoJSON playback with speed/stops/ignition, documented IO values and GPS-loss mode. No road-routing service/GPX parser.
**Acceptance:** fixed seed/route/time produces exact positions/raw IO; invalid coordinates/unsafe integers fail; stationary/GPS-loss values preserve declared quality expectations.
**Files:** `src/scenarios/route.ts`, `src/scenarios/profile.ts`, `profiles/fmb920-docs-v1.json`, `tests/route.test.ts`, `scenarios/normal-day.json` **[new]**.
**Tests first / gates:** failing negative-coordinate/stop/drift/IO-width tests; S, SC.
**Contract / size:** profile is documented simulation, not hardware support; M ~450 LOC, 5 files. Depends PR8.

## SIM-PR10 — Capture triggers and bounded batching
**Owner / scope:** simulator. Separate capture/send scheduling; time/event/stop triggers and bounded FIFO batches.
**Acceptance:** on-event and periodic records both reach batches; frame-byte and record limits split without loss; event time/drift never drives ACK deadlines.
**Files:** `src/scenarios/capture.ts`, `src/scenarios/clock.ts`, `src/session/batches.ts`, `tests/batches.test.ts` **[new]**.
**Tests first / gates:** virtual-time trigger/boundary tests before implementation; S, SC.
**Contract / size:** configurable scheduling, explicitly accelerated profile; M ~350 LOC, 4 files. Depends PR9.

## SIM-PR11 — Durable offline queue recovery
**Owner / scope:** simulator. Offline capture, bounded private spool and exact resume.
**Acceptance:** network outage retains frozen records and recovery drains oldest first; kill/restart at enqueue, send, ACK and cursor commit resumes pending work without claiming exactly-once; overflow/corruption/config mismatch fail with safe diagnostics.
**Files:** `src/session/spool.ts`, `src/session/state.ts`, `src/cli.ts`, `tests/spool.test.ts`, `scenarios/offline.json` **[new/modified]**.
**Tests first / gates:** crash-at-commit and malformed-checkpoint tests; S, SC. Test atomic file replace under private owned directory.
**Contract / size:** new checkpoint version; rollback retains files and refuses unknown version; M ~450 LOC, 5 files. Depends PR10.

## SIM-PR12 — Deterministic fault scenarios
**Owner / scope:** simulator. Add faults listed in spec without weakening valid encoders.
**Acceptance:** faults repeat by packet ordinal; truncation/CRC/identity/disconnect failures stay bounded; split writes, duplicates and late event times preserve intended raw records.
**Files:** `src/scenarios/faults.ts`, `src/session/tcp.ts`, `tests/faults.test.ts`, `scenarios/faults.json` **[new/modified]**.
**Tests first / gates:** exact mutated-byte/connection tests then S, SC; separate valid-data and deliberately-invalid modes.
**Contract / size:** faults local-target opt-in; M ~400 LOC, 4 files. Depends PR11.

## SIM-PR13 — Fleet scheduling and metrics
**Owner / scope:** simulator. N logical devices, fair bounded concurrency and diagnostic metrics.
**Acceptance:** unique private identities and independent seeds/clocks; two-session product profile versus 100-session peer profile enforced; retries release slots and healthy devices progress; memory/queue/latency/counter output distinguishes simulated loss from server failure without identity labels.
**Files:** `src/scenarios/fleet.ts`, `src/telemetry.ts`, `tests/fleet.test.ts`, `tests/telemetry.test.ts`, `scenarios/reconnect-storm.json` **[new]**.
**Tests first / gates:** failing fairness/cardinality/redaction tests and bounded peer workload; S, SC and **[new]** `pnpm test:bounds`. Record actual RSS/FD/CPU, not inferred scaling.
**Contract / size:** no platform limit increase; M ~450 LOC, 5 files. Depends PR12.

## SIM-PR14 — UDP envelope and ACK correlation
**Owner / scope:** simulator only. Encode datagrams and validate correlated responses against independent peer.
**Acceptance:** exact envelope/length/identity bytes; both IDs/source/count checked including rollover/stale response; timeout retries bounded without TCP framing.
**Files:** `src/session/udp.ts`, `src/wire/udp.ts`, `tests/udp.test.ts`, `tests/udp-peer.ts` **[new]**.
**Tests first / gates:** literal datagram vectors and incorrect-ID/channel-only ACK tests; S, SR.
**Contract / size:** config rejects UDP with FleetIQ compatibility target; M ~400 LOC, 4 files. Depends PR8. No installed UDP claim.

## SIM-PR15 — Codec 16 conformance
**Owner / scope:** simulator only. Distinct encoder with generation type.
**Acceptance:** manufacturer vector and independent reference agree on one-byte total and reviewer records an explicit provisional interpretation; contradictory evidence blocks conformance claims; full-width IO IDs preserved; unresolved spec conflict fails qualification rather than selecting convenient output.
**Files:** `src/wire/codec16.ts`, `tests/codec16.test.ts`, `contracts/reference-vectors.md` **[new]**; config modified.
**Tests first / gates:** independent expected bytes before implementation; S, SR. Reference runner revision/license pinned before use.
**Contract / size:** no automatic FMB920 Codec16 support claim; generic conformance profile only; M ~300 LOC, 4 files. Depends PR14.

## SIM-PR16 — Codec 12 read-only command fixture
**Owner / scope:** simulator. Handle documented getinfo command after AVL completion against independent command server. No platform queue or actuation.
**Acceptance:** type/length/CRC validation and correct 06 response envelope; fragmented commands bounded; unsupported/malformed commands rejected and never executed as shell/config.
**Files:** `src/wire/codec12.ts`, `src/session/command.ts`, `tests/codec12.test.ts`, `tests/command-peer.ts` **[new]**.
**Tests first / gates:** independent command vectors plus wrong-state/oversize tests; S, SR.
**Contract / size:** opt-in command fixture, not product command acceptance; M ~350 LOC, 4 files. Depends PR2.

## SIM-PR17 — Installed offline and restart recovery
**Owner / scope:** deployment. Pin reviewed scenario-capable producer and qualify offline/idle/lifetime/retained restart.
**Acceptance:** >15-second idle and >300-second session runs recover without invented heartbeats; offline backlog becomes readable in correct source-time order; down/up preserves private identity and resumes without metadata collisions.
**Files:** `local/demo/recovery.mjs`, `tools/tests/simulator-recovery.test.mjs` **[new]**; `tools/simulator-qualification.mjs`, `local/artifacts.lock.json` modified.
**Tests first / gates:** failing installed interruption/restart witnesses; D, DS. Account for allowed duplicate accepted records; do not assert exactly-once.
**Contract / size:** evidence additions only; M ~400 LOC, 4 files. Depends PR7/11.

## SIM-PR18 — Installed faults, cost bounds and diagnostics
**Owner / scope:** deployment. Qualify two concurrent sessions, negative frames, reconnect storms, isolation and redacted failure receipts.
**Acceptance:** invalid frame does not earn success ACK; healthy neighbor remains usable within declared envelope; queue/CPU/RSS/FD bounds measured and browser/Inspect still identifies selected source.
**Files:** `local/demo/fault-acceptance.mjs`, `tools/tests/simulator-fault-acceptance.test.mjs` **[new]**; qualification, artifact lock and demo runbook modified.
**Tests first / gates:** failing no-output/leak/overflow/cleanup controls; D, DS. Update reviewed simulator pin; scan final dependencies before opening PR.
**Contract / size:** no throughput promise or weakened product gates; M ~450 LOC, 5 files. Depends PR13/17.

## SIM-PR19 — Connected UI development routing
**Owner / scope:** UI. Explicit connected dev-server configuration that can sit behind demo HTTPS edge.
**Acceptance:** API/SSE/session paths retain same-origin behavior; HMR works without sample fallback or credential exposure; production build and browser quality limits unchanged.
**Files:** `apps/web/vite.config.ts` modified; `tools/tests/connected-dev.test.mjs`, `docs/development/connected-demo.md` **[new]**; `apps/web-e2e/playwright.development.config.ts` modified.
**Tests first / gates:** failed connected-origin/HMR smoke first; U. Verify this proposed scoped test path against UI tools guidance at implementation.
**Contract / size:** BEHAVIOR-ADJACENT dev behavior, no public API change; M ~300 LOC, 4 files. Depends PR7.

## SIM-PR20 — Development reload composition
**Owner / scope:** deployment. Opt-in HMR overlay and explicit backend rebuild/restart; document return to reviewed-image mode.
**Acceptance:** host browser sees UI edit over valid HTTPS; backend rebuild replaces matching executors and preserves queue/database; acceptance refuses development artifacts as reviewed releases.
**Files:** `local/demo/dev.yaml`, `tools/demo-dev.mjs`, `tools/tests/demo-dev.test.mjs` **[new]**; demo lifecycle and runbook modified.
**Tests first / gates:** failed source/provenance/foreign-path tests; D, DS with reviewed artifacts, separate dev smoke. No source-tree auto-reset.
**Contract / size:** BEHAVIOR-ADJACENT opt-in development lifecycle; M ~350 LOC, 5 files. Depends PR18/19.

## Traceability and uncovered work
| Requirement | Tasks |
|---|---|
| New repository, quality, image, CLI/config | 1,2,5 |
| TCP handshake/ACK/resend | 2,11,17 |
| Codec8/8E/16 | 1,8,15 |
| UDP | 14,15 — simulator conformance only |
| Codec12 commands | 16 — peer conformance only |
| IO, routes, periodic/event data, batching, drift | 9,10 |
| Offline buffering, restart and backoff | 2,11,17 |
| Fleet, deterministic scenarios, faults, metrics | 12,13,18 |
| One-command local product, seed, private secrets, teardown | 3,4,6,7 |
| Map/Inspect and real installed evidence | 7,17,18 |
| Developer UI reload/backend rebuild | 19,20 |
| Kubernetes evaluation / ownership | Comparison only; no infra PR |
| MQTT, GPX, road routing, remaining command codecs | Explicitly deferred |
| Installed UDP/Codec16/remote commands, >2 concurrent sessions per peer | Platform gaps; not covertly implemented by simulator |
| Physical device qualification / issue #59 | Excluded; real laboratory evidence still required |

All planned tasks originate in this proposed M08 tooling work. No M07 prerequisite/stub is introduced. If the owner requires the deferred transports/commands as installed v1 capabilities, replan into separately scoped platform contracts and producer releases before implementation; those are material boundary changes.
