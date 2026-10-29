# Proposed persistent D06 target

Linux migration: `/var/lib/fleetiq/d06` and Docker context `default` are proposed
inputs, pending operator confirmation. Earlier host preparation and preview
evidence do not qualify this Linux target. Re-run provider previews and capacity,
path ownership, TLS and identity checks before requesting live approval.


`target.json` records the exact proposed target, budgets, public Secret references
and immutable input identities. `delegation.json` is the initial provider-native
namespace/database delegation. These files are preparation inputs, not Kubernetes
manifests, credentials, an admitted release candidate or installation authority.

Follow the [target preview runbook](../../docs/operations/d06-target-preview.md).
The proposed state directory is outside the checkout; confirm its
selection. Live execution still needs exact-target approval. Native previews remain offline without `--execute`.
`approvedTemplates` reserves the future release template name; no template is
installed, and `workflowTemplate: null` keeps D06 guided.

Consistency fixtures in `tools/tests/installation-inputs.test.mjs` bind this
selection to the registered Argo namespaces, loopback ports and provider budget.
They do not prove native provider compatibility, live ownership or free capacity.
Keep generated preview reports, kubeconfigs, journals and private inputs outside
Git. The ignored reports use the exact file-byte hashes of these JSON inputs.


`bootstrap/` is the real initial namespace/quota Kustomize package, separate from
inert target/delegation records. Run `pnpm installation:check` to build and validate
its six objects with native tools; the regular manifest gate includes it. Apply
only after exact-target approval and absence/original-ownership checks. Consumer
labels declare intent and never authorize relabeling or adopting existing state.
See the [staged approval](../../docs/operations/d06-installation-approval.md) and
[host preparation](../../docs/operations/d06-host-preparation.md).
