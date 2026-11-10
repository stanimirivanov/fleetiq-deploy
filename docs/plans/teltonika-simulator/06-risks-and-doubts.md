# Risks, adversarial review and open decisions
Status: proposed; fresh-context and approved external CLI review completed; findings reconciled, 2026-11-09.

## TL;DR
The largest risks are misleading fidelity claims, ACK ambiguity, retained seed state and browser-visible identity. Resolve them before adding fleet scale. Physical qualification remains not-run.

## Claims → doubts → reconciliation
| Claim | Adversarial doubt | Classification and reconciliation |
|---|---|---|
| A bounded stop-and-wait sender can retry safely | Count-only ACKs lack batch IDs; late ACKs from retransmission can complete the wrong next batch | Valid/actionable. Use one AVL batch per connection by default, retiring even successful connections. Persistent mode explicitly assumes one server ACK per batch; after missing/wrong ACK always close, discard receive state, reconnect/login and resend frozen batch. SIM-PR2 includes delayed duplicate ACK test. No cross-session exactly-once claim. |
| Existing local issuer can power a one-command demo | Qualification uses private hostname resolution/trust that a desktop browser does not have | Valid/actionable. Specify canonical host/browser/backend names, loopback ports, network aliases, SANs, callback and explicit public-CA trust prerequisites. SIM-PR3/7 test host-facing route. |
| Existing seed can be reused on restart | Disposable seed assumes empty fixed IDs; retained volumes cause collisions or silent takeover | Valid/actionable. Private stable identities, ownership fingerprint, exact-content reconciliation and collision refusal. SIM-PR4/17 prove down/up. |
| Offline buffering works with the existing listener | 15-second idle/300-second lifetime closes real low-frequency connections; queues may grow without limit | Valid/actionable. Continue independent capture, bounded persistent FIFO, reconnect without invented heartbeat and measured long-duration recovery. SIM-PR10/11/17. |
| Protocol documentation is sufficient for all layouts | Codec16 total width conflicts and UDP examples use inconsistent IDs | Valid/actionable. Keep independent vectors/reference parser and profile-specific assumptions. No automatic product support. |
| Independent repository prevents correlated bugs | Copying backend encoder/CRC/expected outputs would still share the same mistake | Valid/actionable. Implement from cited spec; keep existing deployment sender separate; test literal external vectors and cross-implementation results. |
| N-device support means full fleet performance | Product has two sessions per peer and a single executor; container networking often shares peer identity | Valid/trade-off. N logical devices with two slots, separate 100-session peer workload. More product capacity is a separate platform task, not network/IP evasion. |
| Simulator commands test platform commands | Product command dispatch does not exist | Valid/actionable. Codec12 fixture gets standalone conformance only. No command UI/API invented. |
| A new simulator repo should use Rust | Rust matches backend; TypeScript matches deployment tooling and permits independent wire implementation | Valid/trade-off. Recommend TS; retain explicit bigint/raw hex and bounded parsing. Confirm language choice. |
| A green synthetic run qualifies Teltonika hardware | It cannot test firmware, radio, storage, GNSS or real field conditions | Valid/actionable. Label evidence synthetic and keep issue #59 blocked on actual device witness. |

Review conducted by a fresh-context subagent with artifact/contract only. It returned four actionable findings (ACK uncertainty, host issuer reachability, seed reconciliation and offline bounds); each was incorporated. Further rows record the author's adversarial checks. The user approved the exact Codex CLI invocation. Codex 0.166.0 ran gpt-6-astra with high reasoning, read-only sandbox and a no-tool prompt, and exited 0. The first launch could not initialize local CLI state inside the outer sandbox; the same approved invocation succeeded with host access while retaining the reviewer read-only sandbox. It reviewed a condensed artifact, not the full files. This is reasoning review, not protocol or runtime verification.

## Open decisions for owner review
1. Approve M08 ownership and the new `fleetiq-simulator` repo name, visibility/license and TypeScript stack.
2. Confirm installed v1 is TCP8/8E; UDP/16/12 are simulator conformance only, not completed product features.
3. Confirm one/two-session default and a separate 100-session reference workload; choose a measured target before expanding platform limits.
4. Confirm GeoJSON-only route input, documentation-derived FMB920 profile, no GPX/road-routing/MQTT v1.
5. Confirm explicit local demo identity, host DNS/CA prerequisites and persistent state semantics. This is a trusted developer demo, not production identity.
6. Review proposed coverage/resource limits and warm-start target after initial measurements.
7. Confirm strict one-batch-per-connection default, with optional persistent sessions requiring a compliant ACK sender. This changes simulator connection frequency, not the platform.
8. Confirm dev hot reload is a later optional pair of PRs, with explicit backend rebuild rather than automated Rust watch.

