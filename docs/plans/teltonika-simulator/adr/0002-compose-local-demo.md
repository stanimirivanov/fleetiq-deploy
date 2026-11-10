# ADR: Reuse Compose with explicit local identity

Status: proposed, not accepted. Date: 2026-11-09.

## TL;DR
Add a distinct owned demo profile, canonical HTTPS origins, explicit trust/DNS prerequisites, content-aware API provisioning and bounded cleanup. Ordinary startup and production auth remain unchanged.

## Context
Deployment already has normal UI and the opt-in TCP pipeline. Its issuer/browser fixture is isolated and disposable. Kubernetes provider capacity and ownership are substantially heavier.

## Decision
Add a distinct owned demo profile, canonical HTTPS origins, explicit trust/DNS prerequisites, content-aware API provisioning and bounded cleanup. Ordinary startup and production auth remain unchanged.

## Alternatives considered
kind later reuses provider/charts but requires accepted target/network/storage/identity. k3d/minikube duplicate provider lifecycle. A fake UI/server would not exercise the real ingestion path.

## Consequences
One command is promised after first-time trust/setup. Demo identity is local-only. Down retains data, reset requires owner/target verification. See local environment and spec D6/D7.

## Evidence and verification
See [repository evidence](../00-repo-discovery.md), [protocol sources](../01-protocol-notes.md), [specification](../02-spec.md), [local topology](../04-local-environment.md) and [task gates](../05-tasks.md). This ADR authorizes no implementation or external operation.
