# Proposed simulator quality constraints
Status: proposed; no enforcement installed in this session.

## TL;DR
Every gate below must be implemented and tested before claiming compliance. Preserve all existing platform/UI/deployment limits. New simulator checks supplement installed product acceptance.

## Floor
No secrets or IMEIs in Git/logs/artifacts. No suppression comments, skipped/deleted tests, silent fallback, unimplemented production stubs or threshold reductions to obtain a pass. No unreviewed dependencies or copied third-party code. Document approved exceptions with owner, reason and expiry.

## Proposed executable gates
All simulator commands below are **[new]** and must be installed as repository scripts in SIM-PR1 or the owning behavioral PR.

| Dimension | Proposed bar | Command / introduction |
|---|---|---|
| Types/build | strict TS, zero errors, no unsafe integer conversion for wire u64 | `pnpm check`, PR1 |
| Lint/format | zero Biome violations, pinned configuration | `pnpm check`, PR1 |
| Functional behavior | all wire/config/session/scenario tests pass; no skipped cases | `pnpm check`, throughout |
| Coverage | ≥90% lines and ≥85% branches for wire/session pure state modules; ≥80% lines for remaining new behavior; coverage exclusions need review | `pnpm test:coverage`, PR1 then scope expands with modules |
| Independent conformance | literal reviewed golden bytes; independent peer/parser; malformed inputs covered | `pnpm test:reference`, PR8/14/15/16 |
| Secrets/privacy | zero findings, including IMEI-pattern negative canary; scanner output redacted | `pnpm check`, PR1 |
| Dependencies/licenses | current advisory scan, no unmitigated high/critical; reviewed exact lockfile/new graph; scanner failure is failure | `pnpm check`, PR1 |
| Image | restricted nonroot runtime, no secret layers, reviewed image/source identity, no unmitigated high/critical scan result | `pnpm image:qualify`, PR5 |
| Bounds | 256 MiB simulator target; global queue ≤16 MiB, ≤1000 records/device; ≤100 peer-test sessions; ≤2 product sessions | `pnpm test:bounds` **[new]**, PR13; real measured result required |
| Installed behavior | actual OIDC/TCP/DB/projection/browser/Inspect + owned cleanup | deployment `pnpm qualify:simulator` **[new]**, PR7/17/18 |
| Acceptance authority | normal reviewed artifacts, no mock UI/sample route; dev overlays excluded | deployment existing gates plus new simulator gate |

These are proposed thresholds, not measured baselines. Confirm them before implementation. Actual resource use is UNVERIFIED. A failure changes implementation or prompts an explicit budget decision; it does not justify silent relaxation.

## Prove that the gates work
Every new gate has a clean control, a deliberate violation and a tool-error fixture. Security tests prove above-threshold findings fail and below-threshold behavior follows declared policy. Coverage must fail under a deliberately uncovered branch. Resource tests must fail if a bounded queue grows beyond cap. A missing browser, database, scanner, artifact or private-source authorization is incomplete verification.

Pin tools in simulator. Use node:test with coverage instrumentation supported by the pinned runtime and a threshold-checking script; no report-only success. Validate source mapping before selecting TS coverage numbers. Exact instrumentation is a PR1 harness decision, not an assumed existing command. Avoid a new custom static-analysis framework; reuse Biome, TypeScript and a pinned secret/advisory scanner.

## Lifecycle placement
Fast loop: targeted tests/type/lint; target ≤90 seconds, unmeasured. PR gate: full S/SC and applicable reference/image tests. Integration: D/DS and U when changed. Run authoritative supply-chain checks on final lockfile immediately before opening PR, preserving the user's standing requirement. CI jobs must invoke the same canonical scripts. Existing deployment CI is PR-only; do not change its event authority casually. [Deployment contributor policy](../../../CONTRIBUTING.md)

Measured latency: report ACK histogram, retry count, total acceptance time, max queue/RSS/FDs, startup and teardown times. Proposed installed acceptance timeout is 240 seconds per normal stage and explicit >300-second lifetime scenario; do not apply a short unit-test budget to the lifecycle test.

## Existing bars remain authoritative
Platform [CONTRIBUTING](https://github.com/stanimirivanov/fleetiq-platform/blob/28823c547a4f7a5bd646a58e580c659d43e967d2/CONTRIBUTING.md), UI [verification](https://github.com/stanimirivanov/fleetiq-ui/blob/cdffdc25b1c45048e56dd861170807f136d6ca52/docs/development/verification.md) and [measured quality](https://github.com/stanimirivanov/fleetiq-ui/blob/cdffdc25b1c45048e56dd861170807f136d6ca52/docs/development/measured-browser-quality.md), deployment [verification](../../../docs/development/verification.md) keep their full checks. No new UI JS/CSS limits, disabled image scan, lower coverage ratchet, weaker source pin or bypassed auth is proposed. New simulator thresholds apply only to the new repository.

## Security acceptance
- Only loopback host exposure; container simulator joins device network only.
- Target hostnames resolve entirely within explicitly allowed loopback/demo addresses. Revalidate on reconnect; reject URLs/redirects and arbitrary internet destinations.
- Fault injection requires explicit local test profile and bounded rate/duration.
- Generated identities, spool and credentials use owned private directories; no shell interpolation, raw packet logs or environment dumps.
- Teardown verifies canonical paths, symlinks, Docker context and owner nonce; only explicit reset can delete owned persistent data.
- Invalid OIDC issuer, certificate, callback, CSRF or origin must fail. Never use insecure browser TLS flags.
- Metrics have bounded labels. A telemetry redaction test contains synthetic canaries and verifies their absence from every output sink.
