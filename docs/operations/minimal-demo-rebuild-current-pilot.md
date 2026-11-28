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
the public CA ConfigMap `workload-database-ca`. A future staged URL must use verify-full
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

From the reviewed checkout, the release owner copies `operations/` into a
fresh private staging directory, `OWNER_STAGING`. For each action overlay
under `operations/rebuild-current-owner/`, place the verified publication
inventory as `inventory.json` and the reviewed values as `reviewed-owner.env`.
Include these four keys.

- `PGHOST` is `fleetiq-db-rw.<data namespace>.svc`.
- `FLEETIQ_DATABASE_OID` is the observed `fleetiq` OID.
- `FLEETIQ_WORKLOADS` is the JSON array of installed workload commands.
- `FLEETIQ_RELEASE_DIGEST` is the reviewed request digest for this action.

Set `OWNER_ACTION` to `grant` for the grant overlay and `withdraw` for the
withdrawal overlay. Use the release namespace `RELEASES`, reviewed PostgreSQL
image `POSTGRES`, pinned tool paths and private directory from demo preparation.
[Demo preparation][migration-route]

```bash
OWNER_ACTION=grant
(
  cd "$OWNER_STAGING/operations/rebuild-current-owner/$OWNER_ACTION"
  "$KUSTOMIZE" edit set namespace "$RELEASES"
  "$KUSTOMIZE" edit set image "invalid.invalid/psql=$POSTGRES"
  "$KUSTOMIZE" build . > "$PRIVATE/db-rebuild-owner-$OWNER_ACTION.yaml"
)
```

Use the existing authorities for each resource. The pre-authorized release
namespace owner stages the two immutable ConfigMaps for each action, reads
them back and records their names, UIDs, immutability and verified data bytes
or hashes. The template staging authority stages only the WorkflowTemplates
and records each live UID and reviewed spec. Retain all four ConfigMaps,
both templates and their receipts for recovery. A changed selection needs a
separately reviewed template version. [Pinned provider RBAC][owner-rbac]

The credential owner stages the Secret `workload-database-owner` with key `password` and
the public CA ConfigMap `workload-database-ca` with key `ca.crt` in the release namespace.
Use the temporary data-namespace migration owner's password and verify the CA
for the reviewed primary Service. The fixed `psql` batch uses verify-full TLS
as `fleetiq_migrator`. Its single execution template takes the same Argo mutex
as ordinary migration only after approval. The batch checks the request digest
against the immutable inputs before modifying privileges.

Stage both sets of ConfigMaps and templates, prepare both reviewed requests and
their exact route manifests, and confirm the existing credential, staging,
submission, network, witness and approval authorities for both actions before
executing the grant. Submit each request only when its phase and witnesses
are ready.

## Approve one owner execution

For each action, the release owner prepares the private request artifact
`$PRIVATE/db-$WORKFLOW_NAME-request.yaml` using the pinned provider's exact
suspended Workflow shape. Choose a fresh explicit `WORKFLOW_NAME` in
`RELEASES`. Select the staged `rebuild-current-owner-grant-v1` or
`rebuild-current-owner-withdraw-v1` template and the matching reviewed
`release-digest`. Verify the consumer label and submitter identity against
the reviewed provider delegation. Render the route in `DATA` with the same
Workflow name. [Provider submission][owner-admission]

```bash
"$HELM" template fleetiq "$DEMO_OPERATIONS" --namespace "$DATA" \
  --kube-version 1.35.0 --set-string operation=rebuild-current-owner-route \
  --set-string "workflowName=$WORKFLOW_NAME" > "$PRIVATE/db-$WORKFLOW_NAME-route.yaml"
```

After review, authenticate the provider's `release-releaser` for the exact
target. Set `RELEASER_KUBECONFIG` and `RELEASER_CONTEXT` to its private
kubeconfig path and reviewed context, then run the named create. Capture the
returned Workflow UID. If the response is lost, recover the request by its
exact name through the existing read authority and verify its identity before
proceeding.

```bash
kubectl --kubeconfig "$RELEASER_KUBECONFIG" --context "$RELEASER_CONTEXT" \
  create -f "$PRIVATE/db-$WORKFLOW_NAME-request.yaml"
```

The authorized network owner installs and reads back both Cilium policies,
including egress in `RELEASES` and ingress in `DATA`. Confirm and record their
UIDs and exact specs. Check the Workflow name, owner component, executor
ServiceAccount and release namespace selectors and the DNS, executor API and
intended PostgreSQL destinations.

A separately authorized witness uses existing read access to verify the live
template and input UIDs and bytes or hashes against the staging receipts,
the installed route pair against the network receipt, and the observed phase,
database catalog and writer drain. Check for owned Pods of the exact
Workflow UID. The witness gives the target-bound receipt to the independent
approver. The provider's `release-viewer` can read Workflows and
WorkflowTemplates for that receipt. The approver uses `release-approver` to
get the exact Workflow, compare its suspended UID and request with the receipt,
and patch only the initial suspension with the provider's approval annotation.
Use the observed Workflow resource version as a precondition for that patch.
[Provider approval][owner-admission]

Argo starts the 900-second Workflow deadline at `.status.startedAt`, while
the request is still suspended. Immediately before approval, check that the
remaining time covers the full 120-second Pod deadline plus mutex wait and
Pod startup. If the request is stale or lacks that time, keep it suspended.
After the witness confirms the exact UID and absence of owned Pods, the
pre-authorized release namespace owner retires that exact Workflow through
existing authority with a UID precondition. The network owner removes both
exact policies and confirms their absence. Retain the request and route
receipts. Resolve an ambiguous outcome before authorizing any fresh name,
route and approval. [Argo deadline and suspension][argo-deadline]

Require exactly one succeeded owner Pod and retain the Workflow and Pod UIDs,
outcome and reviewed inputs with the receipts. The network owner withdraws
both policies after the Pod terminates and confirms their absence. Keep the
Workflow name and UID with the receipts and reserve the name permanently.

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

[argo-deadline]: https://github.com/argoproj/argo-workflows/blob/v4.1.5/workflow/controller/operator.go#L318-L361
[baseline]: minimal-demo-operator-baseline.md#proposed-operator-contract-for-the-pilot
[cnpg-passwords]: https://cloudnative-pg.io/docs/1.30/declarative_role_management/#password-management
[maintenance]: kubernetes-packages.md#networks-maintenance-and-non-local-limits
[grant-batch]: ../../operations/rebuild-current/grant.sql
[identity]: workload-database-identities.md#operate-the-upgrade
[migration-route]: minimal-demo-data.md#render-the-phases
[owner-admission]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/delegated-argo.md#submission-approval-and-identity
[owner-rbac]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/scripts/delegated_argo_policy.py#L41-L165
[provider]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#approve-an-operation
[rebuild-acl]: ../../operations/rebuild-current/acl.sql
[release-review]: workload-database-identities.md#prepare-the-reviewed-release
[snapshot]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/current-property-state.md#snapshot-procedure
[withdrawal]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#withdrawal-and-retained-state
[withdraw-batch]: ../../operations/rebuild-current/withdraw.sql
