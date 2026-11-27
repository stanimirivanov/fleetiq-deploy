# Minimal-demo rebuild-current offline pilot

[PR #152](https://github.com/stanimirivanov/fleetiq-deploy/pull/152) covers offline
preparation. The operations chart produces a provider carrier and an attempt-bound
database route for review. Live acceptance remains open in
[#139](https://github.com/stanimirivanov/fleetiq-deploy/issues/139) and requires
the database grant, fenced read access and recovery prerequisites below.

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

## Cutover prerequisites

- **Scoped rebuild login.** The qualified deployment SQL has `project-current`
  grants for `projection.project_next()`. The rebuild also calls
  `projection.rebuild_current(text)` and needs projection writes including
  `DELETE` on current properties and `UPDATE` of the tenant head generation.
  The pinned grant policy and database phases supply no dedicated login with
  those privileges. Isolated PostgreSQL 18 verification with the published
  backend and reviewed fence and grant SQL observed the denied rebuild and an
  unchanged generation, revision and processed count of `1:0:0`.
  Deployment owns a scoped rebuild grant, phase, and withdrawal contract.
  [Qualified SQL grant policy][grants] · [Platform rebuild function][rebuild]
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
[grants]: https://github.com/stanimirivanov/fleetiq-deploy/blob/d269d16a4d23169e34042a29cb594b66c08d6e22/operations/workload-database/base/sql/policy.sql
[provider]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#approve-an-operation
[rebuild]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/migrations/0056_verified_hot_retention.sql#L168-L198
[snapshot]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/current-property-state.md#snapshot-procedure
[withdrawal]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#withdrawal-and-retained-state
