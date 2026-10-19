# Release contracts

These draft-07 JSON Schemas are closed, versioned interfaces. Ajv validates them
offline without coercion, defaults, remote references or unknown-field removal.
Record digests are SHA-256 over exact stored bytes, including line endings.
Migration checksums retain the producer's SQLx SHA-384 inventory.

| Contract | Responsibility |
| --- | --- |
| `package-bom.json` | Deployment source, pinned native toolchain, qualification and two chart OCI/archive digests. Stored inside the metadata-only release chart. |
| `release-bom.json` | Full release: published package, backend and UX, exact producer runs/artifact/receipt hashes, infrastructure/tools/template inputs and migrations. |
| `candidate.json` | Inert reviewed selection: environment, cluster incarnation, expected-current receipt, exact phase commits/trees, migration policy and deadline. |
| `request.json` | One immutable release request ID referencing candidate bytes and its reviewed Git commit. |
| `receipt.json` | Durable result including previous receipt, executed phase/revision and retained evidence hashes. `recovery-required` blocks admission. |

The enclosing package's OCI digest is outside its BOM to avoid a circular hash.
Only the package BOM allows a loopback registry for disposable qualification.
Full release references require GHCR and independent producer verification.
Discovery tags are unique per source/run/attempt and never deployment inputs.

Schema validity grants no review, publisher, migration, cluster or promotion
authority. Admission requires independently obtained context, not an `approved`
flag in a candidate. The artifact verifier checks GitHub publication runs,
maintainer identities, merged reviews, artifact/receipt/qualification bytes and
live OCI digests separately.

`workflowTemplate: null` supports guided qualification while D08 is pending.
Workflow execution needs a real verified template, never a placeholder digest.
A null current receipt is an install precondition, not an empty-target proof.

See [release operations](../../docs/operations/release-packages.md) for commands,
credential boundaries, external protections and remaining live gates.
