# Rootless Podman registry draft

The Quadlet unit describes a local, disposable fixture for comparison.
It uses a 64 MiB tmpfs and a dynamically allocated host loopback port. Podman waits for the
registry health check and systemd bounds its lifetime.

With an approved rootless Podman and systemd user instance, put the two files
in the user Quadlet search path and reload the user manager. Start
`fleetiq-oci-draft@<unique-run-id>.service`. Observe the assigned address through
`podman port fleetiq-oci-draft-<unique-run-id> 5000/tcp`, set `OCI_DRAFT_HOST`
to that loopback address, and run
`node tools/releases/drafts/oci-qualification/verify.mjs <bundle> <sha256>`.
Stop the unit after collecting the result. Confirm the owned container, port,
and ephemeral storage are released.
Live cgroup delegation, file ownership, mount flags and abandoned-run cleanup
remain to be proven.

If cluster-free operation is required, this can share the OCI verifier with
the Kubernetes Job while leaving lifecycle mechanics with each native runner.
Standalone Distribution and nerdctl can also host the registry, with their
own isolation and lifecycle evidence. Podman's `kube play` does not implement
the Job's scheduling, deadline and TTL semantics.

[Quadlet reference](https://docs.podman.io/en/stable/markdown/podman-systemd.unit.5.html) ·
[Podman Job field support](https://docs.podman.io/en/stable/markdown/podman-kube-play.1.html#job-fields)
