# External interfaces and ingestion boundary
Status: proposed. Every CLI and simulator schema here is **[new]** unless labeled existing.

## TL;DR
The simulator speaks device wire protocol only. Deployment provisions tenant/device/package/binding state through existing trusted interfaces. No browser or database credential enters the simulator.

## Versioned config
JSON Schema draft 2020-12, `schemaVersion: 1`, reject unknown keys and invalid combinations. Version config, model profile, scenario semantics and evidence independently. Use decimal strings for epoch milliseconds and hex for raw IO bytes. Do not store identities in checked-in examples.

| Field | Type / proposal |
|---|---|
| schemaVersion / profile | 1 / versioned profile ID |
| target | transport tcp or udp, host, port, explicit allowlisted address scope; default 127.0.0.1:55027 |
| identityFile | private file reference mapping logical device IDs to unique 15-digit strings; never inline IMEIs |
| scenarioFile / routeFile | bounded local JSON paths, no HTTP fetch; route LineString |
| seed / startTimeMs | string / decimal string; start time required for deterministic mode |
| clock | real or accelerated; scale, signed offsetMs, bounded driftPpm |
| fleet | count, maxConcurrent; FleetIQ profile maxConcurrent ≤2 |
| records | intervalMs, sendIntervalMs, batchRecords ≤16, frameBytes ≤1280 |
| queue | perDeviceRecords ≤1000, globalBytes ≤16777216, maxAgeMs, overflow fail |
| retry | timingProfile, ackDeadlineMs (30000), maxAttempts (5), totalDeadlineMs (600000) |
| connectionPolicy | single-batch (default) or persistent-compliant-peer; latter cannot identify arbitrary extra count-only ACKs |
| faults | bounded array of typed action/device/record-ordinal entries |
| output | private state directory, sanitized result path, optional metrics port |

A runnable example is created by `fleetiq-simulator init --directory <private-dir>` **[new]**. Tracked templates contain logical IDs and file placeholders only. No undocumented global synthetic IMEI reservation is assumed. Identity generation writes unique values privately within an isolated local tenant; synthetic IMEIs are not cryptographic secrets but remain excluded from Git per user instruction. Protect against accidental real endpoint use independently of the numeric values.

Config validation covers byte widths, count sums, route extent/point budget, seed/time validity, duplicate identities, packet bounds and incompatible transport/profile choices. The config file limit is 1 MiB; route limit 100,000 points and 8 MiB, proposed. Paths must be regular files under the selected private instance/approved input root; do not follow links into credentials. Schema errors report field paths/categories, never values.

## CLI / control interface
| Command, all [new] | Result |
|---|---|
| `fleetiq-simulator validate --config <path>` | Offline validation, safe errors, no network |
| `fleetiq-simulator run --config <path>` | Foreground bounded fleet, JSON logs, final result |
| `fleetiq-simulator encode --config <path> --output <private-path>` | Deterministic offline bytes for conformance; never stdout frame dumps |
| `fleetiq-simulator init --directory <private-dir>` | Private generated sample identities/config; refuses existing/foreign state |
| `fleetiq-simulator resume --config <path>` | Exact checkpoint/schema/config-digest match required |

Exit 0 = all declared checks complete, 2 = invalid configuration, 3 = target/retry failure, 4 = resource/evidence violation, 130 = cancelled/incomplete. Exit 0 never means UI acceptance. SIGINT/SIGTERM stop new capture, persist pending state within ten seconds, close sockets and label outstanding work. No HTTP control API in v1; scenario files are the control interface.

