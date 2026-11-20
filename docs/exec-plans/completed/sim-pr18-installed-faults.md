# SIM-PR18 installed faults and bounds

## TL;DR

Issue #75 qualifies the reviewed simulator's fault and fleet behavior through the
owned installed product. Existing prepared work is retained and integrated with
merged SIM-PR20; normal startup still registers one device.

## Resolved prerequisite

Simulator PR #105 fixes admission of the explicit primary/alternate fault identity
pair. Publication run 44607778025 verifies source
`2cced46e7cbf518683531162543b0786010c77c6`, source fingerprint
`f12cba27f849c5d8c53fa8a1fd767e08f726cacbe0b4200af53844bb4e99c1b7`,
and immutable image
`ghcr.io/stanimirivanov/fleetiq-simulator@sha256:bdb77b9c6e63ea282c0f3cd8fa37213c71f7413fcda37726ea3501ee73a9b977`.
The actual pulled image passes deployment admission. This does not promote an environment.

## Scope and acceptance

- A qualification-only second registered device supports a six-capture fleet
  reaching two concurrent attempts. Enforce 64 KiB / six queued records, 256 MiB
  RSS, 64 sampled descriptors and five seconds execution CPU per declared run.
- Exercise all eight explicit fault actions, a bounded 12-connection before-write
  disconnect workload alongside a healthy three-capture neighbor, and queue
  overflow refusal. Invalid traffic cannot earn success ACKs or forbidden outputs;
  duplicate and after-write uncertainty remain explicit.
- Independently verify authenticated history, selected-source Inspect and durable
  ingestion diagnostics for both devices. Public evidence contains only closed
  check names and numeric metrics; preserve existing timing, queue, identity,
  owned cleanup and unrelated-resource checks.

## Live diagnostic contract

The pinned platform's `LiveSession::process` executes/validates the guest proposal
before constructing and enqueuing a durable turn. Invalid live bytes therefore
cannot be witnessed as a poisoned replay record. Instead correlate exact wire
receipts and forbidden-output checks with measured snapshot deltas: eight
registered handshakes, four valid data turns and zero/one after-write turn; then
12 empty reconnect handshakes and no data. Require all persisted turns decoded,
complete coverage and unchanged overflow snapshots. This corrects the prepared
fixture's replay-poison assumption without relaxing fault or workload bounds.

## Verification and boundaries

Existing TDD mutation tests reject missing/private fields, bad ACKs, over-budget
metrics, false history/diagnostics and missing cleanup. Run canonical structural
and security, reviewed builds, Docker, installed simulator, full product and the
now-required separate development smoke on unchanged candidate bytes.
No platform/UX logic changes, new dependencies, increased limits, throughput or
physical-device conformance claims. Sampled FDs are not instantaneous maxima.
Implementation and installed fault/timing qualification are complete. The PR
records final canonical gate outcomes; merge remains a maintainer action.
