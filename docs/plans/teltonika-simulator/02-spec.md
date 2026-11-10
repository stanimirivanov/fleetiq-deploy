# Simulator and local-run specification
Status: proposed, pending review. No simulator repository exists yet.

## TL;DR
Create `fleetiq-simulator` as an independent TypeScript CLI. Deployment composes it with the real TCP pipeline and UI. Deliver the one-device path first. Keep protocol conformance, installed product acceptance and physical hardware qualification distinct.

## Objectives and capability map
| Capability | Owner | Depends on |
|---|---|---|
| wire-session | simulator | independent byte vectors |
| scenario-engine | simulator | wire-session |
| local-identity | deployment | existing HTTPS/OIDC backend |
| demo-provisioning | deployment | local-identity, existing metadata/admission APIs |
| installed-simulator | deployment | wire-session, demo-provisioning |
| installed-evidence | deployment | installed-simulator, real UI |
| developer-reload | UI + deployment | installed-evidence |

Success is an authenticated browser showing map/history/Inspect data produced by a separate process sending actual binary TCP frames. Backend storage and semantic binding stay authoritative. No HTTP telemetry injection or direct database seeding substitutes for that path. Existing setup patterns are [API provisioning](../../../local/qualification/product/api.mjs), [TCP pipeline](../../../local/pipeline/compose.yaml), and [map URL/selection](../../../local/qualification/product/page.mjs).

## Decisions & Assumptions
These are proposals, not accepted ADRs or changes to existing policy.
- **D1 — ownership:** new repository required by the user; propose canonical name `fleetiq-simulator`. Deployment owns composition and this draft; simulator owns wire generation/scenarios. Reject placement inside backend/deploy as the final implementation.
- **D2 — stack:** strict TypeScript, Node 24.18.0/pnpm 12.5.1 initially, matching inspected tooling. Native Buffer/net/dgram and node:test; no imported backend encoder/decoder. Rust is viable but increases build overhead and risks sharing the oracle. Pin/review versions again at implementation. [Existing sender](../../../local/qualification/product/device.mjs), [tool lock](../../../local/artifacts.lock.json)
- **D3 — milestone:** assign implementation to **M08 - Production Readiness**, as test tooling supporting capacity/failure readiness. M07 physical evidence and M09 customer validation remain separate. This does not complete M08 or move issue #59. No new milestone is necessary unless the owner wants independent scheduling. [Roadmap](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/docs/roadmap/milestones.md)
- **D4 — v1 support:** installed TCP8/8E, simulator-only UDP8/8E/16 and TCP16 conformance, simulator-only Codec12 read-only `getinfo` response fixture. MQTT and command codecs 13/14/15/17, GPX import, online routing, physical firmware emulation, command actuation are deferred. See [protocol evidence](01-protocol-notes.md). This scope needs confirmation.
- **D5 — fleet:** one-device default, two concurrent sessions maximum in the FleetIQ compatibility profile; N devices rotate through those slots. Separate reference-peer profile targets 100 concurrent simulated devices. Neither target is measured yet. Raising product limits is a separate platform capacity change. [Current limits](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/crates/server/src/tcp_ingestion/transport.rs)
- **D6 — local identity, BEHAVIOR-ADJACENT:** add an explicit local-only demo issuer/tenant, never normal-startup fallback. Local processes are trusted; generated credentials remain private. HTTPS browser trust is a prerequisite, not bypassed by a script.
- **D7 — lifecycle, BEHAVIOR-ADJACENT:** new demo commands create owned local state. Down retains it; explicit reset checks owner/target and removes only demo-owned resources. Repeated up reconciles exact existing content and refuses collisions.
- **D8 — ACK semantics:** completion means matched wire ACK only. Projection and UI evidence are separate. The default strict connection policy sends at most one AVL batch per connection; missing/wrong ACK closes the uncertain socket before retrying frozen bytes. Optional persistent device-like sessions assume a compliant server emits exactly one ACK per batch and cannot detect arbitrary extra equal-count application replies. Cross-session duplicates are retained as permitted by existing backend semantics, not silently deduplicated. [Accepted-message identity](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/crates/ingestion/src/live_session/session/turn.rs)
- **D9 — route/model:** GeoJSON LineString first, documentation-derived FMB920 IO profile plus clearly generic codec test profiles. No firmware-specific support badge. Example route is original synthetic data with no real driver track.
- **D10 — resource proposals:** simulator 256 MiB/one CPU, 100 devices maximum in peer-only scale tests, 1000 queued records/device and 16 MiB aggregate encoded queue. Bounds are initial review targets, not benchmark results.
- **D11 — integration:** normal reviewed images remain acceptance authority. Hot reload is an explicitly unqualified development overlay, never a reason to alter release locks or relax auth.
- **D12 — no breaking product contract planned:** no HTTP/schema/WIT change is necessary for installed v1. Optional future UDP/Codec16/command support requires its own platform contract review.

## Behavior and state
A device captures records on a virtual schedule independent of transmission. Use separate monotonic timeout time and device event time with configurable offset/drift. Fixed seed, scenario version, profile, identity digest, start timestamp and route digest reproduce the generated record stream. Network scheduling and database IDs are not promised byte-identical.

