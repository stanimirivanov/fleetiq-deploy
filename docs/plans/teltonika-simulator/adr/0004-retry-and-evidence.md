# ADR: Bound retries without claiming exactly-once

Status: proposed, not accepted. Date: 2026-11-09.

## TL;DR
Default one frozen AVL batch per connection, retiring it even after success; on uncertain ACK close before retry/re-login. Optional persistent mode assumes no extra application ACKs and cannot disambiguate them. Persist bounded private queue and report wire ACK separately from projection/browser acceptance.

## Context
TCP acknowledgments count records without packet identity. Platform accepted-message identity includes session nonce/sequence; durability ACK precedes decoded/projection completion.

## Decision
Default one frozen AVL batch per connection, retiring it even after success; on uncertain ACK close before retry/re-login. Optional persistent mode assumes no extra application ACKs and cannot disambiguate them. Persist bounded private queue and report wire ACK separately from projection/browser acceptance.

## Alternatives considered
Same-socket blind retry can misattribute delayed replies. Dropping on timeout loses data. Silent client dedup or changing server IDs alters observable history.

## Consequences
At-least-once delivery can duplicate accepted records. Explicit limits/backoff prevent runaway load. Physical, wire, installed and performance evidence remain separate. See spec D8 and interfaces.

## Evidence and verification
See [repository evidence](../00-repo-discovery.md), [protocol sources](../01-protocol-notes.md), [specification](../02-spec.md), [local topology](../04-local-environment.md) and [task gates](../05-tasks.md). This ADR authorizes no implementation or external operation.
