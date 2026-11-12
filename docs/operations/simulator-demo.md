# Owned simulator demo metadata

SIM-PR4 adds a foreground metadata seeder. It does not start Compose, bootstrap
an operator, run a simulator or reset a database. SIM-PR6 owns that lifecycle;
SIM-PR7 owns simulator-to-map/Inspect acceptance. Normal OIDC startup is unchanged.

## Prerequisites and commands

Use the pinned Linux Node/pnpm tools. First initialize the explicit synthetic identity
as described in [local installation](local-installation.md#opt-in-local-synthetic-demo-identity).
Obtain the componentized Teltonika artifact from the reviewed backend producer;
keep it in an owned regular file. Initialization records its exact SHA-256 and
size and refuses a different artifact on subsequent runs.

```bash
node local/demo/seed.mjs init simulator-demo /absolute/path/to/teltonika.wasm
node local/demo/seed.mjs reconcile simulator-demo /absolute/path/to/teltonika.wasm
```

Before `reconcile`, the owner must provide a reachable installation at the exact
canonical demo browser origin, backend trust/network access to the same canonical
issuer, host DNS, reviewed public-CA trust for Node **and Chromium**, and the
Playwright Chromium runtime. These commands never install trust or bypass TLS.
The Compose/network wiring is a later slice, not supplied by the seeder.

Run the existing explicit `pnpm local bootstrap <instance>` procedure with private
`bootstrap.json`: use the journal's generated `actorId`, the identity's retained
synthetic subject, and the authority configured for this issuer in the instance.
Keep that file and all values private. See the existing bootstrap runbook; do not
put subjects, secrets or device identities in argv. The seeder signs in afresh
through the real browser login/consent flow, verifies the authenticated actor,
and uses same-origin cookies, Origin and CSRF. It has no SQL or bearer fallback.
A fresh browser context is closed after each run; successful runs explicitly log
out. An issuer restart requires reauthentication, not a provisioning reset.

## Ownership, interruption and drift

The identity directory contains a private `seed/` directory (0700) and
`journal.json` (0600). The journal retains a random owner nonce, namespaced tenant
and asset IDs, private synthetic device identities, identity/artifact fingerprints,
a digest of every deterministic request intent, pending markers and original
receipt digests. No global synthetic identity reservation or hardware support is
claimed. The CLI creates one device/asset pair; qualification covers two pairs.

Initialization never adopts an existing seed directory with a missing, malformed,
linked, permissive or incompatible journal. Request intents are flushed before
remote mutation. Each checkpoint is flushed and atomically renamed, including a
directory flush. After uncertain responses or process termination, rerun the same
`reconcile` command. Identical server commands preserve original attribution,
timestamps, bindings and route revision. Concurrent foreground seeders are not a
supported workflow; run one owner at a time.

Every run rereads retained remote facts and replays only exact idempotent commands.
Admission POST is the platform's repeatable current-policy recheck. Definition
publication exposes only an outcome; its immutable retry contract preserves the
server's original audit evidence, which this API does not return to the seeder. Foreign
resources without a pending owned intent, changed definitions or identifiers,
revoked permissions, later binding/route revisions, changed signing identity,
artifact or request plan fail closed. No reset, overwrite, automatic correction,
journal migration or deletion command is provided. Resolve drift with the owner;
never delete the database or journal to conceal a failed reconciliation.

Only fixed completion/failure categories are printed. Never share the journal,
identity file, synthetic IMEIs, keys, cookies, codes, provider subject or artifact
bytes in Git, logs or CI evidence. Export only public CA material for trust review.

## Verification

`node --test tools/tests/demo-seed.test.mjs` covers exact receipts/revisions,
interruption before/after every mutation, real SIGKILL recovery, ownership/drift
rejection, incompatible private state and the browser-origin boundary.

`pnpm check`, `pnpm qualify` and `pnpm qualify:product` remain canonical. The product
gate requires `owned-demo-metadata-reconciliation`: real authenticated API writes,
lost committed route-response recovery, unchanged replay receipts, two distinct
routes/binding pairs, cross-tenant denial and refusal to undo an operator revision.
The fixture's existing device sender remains independent. Private scratch journals
and owned product resources are cleaned up; public evidence contains only the
fixed check identifier. Hardware issue #59 remains separate and physical not-run.
