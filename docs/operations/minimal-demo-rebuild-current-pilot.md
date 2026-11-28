# Minimal-demo rebuild-current pilot

## TL;DR

Render the provider carrier, attempt-bound database route and exact current-property
read offline. One owner grant and one owner withdrawal cover the rebuild and
observer logins. Establish the observer's browser session before fencing writers.
Use the same HTTPS origin and exact GET before and after the rebuild.
Live Kubernetes qualification and the single read-only recovery result remain open
in [#139](https://github.com/stanimirivanov/fleetiq-deploy/issues/139).
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

This offline carrier render uses the same synthetic single-segment tenant as
the observer example. Run the render from the repository root with the installed
manifest tools. Use `--set-literal` so Helm preserves punctuation in the reviewed
tenant identifier.

```bash
target/tools/manifests/helm template demo-rebuild-01 charts/fleetiq-minimal-demo-operations \
  --namespace qual-fleet-data --kube-version 1.35.0 \
  --set-string operation=rebuild-current --set-literal 'tenant=proof-rebuild' \
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

Check both route selectors against the Job's attempt and runtime identities.
The original offline preparation recorded raw-byte parity across 36 ordinary
local, provider-local and nonlocal Helm and Kustomize outputs and seven
existing minimal-demo outputs.

## Prepare the protected read

Use the installed local scoped Cilium runtime release and the same canonical
HTTPS origin and certificate that served ordinary browser sign-in. Before
fencing, the independent observer signs in through the deployed OIDC provider.
Confirm that the session can read the reviewed property with a current
`telemetry.read` grant. It must last through the attempt. The fenced Deployment
runs the published `serve --check-schema` image with the same browser origin,
OIDC issuer, client, authority and trust. The browser continues to use its
existing secure session on that origin.

The reviewed private runtime overlay contains the property selection and
maintenance setting. Reuse the ordinary reviewed runtime values and the pinned
backend reference from demo preparation. The selected identifiers must begin
with an ASCII letter or digit and may then include letters, digits, `. _ ~ : -`,
up to 128 characters. Choose a positive property version. Gateway API rejects
encoded slashes in Exact paths. If the reviewed tuple cannot be expressed in
these values, stop the pilot for that target. [Gateway path contract][gateway-path]

```yaml
maintenance: true
rebuildCurrentObserver:
  tenant: proof-rebuild
  asset: asset-a
  property: electrical.voltage
  version: 1
```

Render this overlay over the installation's reviewed local scoped runtime values
in `<consumer>-apps`. Save the rendered manifest with the request. The example
assumes `RUNTIME_VALUES` contains those installed values and `BACKEND` is the
published reference from demo preparation. Set `network.oidcCidrs` to the one
reviewed RFC 1918 IPv4 /32 in the selected runtime values.

```bash
"$HELM" template fleetiq charts/fleetiq-runtime --namespace "$CONSUMER-apps" \
  --kube-version 1.35.0 -f "$RUNTIME_VALUES" -f "$DEMO/runtime.yaml" \
  -f "$PRIVATE/rebuild-current-observer-values.yaml" \
  --set-string "backend.image=$BACKEND" \
  --set-string "network.databaseNamespace=$DATA" \
  > "$PRIVATE/rebuild-current-observer-runtime.yaml"
```

Compare the reviewed tenant directly with `FLEETIQ_PROJECTION_REBUILD_TENANT` in
the carrier's `operation.json` and the provider-rendered Job, and with the tenant
segment in the rendered HTTPRoute's Exact GET path. Require all three to match
before approving the attempt. The rebuild role's SQL privileges act across
tenants. The approved immutable Job input binds its execution to this tenant.

The private observer Service selects Pods by workload label. Both the observer
Cilium endpoint selector and the matching PostgreSQL ingress peer require
the workload label, the reviewed ServiceAccount and absence of
`k8s-infrastructure.io/demo-routine`. The policies allow only Gateway ingress
to port 8080, configured DNS, the designated CNPG cluster on TCP 5432 and the
reviewed issuer destinations. The issuer /32 uses the canonical HTTPS port.
The Cilium local `host` identity allows the worker's translated Gateway
listener port. Confirm both network
paths serve the reviewed issuer through the canonical HTTPS origin. The
data-namespace operator owns the database ingress rule.
[Minimal-demo network][network]

The credential operator stages `fleetiq-db-rebuild-current-observer`, a private
basic-auth Secret with username `fleetiq_rebuild_current_observer` and label
`cnpg.io/reload: "true"` in `DATA`.
Stage the dedicated URL in `fleetiq-db-rebuild-current-observer-url` key `url` in
`<consumer>-apps`, pointing to the reviewed CNPG primary DNS with verify-full TLS
and the mounted `/etc/fleetiq/database/ca.crt`. Reuse the ordinary reviewed
database CA reference. Record the credentials' custody and Secret UIDs. Bind
the observer runtime, exact GET, role inventory and withdrawal checks to the
reviewed release requests. Keep the saved ordinary maintenance manifest for the
fully drained owner phases.

The observer's PostgreSQL column privileges span rows across tenants in the
granted tables. The exact HTTP route binds the request to one property tuple,
and the backend checks current tenant `telemetry.read` authorization on each
GET. Keep the database credential and its URL private with the credential
operator and the observer workload.

### Witness the observer endpoint

Use the existing authorized read access and the reviewed target and namespace
identities. Before each protected read, the independent witness verifies the
live observer attempt data phase, writer drain and accepted Exact GET route to
the reviewed Service and port. Inspect the Service and all EndpointSlices
with its `kubernetes.io/service-name` label in the apps namespace. Require the
EndpointSlice owner references to match the Service UID. Require the endpoints
to target only the intended Pod by namespace, name and UID and to match its
observed IP and HTTP port. Require a Ready, non-terminating endpoint and a
Running, Ready, non-terminating Pod with the reviewed ServiceAccount, token
automount disabled and the routine marker absent.

Follow controller owner references by UID from Pod to ReplicaSet to the
reviewed observer Deployment. Compare the live Pod's serving configuration
and running image ID with the reviewed observer render and verified image.
Record these identities and the phase privately, and recheck them after the
GET before accepting the read. Treat missing, changed or conflicting endpoint,
workload or phase evidence as an unresolved read.

## Prepare reviewed owner execution

Use the installation release lock and the same fenced target throughout. Include
`rebuild-current-owner-grant-v2` and `rebuild-current-owner-withdraw-v2` in the
provider's reviewed `approvedTemplates` when selecting the disposable target.
A retained target missing those names needs a provider-reviewed delegation
transition before staging. The provider admits only the named template and one
`release-digest` parameter on a suspended Workflow and makes the approved
template spec immutable. [Delegated Argo admission][owner-admission]

Render `rebuild-current-observer-owner.yaml` and `rebuild-current-observer.yaml`
over `environments/minimal-demo/data.yaml` with `charts/fleetiq-data`. Review a separate
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
  selection. Bind both expected ACLs and the withdrawal checks for role
  dependencies, connection denial, routes and credentials. [Rebuild ACL inventory][rebuild-acl]

From the reviewed checkout, the release owner copies `operations/` into a
fresh private staging directory, `OWNER_STAGING`. For the `grant-v2` and `withdraw-v2` overlays
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
  cd "$OWNER_STAGING/operations/rebuild-current-owner/$OWNER_ACTION-v2"
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
`RELEASES`. Select the staged `rebuild-current-owner-grant-v2` or
`rebuild-current-owner-withdraw-v2` template and the matching reviewed
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

1. Keep product writers fenced and observe the drain. Reconcile ordinary runtime
   maintenance without the observer values. Have the credential operator stage
   the owner credentials and routes for the approved grant execution. Reconcile
   the observer-owner data phase to admit the migration owner alone and declare
   both temporary DatabaseRoles with `NOLOGIN` and `disablePassword`. Verify
   the actual role and authentication state. Stage the private rebuild Secrets
   `fleetiq-db-rebuild-current` and `fleetiq-db-rebuild-current-url` with the same
   dedicated login. Use a basic-auth password Secret with `cnpg.io/reload: "true"`.
   [CNPG password reconciliation][cnpg-passwords]
2. Run the one approved v2 owner grant Workflow. It takes the shared transaction
   lock and checks the migration inventory, primary, database OID, role isolation
   and drain. It verifies ordinary workload grants and the source immutability
   trigger, applies both scoped ACLs and checks their effective privileges before
   commit. The [observer ACL][observer-acl] allows the checked-schema ledger,
   browser session lookup, actor and tenant policy and the exact snapshot's query
   inputs. SQL write privileges and rebuild execution stay disabled for the
   observer. The pinned binary attempts background browser-expiry deletes in
   browser mode. PostgreSQL denies them and serving continues. Keep the role
   read-only. [Grant batch][grant-batch]
3. Withdraw the owner route. Reconcile the observer attempt data phase and
   read back only the rebuild and observer product logins, with TLS-only
   authentication and limits of two and ten connections respectively. Confirm
   the ordinary backend, edge, ingester, replay, projector and other writers stay
   stopped and drained. Stage the scoped observer policies and runtime. Require
   the independent endpoint witness and a successful protected GET from the
   pre-fence browser session on the same HTTPS origin. Record the before
   snapshot privately. Verify that anonymous access is denied and that other
   paths, property versions and methods have no observer route. If the session
   has expired or the read is unavailable, stop cutover and preserve evidence.
   Require the witnessed before snapshot and repeat the exact tenant comparison
   against the approved Job and live route before submitting the one attempt.
4. Before teardown, follow the provider's withdrawal procedure with the existing
   controlled deployment read authority. Confirm the exact attempt is unused or
   correlate the original accepted Job UID on the same target, require a terminal
   Job condition and account for all owned Pods and their termination. Collect
   the execution receipt privately. Preserve the original Job and evidence if
   execution is active, missing, or ambiguous. Keep the writers fenced and the
   attempt route and launcher grant in place until this gate passes.
   [Provider withdrawal][withdrawal]
5. After terminal execution, attempt the same witnessed browser GET before
   withdrawing observer access. Record generation, revision, processed count,
   pending state and the winning change. If the after-read is unavailable or
   unverified, record the durable-effect verdict as unresolved, preserve the
   original execution and before-read evidence, and keep the writers fenced
   for review. Reconfirm the unused-or-terminal gate immediately before
   teardown, including when the after-read is unavailable. Have the provider
   withdraw the launcher grant and the network owner withdraw the Job's
   attempt route. Restore the ordinary maintenance route. Retire the exact
   observer Service, Deployment, ServiceAccount and both observer policies
   and verify their absence. Reconcile the observer-owner data phase and verify
   both temporary roles are disabled and all observer and rebuild sessions
   have closed. Run the one independently approved v2 owner withdrawal Workflow.
   In the same transaction it revokes both ACLs and checks effective connection
   denial and remaining role dependencies.
   [Withdrawal batch][withdraw-batch] · [Observer withdrawal][observer-withdraw]
6. Verify both old credentials fail to connect and retire the four temporary
   rebuild and observer Secrets. Withdraw the owner route and reconcile runtime
   database admission with the owner disabled. Retire the temporary owner
   credentials. Keep the writers fenced if any withdrawal check fails. Both
   retained roles stay disabled when ordinary values return.

The phase and SQL assets belong to the deployment owner. The submitting operator
uses the approved Job and recovery interfaces described by the pilot.

## Qualification and cutover

An isolated fixture used the published backend with PostgreSQL 18 and a real
synthetic OIDC session established before the fence. With the ordinary backend
stopped and the two temporary logins admitted, the protected GET reported
generation, revision and processed count advancing from `1:0:0` to `2:1:2`.
Pending work cleared and the expected event at time `2000` won. Anonymous and
cross-tenant access were denied. The fixture's exact HTTPS route denied other
versions, login and POST. PostgreSQL denied observer writes, rebuild execution
and unrelated reads, and rejected the old observer credential after withdrawal.
This fixture exercised the pinned product and rendered SQL through a local
HTTPS relay. The native Gateway and Cilium datapath still requires installed
qualification. [Product snapshot contract][snapshot]

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
[network]: minimal-demo-network.md#ownership-and-flow-contract
[observer-acl]: ../../operations/rebuild-current-observer/acl.sql
[observer-withdraw]: ../../operations/rebuild-current-observer/revoke.sql
[gateway-path]: https://github.com/kubernetes-sigs/gateway-api/blob/v1.6.3/apis/v1/httproute_types.go
[grant-batch]: ../../operations/rebuild-current/grant.sql
[migration-route]: minimal-demo-data.md#render-the-phases
[owner-admission]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/delegated-argo.md#submission-approval-and-identity
[owner-rbac]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/scripts/delegated_argo_policy.py#L41-L165
[provider]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#approve-an-operation
[rebuild-acl]: ../../operations/rebuild-current/acl.sql
[release-review]: workload-database-identities.md#prepare-the-reviewed-release
[snapshot]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/current-property-state.md#snapshot-procedure
[withdrawal]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#withdrawal-and-retained-state
[withdraw-batch]: ../../operations/rebuild-current/withdraw.sql
