# Minimal-demo administrative Jobs

## TL;DR

Use `fleetiq-admin` to preview a request, submit the exact Job once under the
provider’s approved grant, and recover its receipt. Keep the private attempt
directory through recovery and withdrawal. Migration uses the
[existing fenced database workflow](minimal-demo-data.md#migration-and-grants).

## Prerequisites

Use a prepared, provider-owned minimal-demo target and the reviewed immutable
backend. Qualification requires separate authorization for a disposable
`qual-` consumer. Confirm the backend publication and the worker's staged
image identity. The request binds the deployment and provider Git revisions,
provider incarnation, HTTPS API endpoint, namespace and CNPG Cluster UIDs,
PostgreSQL system identifier and database OID, and source and runtime image digests.
[Database prerequisites](minimal-demo-data.md#prerequisites-and-identities)

Install the pinned Helm toolchain in the reviewed deployment checkout. Build
the command using Go 1.24 or newer. The command calls Git, Helm, the provider's
locked uv entry point, kubectl, psql and jq directly.

```text
go -C operations/minimal-demo/administration/cmd/fleetiq-admin build -mod=readonly -o /private/bin/fleetiq-admin .
```

Use two provider-issued, TLS-verifying kubeconfigs and distinct principals.
The attempt launcher can create only the approved Job. The independent observer
can read the `kube-system` incarnation and the data namespace and CNPG Cluster,
the exact Job, Pods and Pod logs in the data namespace, and the immutable input
ConfigMap when used. Its account needs
no create, exec or delete authority. The Job's runtime account carries no
mounted API token. [Provider delegation](https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#approve-an-operation)

Have the credential operator provide a scoped PostgreSQL observer with read-only
access for the selected mutation and permission to read `pg_control_system()`.
The observation verifies the approved primary hostname and CA, system identifier
and database OID. Each Job uses the named
`fleetiq-db-<command>-url` Secret and the public database CA. Keep all Secret
material, kubeconfigs, PostgreSQL password files and attempt evidence outside Git.
The six routine Job roles require reviewed grants qualified with the exact backend.
Reclaim also requires approved tenant retention policy, a naturally aged verified
archive, and a private HTTPS store trusted by that backend. These are prerequisites
to installed acceptance. [Runtime grant boundary](https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/postgres-runtime-grants.md)

## Preview and submit

Supply one private request JSON file. The values below illustrate the fields.
Replace them with reviewed values from the specified target and deployment.
The checkout is selected by `--repo` and the provider checkout must contain the
reviewed implementation of delegation.

```json
{
  "operation": "rebuild",
  "job": "qual-demo-rebuild",
  "consumer": "qual-demo",
  "deploymentRevision": "DEPLOYMENT_GIT_SHA",
  "providerRevision": "PROVIDER_GIT_SHA",
  "incarnation": "PROVIDER_TARGET_INCARNATION",
  "providerCheckout": "/reviewed/k8s-infrastructure",
  "dockerContext": "default",
  "stateRoot": "/private/provider-state",
  "httpsPort": 18443,
  "selectionDigest": "sha256:BACKEND_SELECTION_FILE_DIGEST",
  "runtimeImageID": "sha256:STAGED_RUNTIME_IMAGE_ID",
  "server": "https://127.0.0.1:6443",
  "namespaceUID": "OBSERVED_DATA_NAMESPACE_UID",
  "clusterUID": "OBSERVED_CNPG_CLUSTER_UID",
  "observerKubeconfig": "/private/observer.kubeconfig",
  "launcherKubeconfig": "/private/launcher.kubeconfig",
  "observerUser": "APPROVED_KUBERNETES_OBSERVER",
  "pgHost": "fleetiq-db-rw.qual-demo-data.svc",
  "pgPort": 5432,
  "pgUser": "demo_admin_observer",
  "pgRootCA": "/private/public-database-ca.crt",
  "pgPassFile": "/private/pgpass",
  "databaseSystemID": "REVIEWED_POSTGRES_SYSTEM_IDENTIFIER",
  "databaseOID": 16388,
  "inputs": {"tenant": "synthetic"},
  "scope": {"tenant": "synthetic", "asset": "test-device", "property": "voltage", "version": 1}
}
```

1. From the deployment checkout, run `fleetiq-admin preview --attempt /private/attempt-01 --request /private/request.json`.
   The destination must be new. Inspect `plan.json`, the exact provider operation,
   and the emitted `routes.yaml` and optional `input-configmap.json`.
   Preview renders locally and returns the digest to approve.
2. Stage the reviewed credential references and optional immutable ConfigMap.
   Fence simulator and archive writers. Bootstrap also requires the full writer
   fence. The provider approves the exact operation under its existing authority
   and supplies its private configure receipt. The network owner stages the
   reviewed route and confirms it before submission.
3. The operator runs
   `fleetiq-admin submit --attempt /private/attempt-01 --approved SHA256_PLAN_DIGEST --grant-receipt /private/provider-grant.json`.
   The command checks the provider grant, target incarnation and scoped identities,
   checks any staged immutable
   input, exercises server dry-run admission, captures a read-only database baseline,
   then writes intent before sending the single create request. The Job has a
   300-second deadline and zero configured retries.
4. Run `fleetiq-admin status --attempt /private/attempt-01` until the Job is terminal.
   Status observes the same Job and writes execution and before/after evidence
   in a new private observation directory. Keep both the Job and its Pods through
   evidence capture. Withdraw the exact grant, routes and credential references
   through their owners after reconciliation. [Provider withdrawal](https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#withdrawal-and-retained-state)

## Review the durable result

Use the same attempt directory and run `status` after interruption. A lost create
response or an absent Job remains uncertain. Status records that uncertainty
with the available database evidence. Keep intent and escalate without submitting
again. An authorized replacement needs a fresh attempt after resolving
the original effects. Compare terminal execution and independent database evidence
against the approved scope. An exit-zero marker alone cannot establish a commit.

Numeric inputs to Helm use decimal strings to preserve exact integer values.
`register` and `calculate` derive the SQL scope from the exact staged input bytes.
The remaining operations use `scope`, with operation inputs repeated as appropriate.

| Operation | Inputs | Durable evidence |
| --- | --- | --- |
| `bootstrap` | No chart inputs. Stage the temporary login and exact identity references. | Compare the installed operator and external mapping to the approved identity. Set `scope.identityDigest` to the SHA-256 of the expected PostgreSQL JSONB identity tuple. |
| `rebuild` | `tenant` | Select `asset`, `property` and `version` in scope. Check the expected winner and a generation and revision advance of one on a quiesced fixture. |
| `register` | `tenant`, `calculator`, `version`, `implementation`, `input`, `input_version`, `output`, `output_version` | Compare the full immutable declaration. A matching row present before execution proves a previous result. |
| `calculate` | `tenant`, `scope`, `calculator`, `version`, `evaluation`, `configuration`, `target`, `start`, `end`, `finalize`, `known`, `evaluated`, `minimum` | Verify exact preparation and terminal status. Check the expected output digest for a complete fixture. Preparation alone is partial. |
| `reclaim` | `tenant`, `manifest`, `policyRevision` | Check the exact receipt, policy and original member count, cleared payload columns and retained object bytes. A policy denial should leave the scope unchanged. |
| `summarize` | `tenant`, `asset`, `property`, `version`, `start`, `end`, `resolution`. Supply both `manifest` and `generation` for restore evidence. | Check the returned series, coverage and known numeric result. Status records the exact reported revision separately, including an older revision returned by a replay. |
| `expire` | `tenant` | Compare all rows of the bounded fixture. Check removed payloads and preserved live leases. Restore and export work can commit separately. |

Restore and export remain product API operations. Apply the installed qualification
on an authorized disposable target with scoped grants and synthetic fixtures.
Verify one effective create, negative admission for changes to the approved Job,
duplicate refusal, interrupted observation, outcome reconciliation, and withdrawal
while preserving an unrelated sentinel. The offline and isolated database checks
cover only their reported scope. Retain separate installed evidence for each case.
