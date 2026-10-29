# Contributing

## TL;DR

Use the pinned tools. Read the nearest scoped guide, implement a coherent slice,
run the declared verification groups, inspect evidence, and include limitations
in the pull request. CI runs only on pull requests.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm secrets:install
pnpm manifests:install
pnpm check
pnpm local build
pnpm qualify
pnpm qualify:product
```

`pnpm check` is the structural group: toolchain, harness fixtures, Biome,
repository/CI policy, offline Helm/Kustomize/schema/manifest qualification,
release contracts and candidate/active boundaries, Gitleaks worktree/index/history
and dependency advisories. `pnpm packages:check` qualifies actual Helm OCI
publication/read-back in an owned registry; it needs Linux Docker.
`pnpm qualify` runs real Docker installation qualification; build the locked
images first. The separate `pnpm qualify:product` group exercises real OIDC/TCP/browser integration.
None of these groups substitutes for another.
`pnpm verify acceptance` runs both against already built artifacts.

[Verification](docs/development/verification.md) describes outcomes, evidence,
adversarial fixtures and the limits of repository-owned checks.

## Review and updates

Changes to image/source/tool pins, CI authority, secret handling and qualification
assertions require explicit review in the issue and PR. Resolve pins from official
release registries; do not accept mutable image/source/tool tags or update a checksum merely to
satisfy a failed download. Dependency updates run the same gates.
GitHub Actions use reviewed major-version tags (for example, `actions/checkout@v7`),
as requested for this repository; the CI authority rejects hashes, patch tags
and unreviewed major versions.

Keep runtime configuration out of tracked files. Use argument arrays and
`shell: false`; handle credentials through private files or child environments.
Preserve all upstream application contracts. Application changes belong in the
platform or UX repository, with a new reviewed commit pin here.

Run `pnpm exec biome check --write .` for formatting and supported safe fixes.
Deliberate CI changes are made in `tools/ci.mjs`, reviewed, then rendered with
`node tools/ci.mjs --write`. CI parity is byte-checked after LF normalization.

## Pull requests

State the problem, behavior, verification evidence and material limitations.
Link the issue and milestone. GitHub branch protection, required reviews and
required status checks must be configured by the owner; repository files do not
prove those external settings are enabled.
