# Registered Argo sources for guided D06

The four manifests in [gitops/local](../../gitops/local/) are bootstrap control
inputs. Committing them does not install Argo resources or activate FleetIQ.
[ADR 0003](../adr/0003-protected-rendered-activation-sources.md) explains the choice.

## Registered boundary

| Role | Project and Application | Namespace | Watched path |
| --- | --- | --- | --- |
| Runtime | `fleetiq-local-runtime` | `fleetiq-apps` | `releases/active/local/runtime` |
| Data | `fleetiq-local-data` | `fleetiq-data` | `releases/active/local/data` |

Control resources live in `fleetiq-gitops-system`, carry the provider's `fleetiq`
consumer label and use its delegated in-cluster connection. Sources are restricted
to `https://github.com/stanimirivanov/fleetiq-deploy.git` at
`refs/heads/environments/local/active`. Each watched directory contains exactly one
ordinary `manifests.yaml`; no symlinks, renderer files or source overrides.
Projects allow only the role's registered namespaced kinds. Namespace/quota setup,
Secrets, RBAC, migration Jobs and controllers are outside these Applications.

## Prepare and verify a source

1. After the packaging/source-graph PR merges, independently verify immutable
   package/image inputs and review exact installation values and phase selection.
2. Render each Helm package, run the complete rendered-manifest checks and retain
   package/value/manifest digests. Do not put credentials or private operator
   identifiers in Git. Scope verification alone is not full manifest validation.
3. Through an explicitly authorized preparation step, commit the reviewed phase
   payloads to the activation branch. This verifier does not create that commit.
4. Lock the activation branch with administrator enforcement. Require
   `lock_branch` and `enforce_admins` enabled, with `allow_force_pushes`,
   `allow_deletions` and `allow_fork_syncing` explicitly disabled. GitHub plan and
   permission support must be confirmed; absent classic protection fails closed.
5. Supply `FLEETIQ_SOURCE_READ_TOKEN` through the local process environment or a
   protected CI secret. It needs repository Contents read and Administration read
   for the protection API. Never put its value in arguments, logs or Git.
6. Run `pnpm releases:verify-sources local <exact-reviewed-phase-commit-sha>`.

The command uses GitHub GET requests only. It reads branch protection twice,
checks the commit/tree/blob identities, parses both phase files and checks their
resource scope. Success retains a unique receipt under
`target/source-graph-evidence/local/run-*/verification.json`, including the local
control-graph digest and observed protection digest. Failure creates no successful
receipt. HTTP authorization failures are prerequisites, not a clean result.

## Before a live sync

The receipt states `source-verified`, `liveAdmission: not-performed` and
`activation: not-performed`. It proves neither a trusted publisher nor an approved
candidate, actual controller configuration, target incarnation, workload safety or
successful installation. Those gates remain separate. The checked-in Applications
must match the admitted live control objects before granting synchronization.

Repeat source verification immediately before a separately authorized sync. An
administrator can alter protection between observations; this is not an atomic
lock against repository administration. There is no unlock, Git write, Kubernetes
apply, Argo sync or migration operation in this command. D08 must review the
promotion principal and writable protection profile before upgrade automation.

## Deterministic local checks

`pnpm releases:check` checks the complete registered object graph, including JSON,
YAML and wrapper rejection. Tests mutate source revisions, renderers, namespaces,
project permissions, protection flags and Git object responses. `pnpm check` and
`pnpm packages:check` remain required. These tests do not substitute for provider
admission or persistent-target qualification.
