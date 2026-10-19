# Kubernetes package constraints

- Read [package contracts](../docs/operations/kubernetes-packages.md).
- Helm owns workload fields; Kustomize composes namespace policy. Neither installs
  shared controllers/CRDs or creates credentials. No live apply command belongs here.
- Keep values schemas closed, images digest-addressed, and Secrets as references.
  Runtime serving always uses `serve --check-schema`; no migration/init/Helm hooks.
- Maintenance scales every packaged application writer to zero. Data and retained
  namespaces are never implicitly pruned. This is not proof of observed drain.
- Change templates, values schemas, real rendering tests and manifest policy together.
  Run `pnpm manifests:install`, `pnpm manifests:check` and `pnpm check`.