No blocking unknown prevents a proposed plan. Choices above materially affect implementation and must be approved before repository creation. The exact firmware/model for physical hardware is deliberately not inferred from this simulator profile.

## Remaining risks and gaps
- Vendor docs are mutable; record retrieved section URLs and reviewed-vector hashes/source revision at implementation.
- Verify licensing before redistributing manufacturer example material. The plan reproduces factual layouts, not a manufacturer document mirror.
- No conformance, image, performance or installed-simulator gate exists yet. All proposed gates need positive/negative controls.
- Fresh source pins may change listener bounds and APIs; recheck selected producer revisions before implementation. Workspace HEAD alone is not runtime provenance.
- Broker/command-gateway dependencies are not justified for TCP v1. UDP/commands require identity, replay, authorization and durability designs if later promoted to product.
- High-rate traffic may contend with other local work. No benchmark should borrow a Perfeng-owned target or exhaust the host.
- Real map assets and coordinate mapping are separate from route generation; a blank self-hosted test tile is not evidence of realistic road geography. Supply a small licensed/offline basemap or document that route realism comes from geometry. Do not require a paid map API.
- Cross-session duplicate wire records are possible with current accepted-message identity. A deduplication feature would change evidence/history semantics and is out of scope.
- A nonzero or missing cleanup result invalidates acceptance. Keep private state/evidence for diagnosis without attaching sensitive artifacts.


## External review reconciliation
The CLI repeated its findings in its output; the following counts each distinct finding once. No additional CLI review was invoked.

| Finding | Classification | Resolution / evidence |
|---|---|---|
| Repository citations/ownership absent | Contract/input omission | The condensed input omitted the full [four-repo evidence matrix](00-repo-discovery.md); existing document already satisfies this. No new repo claim accepted from review. |
| Protocol citations absent; Codec16 discrepancy unresolved | Input omission plus valid/actionable | Section citations already exist in [protocol notes](01-protocol-notes.md). PR15 now requires explicit review of the provisional interpretation; agreeing implementations do not establish manufacturer authority. Unresolved contradictions block conformance claims. |
| Successful ACK followed by late duplicate can complete next equal-count batch | Valid/actionable | Default strict mode retires after every batch; optional persistent mode narrows guarantee. PR2 tests successful-then-duplicate ACK. [Spec](02-spec.md), [interfaces](03-interfaces.md). |
| Physical issue status absent | Input omission | [Discovery](00-repo-discovery.md) and [tasks](05-tasks.md) already preserve not-run. Deployment [issue #59](https://github.com/stanimirivanov/fleetiq-deploy/issues/59) remains the tracking issue for the physical tracer and its evidence. |
| Persistent issuer/session/seed authentication undefined | Valid/actionable | Stable issuer keys/client/subject, intentionally ephemeral sessions and fresh seed OIDC flow; restart/reauth tests in PR3. [Local environment](04-local-environment.md). |
| Partial seed progress unrecoverable | Valid/actionable | Write intent before API call, deterministic owned IDs, compare committed state after uncertain response, resume dependency graph, refuse collisions. PR4 tests interruption at every stage. |
| Checkpoint compatibility/crash outcomes undefined | Valid/actionable | Explicit versioned content/cursor/clock/random/queue state, atomic enqueue and ACK removal, crash matrix and allowed replay duplicates. PR11, [interfaces](03-interfaces.md). |
| Device rotation can starve healthy peers | Valid/actionable | Round-robin one batch/turn, release slot during backoff, paced reconnects and per-device failure/aggregate exit semantics. PR13. |
| Queue age/deadlines/accounting vague | Valid/actionable | Concrete default/range and virtual-versus-monotonic definitions; serialized queue, receive/log bounds and independent RSS gate. PR10/11/13. |
| Route/event edge cases undefined | Valid/actionable | Explicit speed, interpolation, endpoint/event ordering and rejection of unsupported geometry. PR9/10. |
| Individual tasks absent | Input omission; size concern retained | Full [task plan](05-tasks.md) already has per-PR scope, dependencies and gates. LOC are estimates; issuer/lifecycle work must split if implementation cannot remain reviewable. No test or recovery requirement may be dropped to fit the estimate. |

All actionable findings were addressed in proposed text, not implementation. Remaining approval choices and empirical gates remain open; no claim of a second review pass or runtime correctness is made.
