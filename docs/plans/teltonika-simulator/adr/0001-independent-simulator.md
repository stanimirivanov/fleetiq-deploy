# ADR: Independent simulator repository and TypeScript

Status: proposed, not accepted. Date: 2026-11-09.

## TL;DR
Create fleetiq-simulator with strict TS and pinned Node/pnpm. Runtime wire/scenario code is independent of platform decoding. Deployment consumes reviewed artifacts. Repo name/license remain owner decisions.

## Context
The user requires a new repository. Backend is Rust; deployment/UI already use Node/TypeScript. A simulator tied to the production decoder can validate the same defect twice.

## Decision
Create fleetiq-simulator with strict TS and pinned Node/pnpm. Runtime wire/scenario code is independent of platform decoding. Deployment consumes reviewed artifacts. Repo name/license remain owner decisions.

## Alternatives considered
Rust in separate repo offers strong byte types but adds another native build path. Backend subdirectory/deployment embedding conflicts with requested ownership; keeping the existing tiny test sender as an oracle is still valuable.

## Consequences
Independent release/pin management and bigint discipline are required. No shared implementation library for expected vectors. See spec D1/D2.

## Evidence and verification
See [repository evidence](../00-repo-discovery.md), [protocol sources](../01-protocol-notes.md), [specification](../02-spec.md), [local topology](../04-local-environment.md) and [task gates](../05-tasks.md). This ADR authorizes no implementation or external operation.
