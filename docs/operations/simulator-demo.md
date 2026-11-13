# Owned simulator demo metadata

## TL;DR

SIM-PR6 adds the explicit one-device lifecycle below. Startup provisions through
real browser OIDC before starting the pipeline and the pinned simulator. Ordinary
shutdown retains state; reset deletes only the positively identified demo. This
is a synthetic local demo. `pnpm qualify:simulator` qualifies map/Inspect against this lifecycle; hardware
issue #59 remains separate and physical not-run.

## One-device lifecycle

Run `pnpm local build` first. Keep the reviewed componentized Teltonika artifact
outside the checkout in a regular file owned by your nonroot user, mode 0600.
Initialization records its exact content and the published simulator pin:

```bash
pnpm local demo-init simulator-demo /absolute/private/path/teltonika.wasm
```

Before startup, map `fleet.fleetiq.test` and `issuer.fleetiq.test` to 127.0.0.1.
Review the generated **public** `.local/demo-identities/simulator-demo/ca.crt` and
explicitly trust that CA in Node and Chromium, following the identity runbook.
No demo command edits host DNS or installs trust. Then run:

```bash
NODE_EXTRA_CA_CERTS=.local/demo-identities/simulator-demo/ca.crt pnpm local demo-up simulator-demo
pnpm local demo-down simulator-demo
NODE_EXTRA_CA_CERTS=.local/demo-identities/simulator-demo/ca.crt pnpm local demo-up simulator-demo
pnpm local demo-reset simulator-demo --confirm-owned-instance simulator-demo
```

Use these commands for the demo instance. The issuer and browser ports are fixed
loopback 59443 and 58443; the ingestion listener has no host port. The simulator
joins only the private ingress network, sends one retained Codec 8 record with a
bounded retry budget, and exits only after the exact ACK. A CLI ACK is not a map
or projection acceptance claim. The separate simulator qualification proves those
outcomes. Backend/database ports remain private.

`demo-up` verifies owner/context/daemon, exact retained inputs and source/image
provenance, waits for issuer/backend/edge health, idempotently bootstraps the
retained synthetic operator and reconciles metadata through real browser auth.
Only then does it start the pipeline, wait for TCP health and run the simulator.
A provisioning/readiness failure cannot fall through to a send. DNS/CA/browser
prerequisites remain explicit; failure retains owned state for review/retry.

`demo-down` removes containers/networks and preserves database/certificate volumes,
issuer keys, device identity, source timestamp, inputs and journal. Every startup
reauthenticates. `demo-reset` is destructive: it checks the retained recipe,
context/daemon, owner nonce and every resource label before removing this demo's
volumes and private directories. Foreign ownership refuses before deletion;
unrelated resources survive. Interrupted initialization is not silently adopted.

Private inputs/journals are 0600 within 0700 directories. Delegated edge TLS files
are readable only through explicit mounts from a private 0700 parent, as with
normal Compose secrets. The CA signing key stays in the original host identity
directory; the issuer gets only its runtime keys/certificates. Never share private
state, generated identifiers, cookies or key material. Share only sanitized gate
receipts and reviewed public CA material.

The canonical Docker gate now requires `demo-lifecycle`: real producer ACK,
foreign-owner/context rejection, authenticated repeat provisioning, nondestructive
restart, owned reset and retention of unrelated canary resources. Its browser
trust exists only in a disposable qualification container; it does not satisfy
operator host/browser trust prerequisites. The standalone seeder below remains
available for focused metadata maintenance.

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
These standalone commands use the owned lifecycle above; they do not start Compose themselves.

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
artifact or request plan fail closed. The standalone seeder provides no reset, overwrite or automatic journal migration.
The explicit `demo-reset` command above owns whole-installation reset. Resolve drift with the owner;
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


## Simulator device-to-map acceptance

Run `pnpm qualify:simulator` after `pnpm local build`. The gate uses the actual
pinned simulator and normal Compose UI through real synthetic OIDC. It polls for
the sealed record's exact latitude/longitude, device timestamp, binding, package
and message provenance; selects its rendered geographic point and follows the
coordinate's Inspect link. Sample mode, missing output and substituted/stale
attribution cannot satisfy acceptance. The existing product gate remains separate.

The opt-in demo mounts the deployment's existing synthetic raster grid read-only
at `/srv/maps`. It is a local basemap background, not invented telemetry or
navigation data. No external map provider is contacted. Earlier demo instances
retain their original sealed Compose recipe: stop/reset them using their owned
lifecycle, then initialize a fresh instance to adopt the new map mount. There is
no silent recipe migration or deletion of retained data.

An unregistered synthetic identity must be refused before acceptance. The pinned
platform closes unknown-claim sessions; an explicit refusal byte is also
recognized. Timeouts cannot count as rejection. The gate
then rechecks exact history and unchanged accepted-message storage before the
existing lifecycle proves restart, owned reset and unrelated-resource retention.
Only fixed check IDs, immutable artifact/source identities and cleanup status
enter `.verification/simulator-*.json`. Private IDs, records, keys, cookies,
screenshots and raw browser/process diagnostics remain private and are removed
with test-owned scratch state. The Inspect browser receives only the expected
evidence and public CA; a runtime guard rejects seeder journal/WASM mounts. Browser CA trust is confined to disposable state;
operator host DNS/trust prerequisites are unchanged.
