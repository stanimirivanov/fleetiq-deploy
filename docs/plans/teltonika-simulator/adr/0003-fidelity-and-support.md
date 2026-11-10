# ADR: Separate wire conformance from installed support

Status: proposed, not accepted. Date: 2026-11-09.

## TL;DR
Deliver installed TCP8/8E first; independently qualify UDP/16 and read-only Codec12 fixtures without claiming platform support. Use a versioned documentation-derived profile and retain original raw widths.

## Context
Platform supports bounded TCP8/8E; UDP/16/commands are excluded. Model settings and hardware behavior cannot be inferred from codecs alone.

## Decision
Deliver installed TCP8/8E first; independently qualify UDP/16 and read-only Codec12 fixtures without claiming platform support. Use a versioned documentation-derived profile and retain original raw widths.

## Alternatives considered
Adding all transports and remote commands immediately creates new platform authority/durability interfaces. Translating UDP/commands through a mock gateway would hide these gaps.

## Consequences
Requires conspicuous capability labels and source/profile hashes. MQTT, firmware emulation and actuation deferred. Simulator evidence never satisfies M07 physical gate. See protocol notes and spec D4/D9.

## Evidence and verification
See [repository evidence](../00-repo-discovery.md), [protocol sources](../01-protocol-notes.md), [specification](../02-spec.md), [local topology](../04-local-environment.md) and [task gates](../05-tasks.md). This ADR authorizes no implementation or external operation.
