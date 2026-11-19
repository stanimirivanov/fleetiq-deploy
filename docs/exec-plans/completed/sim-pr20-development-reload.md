# SIM-PR20 development reload

## TL;DR

Issue #76 implements explicit, unqualified developer UI reload and backend
rebuild/recovery. The owner approved keeping this as one larger PR after the
source/provenance and recoverable mode controls exceeded the initial estimate.

## Status and dependencies

Implementation complete; final canonical outcomes are recorded in the PR. SIM-PR19 is merged at UI b2169ee30bc516cb5bdb79f4506a7a51970db0af.
SIM-PR18 remains deployment issue #75; this work does not implement or claim its
fault/cost acceptance. The PR stays draft until that planned merge dependency is satisfied. No upstream source or
reviewed image lock changes are included here.

## Scope and decisions

- Explicit owned isolated source clones. Never reset developer edits or use a
  sibling checkout implicitly; fresh disposable qualification clones have a
  separately checked ownership marker.
- UI source is read-only inside a private nonroot Vite service. Compiler cache is
  bounded tmpfs. The existing HTTPS edge owns TLS/API/session/SSE and rejects
  foreign HMR origins and explicit sample previews.
- Backend build uses one source snapshot and emits the server plus all protocol
  executors. Compare embedded migration inventories before stopping processes;
  serve with read-only schema checking and replace all pipeline consumers.
- Pending transitions permit only explicit reviewed recovery; mark ready only after healthy startup.
- Reuse immutable upstream secret-scanning controls and exact public fixture classifications; prove new credentials and forged candidate detectors are refused.
- Retain a recoverable development recipe separately from the unchanged reviewed
  recipe and image inventory. Return explicitly to reviewed images.
- Network-only source acquisition precedes builds without source credentials.
  Development success is a separate receipt and cannot qualify a release.

## Acceptance and tests

TDD controls cover source origin/ancestry, ignored private inputs, symlinks,
untracked files, failed-build ordering, complete executor selection, reviewed
artifact rejection, actual Compose rendering and hostile model deltas. A separate
real browser witness verifies trusted HTTPS, authenticated same-origin reads,
streaming, HMR after an actual CSS edit without document reload, and logout.
Installed backend qualification preserves a real pending producer checkpoint,
replaces every matching process, resumes exact history and returns to reviewed
images before normal owned cleanup. Run structural, Docker, product, simulator
and the separate development groups; record exact results on the PR.

## Out of scope

Automatic backend watch, migrations, source reset, credential/trust installation,
publication/promotion, SIM-PR18 implementation and physical hardware acceptance.
