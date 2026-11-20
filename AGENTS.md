# Deployment contributor map

## Workflow authority

Use installed `mattpocock/skills` as the primary workflow for matching tasks.
Discover and load skills on demand. When workflows overlap, use the matching
Matt Pocock skill rather than a parallel workflow. Use other skills only for
capabilities not covered by that workflow or when explicitly requested.

Repository guidance supplies technical constraints, architecture boundaries and
verification requirements. Scoped `AGENTS.md` files are subordinate for workflow
decisions and add only module-specific constraints. Explicit user instructions
and host permissions remain authoritative.

- Start with [CONTRIBUTING.md](CONTRIBUTING.md), then read the focused guide for
  the change. [ARCHITECTURE.md](ARCHITECTURE.md) owns the service boundaries.
- [local/AGENTS.md](local/AGENTS.md) covers deployment configuration;
  [tools/AGENTS.md](tools/AGENTS.md) covers verification automation.
- [charts/AGENTS.md](charts/AGENTS.md) covers Kubernetes packages and offline fixtures.
- [tools/releases/AGENTS.md](tools/releases/AGENTS.md) covers immutable publication
  and candidate/promotion admission contracts.
- Preserve unrelated local repositories,
  containers, volumes and Docker caches.
- Never inspect or print private instance files, provider credentials, cookies or
  CA private keys. No credential belongs in Git, argv, evidence or CI artifacts.
- A missing prerequisite, skipped command or failed cleanup is incomplete
  verification. Report it; do not replace real qualification with model checks.
- Normal startup requires complete OIDC configuration. Infrastructure-only
  qualification is explicitly separate; it must never become a normal fallback.
- Run `pnpm check` and `pnpm qualify` for installation changes. Read evidence
  and correct failures before committing. Only describe checks actually run.
- Documentation over 100 lines needs an opening TL;DR.

## Agent skills

### Issue tracker

GitHub Issues in `stanimirivanov/fleetiq-deploy`.
See [issue tracker](docs/agents/issue-tracker.md).

### Triage labels

Use the five configured roles. See [triage labels](docs/agents/triage-labels.md).

### Domain docs

Single-context glossary and repository-owned decisions.
See [domain docs](docs/agents/domain.md).
