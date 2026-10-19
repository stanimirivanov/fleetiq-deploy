# Offline manifest fitness

The native tools and schema inputs in tools.lock.json are required prerequisites.
Run pnpm manifests:install, then pnpm manifests:check or pnpm check.

- Archive checksums come from official Helm, Kustomize and Kubeconform release
  records. Extracted executable hashes are also pinned and rechecked before use.
- Kubernetes 1.35.0 schemas use an immutable yannh/kubernetes-json-schema revision.
  GVK-specific CNPG/Gateway schemas use a pinned Datree CRDs-catalog revision.
  Their exact URLs and content checksums are recorded in the lock.
- Schema catalogues are offline shape validation, not proof of a particular
  provider's CRD version, CEL/defaulting behavior, admission or controller support.
  D06 must validate actual supported provider versions/server-side behavior.
- The renderer does not enable Helm/Kustomize plugins, remote bases, insecure TLS
  or schema skips. Temporary files are owned, bounded to the fixture and removed.
- Policy modules inspect parsed resources. Mutation tests exercise actual tool
  failures plus credential, privilege, exposure, retention and maintenance rejects.

No cluster operation or environment activation is implemented. See
[package contracts](../../docs/operations/kubernetes-packages.md).

Upstream references: [Helm chart/schema validation](https://helm.sh/docs/topics/charts/),
[Kustomize](https://github.com/kubernetes-sigs/kustomize),
[Kubeconform and its validation limits](https://github.com/yannh/kubeconform),
[CRD schema catalogue](https://github.com/datreeio/CRDs-catalog),
[CNPG bootstrap](https://cloudnative-pg.io/docs/devel/bootstrap/), and
[Gateway TLS](https://gateway-api.sigs.k8s.io/guides/user-guides/tls/).