State transitions: idle → connect → identify → ready → wait-ACK → ready; any uncertain reply → close → backoff → identify → resend. Permit one unacknowledged packet/device. Default strict mode retires the connection after each successful batch as well; this prevents an extra application ACK from being credited to a later batch. This is a conservative simulator policy, not a claim that hardware normally reconnects per batch. Persistent mode is an explicit fidelity/performance trade-off and excludes faulty-server duplicate ACKs from its correctness guarantee. Codec12 conformance can keep the connection for a command-only window after its sole AVL batch, without sending another AVL batch. Do not discard queued records until exact ACK. Never carry reply bytes into a new connection. Reject explicit login denial; fault scenarios may retry within a declared budget. Buffer fragmented replies and bound oversized/coalesced input. Scheduled offline periods continue capture; batch oldest first, constrained simultaneously by receiver frame bytes and record count. Queue overflow fails the run visibly; a discard-oldest mode is optional only as an explicit fault scenario.

Limit retries to five attempts per batch by default, with a bounded run deadline; exhausted batches remain visible in final counts/private checkpoint. Persist private queue/cursor/identity state atomically if process restart recovery is selected. Never regenerate an unacknowledged packet after changing route or clock settings. Delay profiles are either documented device-like timing or clearly labeled accelerated lab timing. Idle and lifetime disconnects are expected; do not invent keepalive AVL records to defeat platform limits.

Route replay interpolates by distance and speed along supplied geometry, computes heading, handles stationary periods, ignition cycles, trip boundaries and GPS-loss quality. This is kinematic simulation, not RF, CAN, driving physics or road navigation. Units/raw IO scaling are profile-owned. Fixed-width 8-byte values use bigint internally/hex externally; unsafe JS number conversion fails validation.

Scenarios: normal day, stops/ignition, harsh acceleration/braking synthetic events, long offline gap, GPS loss, clock offset/drift, duplicate record, out-of-order event time and reconnect storm. Event IO IDs come from a selected profile; unsupported harsh-event IDs cannot be invented. A basic harsh scenario can change speed without claiming a vendor-specific event classifier.

Fault actions target a deterministic device/packet ordinal: corrupt CRC, truncate/close, split writes, duplicate complete record, reorder event timestamps, use unregistered identity, disconnect before/after write. A split write is not guaranteed to become separate network packets. Invalid inputs require no successful acceptance ACK; disconnect is an acceptable observed denial for current FleetIQ. Fault traffic is limited to explicitly authorized local targets.

## Project structure and conventions
All paths below are **[new]**, in the future simulator repository.
`src/wire/` pure encoders/CRC and bounded response parsers; `src/session/` transport state; `src/scenarios/` virtual clock/routes/fleet; `src/config/` schema and cross-field validation; `src/cli.ts`; `src/telemetry.ts`; `tests/`; `profiles/`; `scenarios/`; `contracts/`; `Dockerfile`.
Avoid a monorepo and control web service. Strict TS, explicit error variants, immutable queued packets, injected clocks/socket ports, abortable I/O, bounded collection growth. Keep transport outside wire/scenario logic.

## Prior art and dependency choices
| Problem | Source | Recommendation / implementation impact | License, weight and fit |
|---|---|---|---|
| TCP stream/backpressure | [Node24 net](https://nodejs.org/download/release/v24.18.0/docs/api/net.html) | Adopt built-in API behind session wrapper; no new runtime package | Existing runtime; handle drain/timeouts explicitly |
| Schema validation | [Ajv guide](https://ajv.js.org/guide/getting-started.html), [MIT license](https://raw.githubusercontent.com/ajv-validator/ajv/master/LICENSE) | Add Ajv to simulator, strict local JSON Schema only; deployment already uses it | Small validator versus a framework; exact installed/transitive weight UNVERIFIED until lockfile review; no remote schema fetch |
| Independent protocol oracle | [Traccar decoder](https://raw.githubusercontent.com/traccar/traccar/master/src/main/java/org/traccar/protocol/TeltonikaProtocolDecoder.java), [Apache-2.0](https://raw.githubusercontent.com/traccar/traccar/master/LICENSE.txt) | Adapt test reasoning, no runtime dependency or copied Java; optional pinned test-only decoder runner | Full Java server is unnecessary runtime weight; any borrowed source needs attribution/license review |
| Route interchange | [GeoJSON RFC7946 §§3.1.1,3.1.4](https://www.rfc-editor.org/rfc/rfc7946) | Adapt LineString contract, native JSON validation, no library | Standard lon/lat representation; route data license is separate |
| Product provisioning, identity, evidence | Existing deployment [api](../../../local/qualification/product/api.mjs), [issuer](../../../local/qualification/product/issuer.mjs), [runner](../../../tools/product/qualify.mjs) | Adapt patterns into opt-in demo owners; do not import scenario main or copy its fixed seed | No new broker/database; issuer dependency exists in deployment. Disposable state must be redesigned for restart |
| Kubernetes | [isolated profile](https://github.com/stanimirivanov/k8s-infrastructure/blob/e3d5f1845217cf047c44d0809cdbe20f03570f07/docs/isolated-local-consumers.md) | Reuse later; no new infra v1 dependency | Already owned provider lifecycle; unnecessary for first device-to-browser slice |

Exact npm graph size and new repository licensing are UNVERIFIED. Owner selects repository visibility/license before creation. No source is copied from third-party projects in this planning session.
