# Native Job draft

The chart renders one resource at a time and is used with `helm template`.
Use the approved context and dedicated qualification namespace. Confirm the
live cluster and namespace identities before any writes.

1. Render with `runName`, `verifierImage`, and `inputDigest`. A unique run
   name renders the Job. Create it and capture the server-assigned UID.
2. Render with the same values plus `jobUID` and
   `--set-file reviewedBundle=<reviewed.json>`. This renders the immutable
   ConfigMap with a Job owner reference. The Pod waits for that ConfigMap.
3. Read the result only from the successful verifier in the expected owned
   Pod. Check the input digest and preserve the result before deleting the Job
   with a UID precondition. Confirm absence of the Job, Pod and ConfigMap.
   The Job deadline and TTL bound abandoned runs.

The chart has no Service, credential, controller, or installation hook.
It encodes memory-backed storage and restricted process settings. The
effective Pod PID ceiling, mount flags, scheduling and interruption behavior
need live evidence on both targets before this can be wired into `pnpm verify`.

## Argo draft

Render with `workflow=true`, the reviewed values and bundle, and the
approved `workflowServiceAccount`. The chart renders one Workflow. It creates
the same Job, stages the immutable ConfigMap using the returned Job UID,
and observes that Job. The Workflow owns the Job and exposes its UID.
The caller still reads the owned verifier Pod's termination message and
checks cleanup. Deleting the exact Workflow cascades to the Job and
ConfigMap. Keep the same target and namespace checks as the native draft.

An installed, pinned Argo Workflows controller and an executor identity
are prerequisites. The identity needs the controller-version-appropriate
executor result permissions and only the Job and ConfigMap operations
used here, within the qualification namespace. The registry and verifier
Pod continues to run tokenless. Workflow expiry and Job expiry are
independent, so collect evidence before either TTL can remove it.
