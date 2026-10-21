# Immutable release packages and admission

## TL;DR

Run `pnpm check` and `pnpm packages:check` before merging package/contract changes.
The second command needs Linux Docker and pinned native manifest tools.
Publication is a maintainer-only manual main workflow. It publishes OCI artifacts;
it never selects an environment, moves an activation branch or deploys anything.
Candidates and promotion requests have separate contracts and independent review,
provenance and live-admission requirements.

## Package publication

After merge, an administrator/maintainer may dispatch `publish-release.yml` with
the exact **current main SHA**. Initiating and rerun actors must both currently
have maintain/admin permission. The source must be a merged same-repository PR;
the latest authoritative PR CI must have passed on a checkout whose tree equals
the merged source. The CI run title records the tested merge checkout SHA.

Publication uses a detached exact-source checkout. Release-boundary verification
resolves the fetched `refs/remotes/origin/main` once to an ancestor commit; it
requires no local `main` branch. An explicit trusted `FLEETIQ_BASE_SHA` remains
supported. Missing or unrelated bases fail with fetch/base guidance, without a
`HEAD` fallback. Candidate activation restrictions apply to untracked, staged
and committed changes against the resolved base.

The read-only authorization job has no registry-write permission. Its dependent
publisher reruns structural and real OCI qualification, checks clean source and
exact successful source-bound receipts, then repeats authorization before pushing.
Its job token can write packages, but cannot write repository contents or promote
an environment. Authentication lives in a private temporary Helm registry file,
removed in `finally`; global Docker/Helm credential stores are untouched.

Three OCI Helm artifacts are published beneath
`ghcr.io/stanimirivanov/fleetiq-deploy`:

- `fleetiq-runtime`: backend and static edge chart.
- `fleetiq-data`: retained CloudNativePG data chart.
- `fleetiq-release`: metadata-only chart containing `release.json`, the package
  BOM. It renders zero Kubernetes objects and has no install/migration hooks.

Versions are `0.1.0-r<SHA>.run<RUN>.attempt<ATTEMPT>`. An existing discovery tag or
an ambiguous absence check aborts. Every package is pulled by OCI digest, its
archive hash compared and rendering checked against reviewed source. The BOM
records chart OCI/archive hashes, source, tool-lock hash and qualification hash.
The enclosing package digest is recorded externally in the publication receipt.
Helm 4.3.1 is the pinned OCI renderer; no additional uploader is needed.

An interrupted publication may leave unselected artifacts. There is no atomic
multi-chart transaction and no deletion/rollback of published packages. Rerun
with a new GitHub attempt; success is recorded only after every read-back passes.
Registry administrators can still retag/delete artifacts: digest selection and
live verification detect unavailable/changed inputs, while retention controls
must be configured externally. Tags never grant promotion authority.

Reports are retained as `release-package-reports-<run>-<attempt>` for 90 days:
`publication.json`, `package-bom.json` and `qualification.json`. Publication is
independent of a full release BOM. A full BOM needs actual D02/D03 image receipts
and qualified provider/tool/template inputs; no accepted release is fabricated.

## Full release and producer verification

Use the [release contracts](../../contracts/releases/README.md). For a real full
release BOM, run:

```powershell
pnpm releases:verify-artifacts <release-bom.json>
```

Provide `FLEETIQ_SOURCE_READ_TOKEN` through the process environment with
**contents:read, actions:read and pull requests:read** on all three producer
repositories. This is broader than the existing Compose contents-only credential;
configure it explicitly when verifying actual releases. Never put it in commands
or issue bodies. Private GHCR reads need granted package access and environment
variables `FLEETIQ_REGISTRY_ACTOR`/`FLEETIQ_REGISTRY_READ_TOKEN`. Public packages
can be read anonymously. These are read credentials, not promotion credentials.

Verification checks the exact successful manual main publisher workflow/run/attempt,
current maintainer identities, merged source review, GitHub artifact digest,
bounded in-memory ZIP reports, receipt/qualification hashes and live OCI manifests.
Archive limits are 128 MiB compressed, 256 MiB expanded and fewer than 32 MiB
per JSON report, matching the producers' individual report boundary.
Runtime config must name the selected producer/revision; the backend migration
inventory must match published qualification bytes. Package archive/BOM hashes
must match the publication receipt. Candidate fields cannot supply this evidence.
BuildKit provenance is not described as a signed identity attestation.
Blob redirects are limited to GitHub's documented package storage host and receive
no forwarded registry credential; see [GitHub network requirements](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Reports remain under ignored `target/release-evidence/<bom-hash>/run-*`.
Only a fully successful run writes `artifact-verification.json`; partial evidence
does not grant acceptance. Copy verified, digest-bound evidence into the future
durable release store before producer artifact expiry (UX currently retains
reports for seven days). This directory is not the durable environment ledger.
Expired/missing GitHub evidence fails closed; no offline trust bypass exists.

## Candidate and promotion admission

`pnpm releases:check` checks schemas and candidate/active Git boundaries. It does
not establish live eligibility. `admitCandidate` also requires adapter-obtained
cluster incarnation, current receipt, reviewed phase commits/trees, exact
producer/input verification, clean reviewed selection and bounded validity.
Installation needs an observed empty target. Upgrade needs a current receipt and
reviewed maintenance. Policy records that backup is required; its actual receipt
is produced after drain, rather than invented in a pre-execution candidate.

`admitPromotion` requires an eligible candidate, separate registered release
principal, owned release lease, exact protected activation ref and expected/current
Git revision, and the next pre-reviewed phase commit. A new request ID cannot
inherit completed phases. Continuation requires the same active request, candidate,
principal and completed phase prefix; a completed/foreign request cannot replay.
Maintenance may precede drain. Migration requires verified drain for an upgrade,
a verified backup receipt and separate irreversible approval; activation cannot
skip migration. It returns a proposed CAS, never writes it. Recovery-required
state blocks normal promotion; recovery needs the later dedicated path.

Exported admission functions are contract boundaries, not authentication systems:
context must come from registered trusted adapters, never user JSON. D06 supplies
live cluster/current-receipt/empty-target observations; D07 supplies backup proofs;
D08 supplies workflow authority, protected phase promotion and durable replay
tracking. Until then, no CLI claims live admission or deployment success.
Workflow execution needs a real template; guided contracts allow null until D08.

## Deterministic gates and external controls

Structural CI checks schemas, candidate/active separation and adversarial fixtures
on Linux/Windows. A read-only Linux PR job uses a UUID-owned, loopback-only,
digest-pinned registry with bounded resources. It pushes/pulls charts and the
release envelope, compares renders, rejects missing objects/existing tags,
mutates a disposable tag and proves digest selection survives. Owned cleanup is
mandatory. It neither writes GHCR nor contacts a cluster.

No Argo Application/ApplicationSet is accepted yet. D06 must register and validate
the real source graph against protected `environments/<environment>/active` refs;
main/candidate tracking and arbitrary revision overrides are forbidden. Workload
charts cannot create Argo source graphs. This temporary guard is not evidence
that provider onboarding has happened.

Owner-managed prerequisites remain unverified: required PR checks/reviews,
protected main/activation refs, separate activation principal, package permissions
and retention, producer read permissions and durable evidence storage. D05 does
not change these settings, dispatch publication, register a provider or deploy.
