# ADR 0003: Protected rendered activation sources

Status: Accepted for guided D06 preparation; live qualification remains pending.

## Context

Candidate merges must not activate workloads. Helm packages are immutable release
inputs, while Argo CD needs an explicit source graph with narrow reconciliation
permissions. An Application tracking main would turn ordinary merges into releases.

## Decision

Render the independently verified runtime and data Helm packages with reviewed
installation values into separate plain YAML phase payloads. Retain the package,
values and rendered-byte identities in release evidence. Helm remains the package
format; Kustomize remains available for bootstrap composition. Argo CD reconciles
only the rendered payloads, without Helm dependency resolution, plugins or a
second remote source at sync time.

Register two project/application pairs under `gitops/local/`. Each project permits
one repository, one namespace and an explicit resource-kind list. Runtime cannot
manage the database; neither project can manage credentials, RBAC, namespaces,
quotas, release Jobs or Argo control resources. Bootstrap owns those resources.
The provider's delegated cluster connection and RBAC remain additional boundaries.

Both Applications use `refs/heads/environments/local/active`, with separate runtime
and data paths. Each directory contains only `manifests.yaml`. Explicit directory
mode prevents renderer discovery. Automatic sync and deletion finalizers are absent;
sync must use an authorized guided release procedure. Static policy validates the
entire control object rather than accepting arbitrary annotations or extra fields.

For the first guided installation, require an administrator-enforced **locked**
branch at the exact reviewed phase commit, with force pushes, deletion and fork
syncing disabled. The read-only verifier checks protection before and after reading
Git objects, verifies blob identities and rejects source overrides and extra files.
It never creates, unlocks or moves a branch. Missing protection or permissions fail
closed; rulesets-only protection is not silently treated as equivalent.

## Consequences and limits

The initial phase commit and its locked ref must be prepared in a separately
reviewed step after merge. These control manifests are inert repository inputs,
not an installation or sync authorization. Source verification does not replace
full rendered-manifest policy, publication verification, reviewed phase selection,
cluster incarnation/ownership admission, credential provisioning or live acceptance.

A repository administrator can change protection after observation. Recheck the
source boundary immediately before each authorized sync and record the selected
revision. This is not an atomic transaction or an automatic rollback mechanism.
D08 must introduce a separately reviewed promotion identity and protection profile
before writable compare-and-swap promotion is supported. No bypass is provided here.

## References

- [Argo CD directory sources](https://argo-cd.readthedocs.io/en/stable/user-guide/directory/): explicit directory selection and include behavior.
- [Argo CD projects](https://argo-cd.readthedocs.io/en/stable/user-guide/projects/): source, destination and resource restrictions.
- [GitHub branch protection API](https://docs.github.com/en/rest/branches/branch-protection): locked branches and administrator enforcement.
