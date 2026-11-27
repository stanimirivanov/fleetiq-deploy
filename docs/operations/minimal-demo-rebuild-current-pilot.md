# Minimal-demo rebuild-current offline pilot

## TL;DR

Render the provider carrier and attempt-bound database route offline. The deployment
owner stages and withdraws the temporary database login under the writer fence.
Live acceptance in [#139](https://github.com/stanimirivanov/fleetiq-deploy/issues/139)
still requires a protected read under that fence and a single read-only recovery
result. [Offline preparation in PR #152](https://github.com/stanimirivanov/fleetiq-deploy/pull/152)

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

## Scoped database lifecycle

The deployment owner and credential operator use the retained installation's
reviewed release lock and the same target throughout. Render the opt-in values
over `environments/minimal-demo/data.yaml` with `charts/fleetiq-data`.

1. Keep product writers fenced and observe the drain. Have the credential
   operator re-stage the existing migration owner credentials and confirm the
   approved owner route. Use `rebuild-current-owner.yaml` to admit the migration
   owner as the only product login and reconcile the retained
   `fleetiq_rebuild_current` role with `NOLOGIN` and `disablePassword`.
   Verify the reconciled role and observed admission. The credential operator
   stages the `fleetiq-db-rebuild-current` basic-auth Secret and the separate
   `fleetiq-db-rebuild-current-url` Secret. Both are private and attempt-bound.
2. The deployment owner applies the reviewed [grant batch][grant-batch] under the
   existing database-owner authority. The batch takes the shared transaction lock
   and checks the reviewed migration inventory, primary, database OID, role
   isolation, and drain. It verifies the ordinary workload grants and applies a
   separate ACL for the pinned backend's schema check and rebuild. The source
   row lock uses a column protected by the installed history immutability trigger.
   Both batches use the [workload database SQL context][identity], including the approved
   `release_digest`, owner `PGUSER`, `FLEETIQ_DATABASE_OID`,
   `FLEETIQ_RELEASE_DIGEST`, `FLEETIQ_LEGACY_ROLE`, `FLEETIQ_WORKLOADS` and
   `FLEETIQ_MIGRATION_INVENTORY`.
3. Withdraw the owner route for the attempt. Use `rebuild-current.yaml` to
   admit the dedicated login alone, with a two-connection limit. Observe the
   reconciled login, TLS-only admission and
   attempt-scoped route before granting submission authority. The published
   rebuild function executes with the login's projection-table privileges across
   tenants. The provider-approved Job and its immutable tenant input bind the
   tenant selection. Keep the credential exclusive to that attempt.
4. Withdraw the attempt route and launcher grant, then reconcile
   `rebuild-current-owner.yaml` again. Wait for active rebuild sessions to close
   and restore the approved owner route. The deployment owner applies the reviewed [withdrawal batch][withdraw-batch].
   It revokes the scoped ACL and verifies effective connection denial and no
   remaining database-object dependencies for the role. Verify that the old
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
[maintenance]: kubernetes-packages.md#networks-maintenance-and-non-local-limits
[grant-batch]: ../../operations/rebuild-current/grant.sql
[identity]: workload-database-identities.md#operate-the-upgrade
[provider]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#approve-an-operation
[snapshot]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/current-property-state.md#snapshot-procedure
[withdrawal]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#withdrawal-and-retained-state
[withdraw-batch]: ../../operations/rebuild-current/withdraw.sql
