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

## Explicit unqualified development reload

SIM-PR20 adds developer mode; its success never qualifies a reviewed release.
First start the normal owned demo above. Keep the same explicit host DNS and
public-CA trust prerequisites. Development source clones are independent of both
sibling checkouts and `.local/sources`, which remains reviewed-build authority.

Prepare source objects with `pnpm development:sources` (source-read credentials,
if required, belong only to this network-only command). Create **fresh** clones:

```bash
mkdir -p .local/dev-sources
git clone .local/dev-objects/ui.git .local/dev-sources/ui
git -C .local/dev-sources/ui remote set-url origin https://github.com/stanimirivanov/fleetiq-ui.git
git clone .local/dev-objects/platform.git .local/dev-sources/platform
git -C .local/dev-sources/platform remote set-url origin https://github.com/stanimirivanov/fleetiq-platform.git
chmod 700 .local/dev-sources/ui .local/dev-sources/platform
pnpm --dir .local/dev-sources/ui install --frozen-lockfile
pnpm local demo-dev-up simulator-demo
```

Select a revision descending from UI b2169ee30bc516cb5bdb79f4506a7a51970db0af
and the locked platform revision, respectively. Source acquisition never checks
out or resets an existing developer tree. Stage new files explicitly; ordinary
tracked edits remain dirty and are fingerprinted. Foreign origins, path links,
private environment/key inputs and unexpected ignored files are refused. Keep
credentials and captures outside these clones; only dependency/build directories
are accepted as ignored UI inputs. Install Linux dependencies using the pinned
Node/pnpm versions; the container does not install packages or inherit host tokens.

Edit `.local/dev-sources/ui/apps/web/src` and use the existing trusted
`https://fleet.fleetiq.test:58443` browser origin. UI/HMR go to private Vite;
API/auth/SSE and map fixtures retain their normal edge handlers. No Vite, backend
or database host port is published. Vite has no TLS/client secrets, Docker socket
or database network. Bind-mounted source watching uses 100 ms polling inside the
existing 2 CPU / 1 GiB service budget, trading extra development CPU for reliable
host edits ([Vite watch guidance](https://v8.vite.dev/config/server-options#server-watch)).
Explicit sample previews are rejected in this mode.

For a deliberate backend replacement and return to reviewed mode:

```bash
pnpm local demo-rebuild-backend simulator-demo
pnpm local demo-reviewed simulator-demo
```

Backend source is snapshotted from tracked files. A failed build/admission cannot
stop or partially replace current consumers. The new image contains the server
and admission/decode/live executors, and all pipeline processes use that exact
image. Changed migration inventories are refused; development startup uses
`serve --check-schema`. No migration or provisioning command is run by the dev
controller. Database, identity and producer queue mounts are retained.

The controller writes a private recovery recipe before stopping processes. On a
failed startup retain that state, correct the source/runtime problem and use
`demo-reviewed` for rollback before attempting another development command.
Pending and ready states are persisted explicitly; an interrupted transition
permits only reviewed recovery. Rollback reconstructs the owned reviewed recipe,
so an interrupted development recipe/marker update or abandoned draft cannot
strand the instance. Run lifecycle commands serially for each owned instance.
Normal demo startup/reset refuses active development
state; ordinary down retains it. The reviewed recipe and `.local/images.json`
are never replaced. A development-marked image cannot pass reviewed inventory
admission even with otherwise matching revision/packaging labels.

`pnpm qualify:development` is the separate Linux/Docker smoke after source-object
preparation and the normal reviewed-image build. It requires absent developer
clones, creates positively identified disposable clones, runs trusted Chromium
with an ephemeral CA profile, verifies a real edit, pending-queue recovery and
reviewed-mode restoration, and cleans only its owned resources. It never installs
host trust or accepts development output as product/release acceptance. Run
`pnpm check`, `pnpm qualify`, `pnpm qualify:product` and `pnpm qualify:simulator`
separately against reviewed artifacts.

UI source scanning uses the UI-owned detector policy already approved at its
reviewed base (including its exact public storage-identifier classification).
Scanner/tooling and package-control edits are refused until that development
base is reviewed again. The installed smoke proves that a new credential in the
same file is still rejected. Platform checks run the immutable upstream Rust
wrapper in an unqualified tool image; it preserves the platform's exact public
signing-fixture classification. That image builds only the reviewed source, then
scans candidate files/index/incoming history with no network, a read-only source
mount and the pinned detector. Host `target` tools are masked by tmpfs (an empty
`target` mountpoint is created if absent). A real credential in the signing-fixture
file must fail even with a forged local detector. Deployment policy has no new
exception. The tool image installs Git from the pinned Debian base's repositories;
it is local verification tooling, never a reviewed application artifact.

## Installed fault and fleet qualification

Run `pnpm qualify:simulator` against the reviewed producer image after building
the locked product artifacts. Its disposable installation registers two synthetic
devices for fault/fleet isolation; these fixtures do not change the normal
one-device lifecycle above. It exercises explicit malformed-frame denials,
concurrent product-profile producers, bounded reconnect traffic and queue overflow,
then verifies authenticated history/Inspect and terminal ingestion diagnostics.
See the [declared workload/resource envelope](../development/verification.md#installed-simulator-fault-envelope).
Missing producer capabilities, observed private fields, over-budget metrics or
incomplete owned cleanup fail qualification; no physical-device outcome is implied.
