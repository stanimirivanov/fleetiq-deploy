# Linux development tooling

## TL;DR

Issue #33, M02 - Product Foundation, removes Windows host support while
retaining Linux verification, security boundaries and historical evidence.

## Goal and scope

Remove Windows CI jobs, installer targets, process and filesystem compatibility
branches and Windows-only fixtures. Update active developer and operator commands
for Linux. Upstream lock entries, historical evidence and path-rejection fixtures
remain because they are not supported-host tooling.

## Decisions

CI policy and negative fixtures change together. Linux checks remain mandatory.
External required-status configuration must retire the removed Windows status.
No live installation or trust-store change is authorized by this cleanup.

## Acceptance and evidence

- Windows host paths and CI lanes removed from active tooling.
- Verification results are recorded in the linked PR.
- Missing service-backed prerequisites remain explicit limitations.
