# Proposed persistent D06 target

`target.json` records the exact proposed target, budgets, public Secret references
and immutable input identities. `delegation.json` is the initial provider-native
namespace/database delegation. These files are preparation inputs, not Kubernetes
manifests, credentials, an admitted release candidate or installation authority.

Follow the [target preview runbook](../../docs/operations/d06-target-preview.md).
The state directory is outside redirected AppData; the operator confirmed its
selection. Live execution still needs exact-target approval. Native previews remain offline without `--execute`.
`approvedTemplates` reserves the future release template name; no template is
installed, and `workflowTemplate: null` keeps D06 guided.

Consistency fixtures in `tools/tests/installation-inputs.test.mjs` bind this
selection to the registered Argo namespaces, loopback ports and provider budget.
They do not prove native provider compatibility, live ownership or free capacity.
Keep generated preview reports, kubeconfigs, journals and private inputs outside
Git. The ignored reports use the exact file-byte hashes of these JSON inputs.
