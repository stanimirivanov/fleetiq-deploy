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
