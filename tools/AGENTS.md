# Verification automation constraints

Read [verification](../docs/development/verification.md).

- Use the shared process adapter with argument arrays, bounded timeouts and
  shell:false. Never emit child diagnostics containing secrets.
- Validate owned paths, Docker context and resource ownership before mutation.
  No global prune, broad deletion, credential-store changes or automatic CA trust.
- Fixtures must demonstrate rejection of weakened rules, not only happy paths.
  Cross-platform tests must preserve real LF/CRLF semantics.
- Keep verification metadata free of process output and environment dumps.
  Acceptance requires all inventoried checks and unchanged source fingerprints.
- The CI renderer is reviewed policy. Do not regenerate CI to conceal a failure.
- Kubernetes package changes require the actual native manifest tools and pinned
  local schemas; run pnpm manifests:install, pnpm manifests:check and pnpm check.
  Do not substitute model-only tests, schema skips or live provider assumptions.
