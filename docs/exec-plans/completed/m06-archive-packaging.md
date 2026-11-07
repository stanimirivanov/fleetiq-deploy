# M06-PR17 archive worker packaging

Status: completed. Deployment issue #47.

The optional Compose overlay starts one archive worker with the verified
backend image and carries private storage files into the worker and the
backend. Existing lifecycle policy remains authoritative. Startup,
stop and restart have an owned installation check.

Platform PR #429 merged as `cab947309cade798639ec44f1c00b81234dcb4c3`.
The [successful publication run](https://github.com/stanimirivanov/fleetiq-platform/actions/runs/42369950372)
selects that revision for linux/amd64. Its immutable image is
`ghcr.io/stanimirivanov/fleetiq-platform@sha256:bf8bb70924c9d8392330f06097d44fc6ca46d70b0ec23562d4942fcb8f69e7fd`.
The publication receipt matches the qualification digest and 58-migration
inventory. Local Compose builds from the exact reviewed source pin.

Focused tests cover disabled defaults and rejection of unsafe configuration
and linked secret files. Actual Compose rendering also rejects privileged
mode, host ports and a substituted reclamation command. Canonical
installation and structural verification are recorded in the linked PR.

See [the archive operations guide](../../operations/history-archive.md) for
the private input and rollout contract.
