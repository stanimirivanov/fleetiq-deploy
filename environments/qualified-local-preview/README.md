# Qualified-provider local preview

This is an offline composition fixture, not an accepted environment or installation.
It layers namespace request accounting over `../local-preview`; the renderer also
layers the runtime/data overrides over that fixture's synthetic images and Secret
references. Never install the synthetic digests or documentation network addresses.

- External origin: `https://fleet.local.test:18443`.
- Gateway: provider-owned Cilium, HTTPS listener 8443; DNS hostnames exclude ports.
- Gateway traffic: reserved Cilium ingress identity to the edge on TCP 8080 only.
- OIDC: trusted HTTPS issuer on 19443, with egress derived from that issuer port.
- Storage: `local-retained`, 2Gi, with 8Gi/four-claim namespace request accounting.
- PostgreSQL: illustrative 18.4 tag plus a synthetic digest, not a selected artifact.

`pnpm manifests:check` renders portable active/maintenance/nonlocal states and
provider-local active/maintenance states with real Helm, Kustomize and strict local
schemas. `pnpm packages:check` also compares both chart modes after OCI read-back.
Neither command grants activation authority or proves live network/persistence.

See [the D06 handoff](../../docs/operations/local-kubernetes-prerequisites.md).
