# FleetIQ data chart

Consumer-owned CloudNativePG Cluster and scoped network policy. The provider owns
the operator, CRDs and retained StorageClass. See
[package contracts](../../docs/operations/kubernetes-packages.md) for credential,
role and deletion boundaries; values.schema.json owns input types.

- Required digest image, explicit storage, bounded resources and supervised updates.
- Separate migration-owner and runtime logins/password Secret references.
- No application SQL, runtime DDL, generated credentials, backup or restore job.
- Cluster retained across ordinary Helm/Argo removal; namespace retention is composed
  separately. StorageClass reclaim behavior still needs live provider qualification.
- profile=nonlocal requires at least three instances; it does not establish HA.

The offline local-preview image is synthetic. Never install it as a real selection.
The chart assumes its selected namespace is dedicated to FleetIQ data.
