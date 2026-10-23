# Release automation boundaries

Read [release operations](../../docs/operations/release-packages.md) and the
[contracts](../../contracts/releases/README.md) before changing these modules.

- Keep packaging, publisher provenance, candidate admission and promotion separate.
  Validation never applies manifests, syncs Argo CD, advances Git refs or migrates.
- JSON validity and unsigned BuildKit statements do not prove publisher identity.
  Verify trusted GitHub run/artifact metadata and live OCI bytes independently.
- Reuse pinned Helm OCI support, Ajv and the bounded maintained ZIP reader.
  Do not introduce a custom registry uploader or ZIP parser.
- No token in arguments, Git, evidence or process diagnostics. Registry config is
  process-owned temporary state; never use the global Docker credential store.
- Preserve cluster/current-receipt/replay/expiry/phase checks and rejection fixtures.
  Missing live adapters remain incomplete, never assumed successful.
- Candidate PRs cannot write active selections. Argo control objects must match
  the exact registration in `source-graphs.mjs`, including JSON/YAML and wrapper
  rejection fixtures. Read [source operations](../../docs/operations/argo-source-graphs.md).
  Static registration does not replace live locked-ref verification or cluster
  admission. Never add an override, writable-ref bypass or automatic sync.
- Run `pnpm check` and real `pnpm packages:check`. Publication requires maintainer
  workflow dispatch after merge; never dispatch merely to test this code.
