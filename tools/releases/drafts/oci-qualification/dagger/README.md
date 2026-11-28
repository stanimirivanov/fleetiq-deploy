# Dagger registry service draft

The Dagger v0.21.12 module declares a temporary registry service. The verifier
runs on the caller, using the service's client-side loopback tunnel. This keeps
OCI transport and assertions shared with the native Job. Engine and module
setup, as well as generated Go bindings, remain review prerequisites.

With a prepared engine use the explicit reviewed `kube-pod://` engine selector
and a private kubeconfig. Open the service using `dagger call --source
<module-directory> registry --run-id <unique-run-id> up --random`. In another
terminal set `OCI_DRAFT_HOST` to the observed `127.0.0.1:<port>` and run
`node tools/releases/drafts/oci-qualification/verify.mjs <bundle> <sha256>`.
Verify tunnel binding before use. Bound the foreground CLI session and close
it after retaining the verifier result.

The engine's service network and client tunnel replace the Job's Pod loopback.
Review the engine's ownership, privileges, cache, accepted client access and
cleanup after disconnection. The 64 MiB mount declaration does not establish
effective permissions, flags, PID bounds or lifecycle parity. A shared engine
would only pay for itself if it already served multiple approved workloads.

[Upstream Go SDK](https://docs.dagger.io/reference/sdks/go/) ·
[Engine selection](https://docs.dagger.io/reference/cli/#dagger-engine) ·
[Pinned engine chart](https://github.com/dagger/dagger/blob/v0.21.12/helm/dagger/templates/engine-daemonset.yaml)
