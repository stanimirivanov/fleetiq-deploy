# OCI qualification implementation draft

Review against [#149](https://github.com/stanimirivanov/fleetiq-deploy/issues/149).
This directory contains comparison material. `pnpm packages:check` remains
the release gate.

## Shared verifier

The caller supplies one reviewed UTF-8 JSON file containing `revision`
(the source commit), `qualification` (the caller's manifest qualification
result), and `files` (the exact chart files, four local render overlays, and
tool lock, keyed by repository path). The caller records its SHA-256 as
`sha256:<hex>`. The draft checks that digest before staging the contents.
Future integration into the existing verification caller must add source
fingerprinting, input construction, result validation and cleanup evidence.

The verifier uses the existing package and registry functions. It packages
the two charts and release envelope, checks digest pulls and archive and
render equality, and exercises missing objects, overwrite refusal, and tag
mutation. Its compact JSON records per-run OCI and archive digests.
The registry endpoint is restricted to IPv4 loopback.

The reviewed Linux AMD64 verifier image needs the pinned Node toolchain,
the checksum-verified Helm executable at `/usr/local/bin/helm`, GNU tar,
locked Node dependencies, and the verifier modules and contracts under
`/opt/fleetiq-deploy`. Reuse an image with that contract if available.
Image selection is pending. The host variants can use the existing locked
Node and package dependencies and set `OCI_DRAFT_HELM` to the checksum-verified
Helm binary.

## Technology comparison

- **Native Job** — The kubelet starts the verifier after the registry probe
  passes. The Job controller provides the deadline and TTL.
- **Argo and the native Job** — Argo coordinates submission and staging
  while Kubernetes owns the same registry lifecycle. It adds executor RBAC,
  an extra deadline, and another run identity. Consider this for a larger workflow.
- **Dagger** — A Dagger service can supply a fresh registry through a client
  loopback tunnel. The Kubernetes engine has its own lifecycle and permissions.
- **Rootless Podman** — A cluster-free caller can use the same verifier with
  a rootless local registry. It needs independent lifecycle evidence.
- **Tekton** — Similar controller tradeoff to Argo. A TaskRun adds executor,
  results, and sidecar behavior to qualify.
- **Chainsaw and KUTTL** — Candidates for interruption, admission, and cleanup
  checks after a Kubernetes fixture exists. They can call the same verifier.
  Helm tests also require a Helm release.