## Boundary and compatibility
Existing native path: simulator → TCP listener → admitted identity-world component → registered tenant/device/channel → accepted messages → replay → semantic binding → current/history → same-origin browser.
Sources: [TCP config](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/crates/server/src/tcp_ingestion/config.rs), [component](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/packages/teltonika/src/lib.rs), [pipeline](../../../local/pipeline/compose.yaml), [browser API](https://github.com/stanimirivanov/fleetiq-ui/blob/cdffdc25b1c45048e56dd861170807f136d6ca52/apps/web/src/shared/api/browser-api.ts).

Provisioning uses the existing bootstrap process then existing browser-authenticated admin tenant/actor APIs, properties/types/assets/device endpoints, protocol artifact PUT/admissions/route revision and signal bindings. Package identity/version/digest is explicit. Route updates use expected revision. Seed calls are content-aware and idempotent, refuse foreign tenant/device state and never reset revisions to zero. Model names and current properties do not grant access. [Existing API seed and exact routes](../../../local/qualification/product/api.mjs), [published paths](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/contracts/http/openapi/paths/protocol-packages/device-route.yaml)

The simulator has no SQL, package upload, tenant selection or HTTP telemetry fallback. Deployment's short-lived seed runner gets its own private session; cookies never enter reports or simulator volumes. Plan-only example map parameters select latitude/longitude property versions and `encoding=e7`, matching [existing browser path](../../../local/qualification/product/page.mjs).

| Proposed change | Classification | Consumer impact |
|---|---|---|
| Simulator repo/config/CLI | New contract | No existing consumer; semantic versioning and schema rejection |
| Demo Compose/issuer/seed/lifecycle | Additive, BEHAVIOR-ADJACENT | Opt-in only; normal up still requires configured OIDC |
| Installed simulator acceptance | Additive test behavior | New qualification command; existing product sender remains |
| UI development proxy/HMR | BEHAVIOR-ADJACENT, development only | Preserve same-origin HTTPS/session/CSRF/CSP; no production bundle change |
| Platform TCP/HTTP/database/WIT | No v1 change | Existing behavior remains authority |
| UDP gateway, Codec16 decode, remote commands | Deferred, NOT implemented by simulator | Separate platform design/security review and producer release required |

If UDP is later required end to end, prefer a platform-owned bounded UDP ingestion adapter sharing trusted admission/durability orchestration. A UDP-to-TCP bridge can be a test utility but cannot claim original datagram identity, host timestamps, routing or ACK durability equivalence. Do not use it as product support. A separate gateway service adds identity and durable handoff contracts; it is not necessary for current TCP.

Remote commands need authorization, durable correlation/expiry/audit and session ownership in the platform; a Codec12 emulator alone supplies none of these. Current omission is explicit in [platform state](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/docs/development/current-state.md) and [package exclusions](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/packages/teltonika/README.md).

## Telemetry contract
NDJSON events carry schemaVersion, runId, entryPoint, opaque deviceAlias, event, transport, codec, attempt, recordCount, durationMs and fixed error category. Never log identities, raw bytes, routes, command text, credentials or URLs with secrets. Do not add tracing IDs to Teltonika wire fields.

Metrics: connected-device gauge, packets/records sent, ACKs, resends, rejects, queued records/bytes, drops, ACK-latency histogram. Labels limited to codec, transport and bounded outcome; no device/run/tenant/IMEI labels. Default emit snapshots to stdout; optional Prometheus read-only listener binds loopback, disabled by default.

Final evidence separates generated/sent/acknowledged/queued/failed counts, scenario digest, seed, producer versions, configured limits and completion status. Installed receipt additionally records durable/read/browser outcomes and cleanup. Reconcile counters under retry; packet sends may exceed logical batches.

## Checkpoint and scheduling decisions
These are proposed simulator contracts, not manufacturer guarantees.

Checkpoint v1 contains schema/encoder/profile/scenario versions, config/route/identity digests, per-device capture ordinal and route cursor, virtual time, random-stream counter, FIFO records, frozen in-flight packet bytes, retry count and terminal status. No raw identity appears in the public receipt. Resume requires the exact encoding/profile/config fingerprint; no automatic migration. Time spent stopped does not advance virtual time by default. Explicit later gap simulation must generate records through the capture engine.

Persist an enqueue before making the record eligible to send. Atomically commit acknowledged removal and the associated cursor together using a private temporary file, flush, rename and directory flush. After a crash before that commit, retransmit the frozen batch, accepting possible duplication. After the commit, do not resend it. Never advance the capture cursor without persisting its generated records. Partial writes, checksum mismatch and unsupported checkpoint versions fail visibly, preserving the previous valid checkpoint. Test crashes on both sides of each boundary; “exact resume” does not mean exactly-once server effects.

Fleet scheduling uses round-robin among eligible devices, one batch per turn. A backoff or simulated offline interval releases its slot; re-entry joins the tail. Default global reconnect launch rate is two per second with deterministic per-device jitter in accelerated mode. Fairness tests include a permanently failing device alongside healthy devices. Exhaustion marks that device failed but permits other devices to finish; any unexpected device failure makes the aggregate run nonzero. Expected fault outcomes are explicit assertions, not ignored errors.

Default queue age is 24 virtual hours, measured from capture time before drift; expiry fails rather than drops silently. ACK deadline is 30 monotonic seconds and run deadline 600 monotonic seconds, independent of virtual acceleration. Configurable bounds are ACK 100 ms–60 s, run 1 s–24 h, attempts 1–100, age 1 ms–7 virtual days; scenario checks reject combinations that cannot meet their declared success window. A device-like backoff may legitimately exhaust the run deadline; the result is incomplete, never success.

The 16 MiB aggregate budget accounts for serialized queued records, checkpoint metadata and frozen packet bytes without double-counting shared buffers. Bound receive buffers to 64 KiB/device and telemetry buffering to 1 MiB total. The separate 256 MiB RSS ceiling includes runtime, parsed routes, sockets and transient checkpoint buffers; a queue-byte check is not a memory proof. Record measured RSS/FD/CPU under full queue and slow log sink. All numbers remain proposed review targets.

## Deterministic route decisions
Accept finite WGS84 two-dimensional coordinates within bounds. Reject fewer than two distinct points, zero-length consecutive segments, antimeridian-crossing segments, and malformed/oversized IO in v1 rather than silently normalizing them. Support crossing the antimeridian only in a separately tested later profile.

Scenario input specifies speed in integer millimeters/second, segment progression, stop durations and ignition transitions. Advance by distance using a documented spherical interpolation algorithm and round wire coordinates once to e7; golden expected positions must be independent. At route end stop at the endpoint unless the scenario explicitly loops. At a shared virtual timestamp apply state transitions, then emit at most one record per event in declared order, followed by the periodic record. Do not merge event and periodic records invisibly. Profile event priority and IO values are derived from that updated state. SIMD, floating-point scheduling and wall-clock task completion must not select record order.
