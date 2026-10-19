# Offline local composition

This directory is a rendering fixture, not an active environment. No Argo
Application references it. Image digests and RFC 5737 IP addresses are synthetic;
Secret/CA/controller/storage references are examples of required inputs.

Run pnpm manifests:check for real Helm lint/template, Kustomize namespace/quota
composition, pinned local schema checks and manifest policy. The harness renders
active local, maintenance local and non-local sizing states without cluster access.

Read [package contracts](../../docs/operations/kubernetes-packages.md). D05 selects
reviewed artifacts and D06 qualifies actual provider inputs before activation.
