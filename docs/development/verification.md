# Verification and evidence

## TL;DR

Run `pnpm check` and, after `pnpm local build`, `pnpm qualify`.
A focused pass is not a complete acceptance pass. Missing prerequisites, failed
commands, changed source bytes or failed cleanup produce a nonzero exit.

## Guides and sensors

| Intent | Deterministic sensor |
| --- | --- |
| Exact source/base/tool versions | Artifact lock validation, Git checkout and image/OCI-label inspection |
| Private backend and database | Rendered Compose policy plus actual container port inspection |
| Restricted application containers | Rendered UID, read-only, capabilities, security options and bind-mount policy |
| HTTPS and routing | Trusted/untrusted/wrong-host TLS probes, SPA/API/static assertions |
| No silent identity downgrade | Complete config checks, entrypoint validation and explicit reset override |
| Cookie/Origin/Host/no-store | Synthetic upstream through the real HTTPS edge, then restored real backend |
| Owned cleanup | Context, owner labels, project names and post-cleanup resource inventory |
| Durable restart | Database marker and public CA comparison after service restart |
| No secret exemptions | Pinned Gitleaks across candidate files, index and incoming history; allow comments ignored |
| CI does not omit checks | Exact reviewed workflow renderer plus mutation fixtures |
| Formatting and dependency policy | Biome CI, frozen lock install and pnpm advisory audit |

The executable catalogue is in `tools/verify.mjs`. Groups are structural,
docker and acceptance. Reports include group/check outcomes, source fingerprints,
Git head and timestamps. Docker measurements name the real images and checks,
but contain no raw command output, cookies, provider subjects or configuration.
All acceptance requires unchanged candidate file bytes before/after execution.

The secret sensor scans isolated worktree/index snapshots plus incoming Git
history. CI supplies the event's ancestor base SHA; local checks scan all history
when no base is supplied. Gitleaks ignore files and per-line allow directives
cannot silently bypass scanning. Missing scanners fail closed.

## Limits and review

Repository-owned policy can be changed by a PR. It cannot prove its own
independence; configure required checks/reviews externally. These settings and
the CI source-read secret are owner-managed and unverified by this repository.

This slice does not attest real browser sign-in, CSRF, tenant isolation,
production restore, throughput, availability, image vulnerability SBOM analysis
or full build reproducibility. Those need their planned qualification work.
Do not describe infrastructure results as authenticated acceptance.

Run behavioral fixtures with `pnpm test`. They include policy mutation tests;
installation behavior is exercised against Docker by the docker group.
Windows structural CI and Linux infrastructure CI use the same runner.
