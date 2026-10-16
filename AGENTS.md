# Deployment contributor map

- Start with [CONTRIBUTING.md](CONTRIBUTING.md), then read the focused guide for
  the change. [ARCHITECTURE.md](ARCHITECTURE.md) owns the service boundaries.
- [local/AGENTS.md](local/AGENTS.md) covers deployment configuration;
  [tools/AGENTS.md](tools/AGENTS.md) covers verification automation.
- Work in one cohesive issue-sized branch. Preserve unrelated local repositories,
  containers, volumes and Docker caches.
- Never inspect or print private instance files, provider credentials, cookies or
  CA private keys. No credential belongs in Git, argv, evidence or CI artifacts.
- A missing prerequisite, skipped command or failed cleanup is incomplete
  verification. Report it; do not replace real qualification with model checks.
- Normal startup requires complete OIDC configuration. Infrastructure-only
  qualification is explicitly separate; it must never become a normal fallback.
- Run `pnpm check` and `pnpm qualify` for installation changes. Read evidence
  and correct failures before committing. Only describe checks actually run.
- Plans live in `docs/exec-plans/active/`; move completed plans to
  `completed/`. Documentation over 100 lines needs an opening TL;DR.
