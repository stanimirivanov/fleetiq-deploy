# Minimal-demo rebuild-current offline pilot

## TL;DR

Render the provider carrier and attempt-bound database route offline. The
deployment owner stages and withdraws the temporary database login under the
writer fence through separately approved grant and withdrawal Workflows.
Live acceptance in [#139](https://github.com/stanimirivanov/fleetiq-deploy/issues/139)
requires a protected read under that fence and a single read-only recovery result.
[Offline preparation in PR #152](https://github.com/stanimirivanov/fleetiq-deploy/pull/152)

## Offline preparation

The carrier holds one provider `operation.json` for the named data-namespace
Job. Set `tenant` to the exact reviewed FleetIQ tenant identifier. The rebuild
acts on the whole tenant. The asset, property and version select only the
durable evidence probe. Review the published backend selection, then supply
the file bytes and the corresponding reviewed SHA-256. The only credential
reference is `fleetiq-db-rebuild-current-url` key `url`, and the Job mounts
the public `workload-database-ca`. A future staged URL must use verify-full
with the exact primary Service name and `/etc/fleetiq/database/ca.crt`.

This render uses a synthetic tenant, target name and Job name. Run it from the
repository root with the installed manifest tools. Use `--set-literal` so Helm
preserves punctuation in the reviewed tenant identifier.

```bash
target/tools/manifests/helm template demo-rebuild-01 charts/fleetiq-minimal-demo-operations \
  --namespace qual-fleet-data --kube-version 1.35.0 \
  --set-string operation=rebuild-current --set-literal 'tenant=qual-pilot/tenant-01' \
  --set-file backend=environments/minimal-demo/backend.json \
  --set-string backendDigest=sha256:640c563bb21697197242c69e345d43c6182f42733a406cec1fed0038c413bd31
```

Keep the carrier offline. The provider's `minimal_delegation configure`
preview and `job` render consume the unchanged `operation.json`. Use the
preview's launcher for `operation=rebuild-current-route` in the same data
namespace. It renders two Cilium policies named for that attempt. They bind
the provider's attempt label and runtime ServiceAccount, allowing DNS and the
demo PostgreSQL destination. The provider render supplies the separate launcher
and tokenless runtime accounts, one completion, zero retries, a 300-second
deadline and 60-second termination grace. These renders establish the request
and route shapes. Live admission, target identity and datapath remain open.
[Provider preview and admission][provider]

For the synthetic selection above, the pinned provider preview and Job render
agree on `demo-launch-e2e9749c6db012ad7ba8bc9c`. Both route selectors match the
Job's attempt and runtime identities. Raw bytes matched the baseline across 36
ordinary local, provider-local and nonlocal Helm and Kustomize outputs and
seven existing minimal-demo outputs.

## Prepare reviewed owner execution

Use the installation release lock and the same fenced target throughout. Include
`rebuild-current-owner-grant-v1` and `rebuild-current-owner-withdraw-v1` in the
provider's reviewed `approvedTemplates` when selecting the disposable target.
A retained target missing those names needs a provider-reviewed delegation
transition before staging. The provider admits only the named template and one
`release-digest` parameter on a suspended Workflow and makes the approved
template spec immutable. [Delegated Argo admission][owner-admission]

Render `rebuild-current-owner.yaml` and `rebuild-current.yaml` over
`environments/minimal-demo/data.yaml` with `charts/fleetiq-data`. Review a separate
release request for each owner action. Bind the following inputs to its digest
before staging its WorkflowTemplate. [Retained database release preparation][release-review]

- The retained target and provider incarnation, CNPG Cluster and claim UIDs,
  primary Service DNS, and the observed `fleetiq` database OID.
- The selected action and template version, deployment Git revision and hashes
  of the selected SQL batch and every transitive `\ir` include.
- The digests of both saved phase renders, the PostgreSQL client and backend
  image digests, the verified publication run and attempt with their artifact
  and record digests, and the published migration inventory digest.
- The reviewed tenant, migration owner, legacy role and installed workload ACL
  selection. Bind the expected rebuild ACL and the withdrawal checks for role
  dependencies, connection denial, routes and credentials. [Rebuild ACL inventory][rebuild-acl]

From the reviewed checkout, the release owner copies `operations/` into fresh
private release staging. In the selected `operations/rebuild-current-owner/grant`
or `operations/rebuild-current-owner/withdraw` overlay, place the verified
publication inventory as `inventory.json` and the reviewed values as
`reviewed-owner.env`. Include these four keys.

- `PGHOST` is `fleetiq-db-rw.<data namespace>.svc`.
- `FLEETIQ_DATABASE_OID` is the observed `fleetiq` OID.
- `FLEETIQ_WORKLOADS` is the JSON array of installed workload commands.
- `FLEETIQ_RELEASE_DIGEST` is the reviewed request digest for this action.

From that overlay in the staging copy, render using the release namespace
`RELEASES` and exact PostgreSQL image `POSTGRES` from the reviewed demo values.
Set `OWNER_ACTION` to the selected overlay's name, `grant` or `withdraw`. Use the
manifest tool paths and private directory from the existing demo preparation.
Stage the two immutable ConfigMaps and the selected versioned template through
the existing template authority. Record their exact bytes and UIDs with the
review. Preserve the template and its inputs for recovery. A changed selection
needs a separately reviewed template version.
[Demo preparation][migration-route]

```bash
"$KUSTOMIZE" edit set namespace "$RELEASES"
"$KUSTOMIZE" edit set image "invalid.invalid/psql=$POSTGRES"
"$KUSTOMIZE" build . > "$PRIVATE/db-rebuild-owner-$OWNER_ACTION.yaml"
```

Stage the existing `workload-database-owner` Secret key `password` and public
`workload-database-ca` ConfigMap key `ca.crt` in the release namespace. The
credential operator uses the same password as the temporary data-namespace
migration owner and verifies the CA for the reviewed primary Service. The
Workflow runs the fixed batch as `fleetiq_migrator` using `psql` with verify-full
TLS, the same Argo mutex as ordinary migration, and no automatic retry. Mounted
SQL preserves the reviewed include paths. The batch checks the request digest
against the immutable inputs before modifying privileges.

## Approve one owner execution

Submit a suspended Workflow with a fresh explicit `WORKFLOW_NAME` using the
provider's release-releaser identity. Select the staged action template and its
`release-digest`. Capture the Workflow UID and render the route with the same
name in the reviewed data namespace `DATA`. [Provider submission][owner-admission]

```bash
"$HELM" template fleetiq "$DEMO_OPERATIONS" --namespace "$DATA" \
  --kube-version 1.35.0 --set-string operation=rebuild-current-owner-route \
  --set-string "workflowName=$WORKFLOW_NAME" > "$PRIVATE/db-$WORKFLOW_NAME-route.yaml"
```

The network operator stages the two named Cilium policies. Verify that the pair
matches the Workflow name, owner component, executor ServiceAccount and release
namespace and admits only DNS, the executor's API traffic and the intended
PostgreSQL destination. The independent approver checks the suspended UID and
request, actual template and immutable input references against the staging
receipt, the observed owner phase and writer drain, and the installed route
pair before clearing suspension through the provider. Require one succeeded
owner Pod and retain the Workflow and Pod UIDs, outcome and reviewed inputs with
the receipts. Withdraw both policies after the Pod terminates. Retain the
Workflow name and UID until both routes are withdrawn, and never reuse a name.
An authorized retry of the same reviewed action requires a fresh name, route and
independent approval. Keep ambiguous outcomes unresolved and retain evidence.

## Scoped database lifecycle

1. Keep product writers fenced and observe the drain. Have the credential
   operator re-stage the existing migration owner credentials and confirm the
   route for the approved grant execution. Use `rebuild-current-owner.yaml` to
   admit the migration owner as the only product login and reconcile the retained
   `fleetiq_rebuild_current` role with `NOLOGIN` and `disablePassword`.
   Verify the reconciled role and observed admission. The credential operator
   stages the `fleetiq-db-rebuild-current` Secret of type `kubernetes.io/basic-auth`
   with username `fleetiq_rebuild_current` and label `cnpg.io/reload: "true"`.
   Stage the separate `fleetiq-db-rebuild-current-url` Secret with the same
   credentials. Both Secrets are private and attempt-bound. [CNPG password reconciliation][cnpg-passwords]
2. Run the approved owner grant Workflow for the reviewed [grant batch][grant-batch].
   The batch takes the shared transaction lock and checks the reviewed migration
   inventory, primary, database OID, role
   isolation, and drain. It verifies the ordinary workload grants, checks the
   source row's immutability trigger and applies the scoped rebuild ACL. The
   transaction commits only after verifying every intended effective rebuild
   privilege. [Shared workload database context][identity]
3. Withdraw the owner route for the attempt. Use `rebuild-current.yaml` to
   admit the dedicated login alone, with a two-connection limit. Observe the
   reconciled login, TLS-only admission and
   attempt-scoped route before granting submission authority. The published
   rebuild function executes with the login's projection-table privileges across
   tenants. The provider-approved Job and its immutable tenant input bind the
   tenant selection. Keep the credential exclusive to that attempt.
4. Withdraw the attempt route and launcher grant, then reconcile
   `rebuild-current-owner.yaml` again. Wait for active rebuild sessions to close
   and follow the independent approval flow for the owner withdrawal Workflow.
   The reviewed [withdrawal batch][withdraw-batch] revokes the scoped ACL and
   verifies effective connection denial and no remaining database-object
   dependencies for the role. Verify that the old
   credential cannot connect and retire both rebuild Secrets. Withdraw the owner
   route and reconcile runtime admission with the owner disabled. Retire the
   temporary owner credentials. Keep the fenced installation and evidence if
   any withdrawal check fails. The retained rebuild role stays disabled when
   ordinary values return.

The phase and SQL assets belong to the deployment owner. The submitting operator
uses the approved Job and recovery interfaces described by the pilot. This phase
admits the rebuild login alone and does not establish protected read access.

## Cutover prerequisites

- **Protected read under the writer fence.** The maintenance chart scales the
  backend and edge to zero. The migration and bootstrap database phases
  admit only their temporary logins. The protected current-property GET
  requires a serving backend and a tenant observer with `telemetry.read`.
  Deployment owns a configuration that keeps the exact HTTPS read available
  while excluding competing writers. It needs installed reachability and
  authorization evidence. [Maintenance contract][maintenance] · [Product read][snapshot]
- **A single read-only recovery result.** Provider `health` observes delegation
  resources. Kubernetes exposes the exact Job and owned Pods, and the protected
  GET exposes the independent committed projection. The existing interfaces
  leave the operator to correlate those facts and assemble the receipt.
  Deployment owns the missing integration. The same interface must return
  separate execution and durable-effect verdicts for a normal response and
  response loss. It must bind fresh target identity, original accepted Job UID,
  exactly one owned Pod, reviewed image and inputs, and the product snapshots.
  Missing or conflicting evidence remains unresolved. [Provider withdrawal][withdrawal] · [Baseline recovery contract][baseline]

The separately authorized disposable rehearsal must capture one native create,
scoped withdrawal and private target-bound receipt custody.
Rehearsal must measure the whole attempt, including denial, wrong tenant or
input, stale target, foreign Job, unavailable evidence and failed withdrawal.
Use before and after protected reads to verify that generation and revision each
advance by one. In qualification only, compare generation, revision and processed
count with the draft SQL snapshots for the same exact tenant, asset, property and
version under the fence. The draft SQL's opaque row digest can show a change
within SQL. Check pending state from the protected GET against the approved
fixture's committed queue state. Compare the winner's presence, value, quality,
event time and provenance with the same fixture. Use supplementary authoritative
reads of the queue, projection and source rows as needed. Record remaining gaps
in pending and winner verification. Live timings, handoff counts and semantic
parity remain open.

[baseline]: minimal-demo-operator-baseline.md#proposed-operator-contract-for-the-pilot
[cnpg-passwords]: https://cloudnative-pg.io/docs/1.30/declarative_role_management/#password-management
[maintenance]: kubernetes-packages.md#networks-maintenance-and-non-local-limits
[grant-batch]: ../../operations/rebuild-current/grant.sql
[identity]: workload-database-identities.md#operate-the-upgrade
[migration-route]: minimal-demo-data.md#render-the-phases
[owner-admission]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/delegated-argo.md#submission-approval-and-identity
[provider]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#approve-an-operation
[rebuild-acl]: ../../operations/rebuild-current/acl.sql
[release-review]: workload-database-identities.md#prepare-the-reviewed-release
[snapshot]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/current-property-state.md#snapshot-procedure
[withdrawal]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#withdrawal-and-retained-state
[withdraw-batch]: ../../operations/rebuild-current/withdraw.sql
