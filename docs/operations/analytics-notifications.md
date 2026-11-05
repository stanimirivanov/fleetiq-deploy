# Analytics workers and notification routing

## TL;DR

M05-PR16 packages opt-in analytics-worker and notification-worker plus a private,
single-instance Alertmanager. Defaults start none of them. Migrate and qualify
producer artifacts before enabling. An HTTP-ready backend is not worker health,
and HTTP acceptance is not receiver delivery. The [installed product gate](installed-product-qualification.md) exercises the
complete path with a separate synthetic receiver. Normal Compose can opt into the
same pipeline workers, but a disposable receipt is not persistent installation
acceptance or live Kubernetes qualification.

## Artifact and configuration review

The local source lock selects merged platform baseline.28 and the merged Operations
UI. Rebuild both artifacts after a pin change. Stop old server and worker processes
before migration 0051, then start compatible checked-schema binaries. Recovery
separates the attempt budget from the monotonic generation fence.

The official `prom/alertmanager:v0.34.2` image index is pinned in the artifact lock
and chart schema. Its digest was resolved from the official Docker Hub manifest
API and independently matched to the manifest bytes. Alertmanager is Apache-2.0;
no npm dependency, controller or CRD is introduced. References:
[release](https://github.com/prometheus/alertmanager/releases/tag/v0.34.2),
[configuration](https://prometheus.io/docs/alerting/latest/configuration/).

## Normal Compose inputs and activation

Complete the [normal installation](local-installation.md), build the selected
sources, and migrate through 0051 before starting these checked-schema workers.
Provision `.local/instances/development/alertmanager.yml` privately as an owned
regular file, at most 64 KiB. Keep its parent mode 0700; the mounted file must be
readable by container UID 10001. This command checks file metadata and never reads
or prints its private contents. Supply operator-reviewed routes and receiver
credentials inside that mounted file, never tracked settings or argv. Use TLS,
disable HTTP redirects, set send_resolved, and group by tenant/rule/revision/episode.
Never use the synthetic fixture as a real customer route.

Select the smallest required composition:

| Command | Optional processes added to the base installation |
| --- | --- |
| `pnpm local analytics-up development` | Analytics, notification and private router only |
| `pnpm local pipeline-up development` | TCP ingestion, replay, semantic processing and current-state projection |
| `pnpm local pipeline-analytics-up development` | Both groups: complete device-to-alert delivery path |

For the complete path, prepare the private `pipeline.json` described in
[device pipeline inputs](local-installation.md#opt-in-device-pipeline). Its closed
fields are identityPolicy, port, tenantId, channelId, packageId and packageVersion.
Use registered-identifiers and a free loopback TCP port. Identifiers select a
registered route; they do not authenticate a physical device. Do not forward the
listener publicly as part of this local development recipe.

Activate in this order:

1. Prepare/build the exact locked sources; finish real HTTPS OIDC and operator
   bootstrap using the normal installation guide. Stop old processes before the
   schema update and verify the selected backend's migration requirements. Workers
   start only after backend readiness; this dependency does not prove progress.
2. Through the backend's supported administration interfaces, provision the tenant,
   independent operator grants, device/assets and property definitions. Register
   the protocol artifact, admit its worlds, activate its device/channel route and
   configure the exact semantic bindings before sending records.
3. Install the reviewed calculator release and activate its configuration and alert
   rule. Grant alert read/manage/acknowledge and Operations read/manage separately
   where needed. Packaging does not create these domain records or permissions.
4. Provision the private router file and review receiver TLS, routing and egress.
   Use the combined command below. If an existing instance uses a different
   overlay, run down first; it retains the database and CA volumes.

```bash
pnpm local down development
pnpm local pipeline-analytics-up development
```

The combined recipe uses `local/pipeline/compose.yaml` and
`local/analytics/compose.yaml` with the base installation. It starts the six
application workers plus Alertmanager without adding a new default startup mode.
Do not replace the combined command with sequential pipeline-up and analytics-up:
the selected complete recipe must remain available for owned lifecycle commands.

The optional overlay uses the same verified backend image for both processes,
mounts only the database password, and supplies no OIDC or customer destination to
workers. Neither worker joins the browser/provider network. Notification delivery
can reach only the internal router network plus the private database network.
Alertmanager has no host port and does not join either application or database
networks. It alone joins a receiver-egress bridge. Docker bridge isolation does
**not** implement a per-destination firewall: qualify host egress policy separately.
Kubernetes packages provide explicit destination restrictions.

Verify the normal instance with real observations: require durable TCP acceptance,
then the expected property/history/provenance in the inspector, calculator evidence,
one logical firing transition and receiver delivery. Inspect Operations for blocked,
failed or exhausted work. Backend readiness, process startup, an empty queue and
router HTTP acceptance each leave different parts of that path unproved. Review
an exact failed position and its fence before authorized recovery; do not reset
work state or retry blindly. A later resolved delivery must retain the episode.

Pause each group explicitly:

```bash
pnpm local pipeline-stop development
pnpm local analytics-stop development
```

Pipeline stop pauses ingestion, replay, semantic and projection processes;
analytics stop pauses the two analytics/notification workers and router. Neither
stops the base backend/database. To resume both, use pipeline-analytics-up.
To disable the optional recipe and return to defaults:

```bash
pnpm local down development
pnpm local up development
```

Do not overwrite an optional recipe through ordinary up/restart. Database, accepted
messages, checkpoints and immutable outbox stay retained; stopping is not draining
or proof that all in-flight receiver deliveries have ended.

Alertmanager's bounded writable cache is ephemeral in both packages;
restart may repeat receiver notifications. This is a non-HA package, not durable
router history. FleetIQ's PostgreSQL work state and refresh/reconciliation remain
the authority. Changes to destinations/retries follow the producer runbook.

## Kubernetes package inputs

Set analytics.enabled=true and analytics.alertmanager.configurationSecret to an
existing namespace-local Secret. Its alertmanager.yml key contains the reviewed
routing configuration; other keys may provide credentials referenced by file under
/etc/alertmanager. The package creates no Secret and never renders its contents.
Set receiverCidrs to explicitly reviewed IPv4 /16–/32 ranges; only TCP/443 is allowed
in addition to scoped DNS. The configured receiver must use HTTPS on that port;
CNI enforcement, actual DNS/translated addresses and TLS must be qualified live.

Use the same reviewed digest-addressed backend image with PR15 support. Enable the
data chart's network.analyticsEnabled alongside runtime analytics.enabled; this
adds database ingress only for the two worker identities in the selected namespace.
The offline fixture selects both together. Database credentials and public CA are
existing references; provision producer-required DML grants without DDL or owner
credentials. Maintenance scales all packaged workers/router to zero. Disable both
settings to remove these stateless workloads while retaining PostgreSQL/outbox.

Workers have no producer health endpoint: Kubernetes container readiness means
process started, not checked schema, queue progress or router/receiver reachability.
No backend HTTP probe is reused and no process-existence probe claims semantic
health. Alertmanager has its own /-/ready and /-/healthy probes. Qualify progress,
exhaustion, router outage and capacity separately. Operations diagnostics and
reviewed recovery are shipped, but sampled work evidence is not worker liveness.

## Verification and limitations

Run pnpm check for real Helm/Kustomize/local-schema and safety rejection checks.
After pnpm local build, pnpm qualify additionally runs the real pinned router with
a synthetic-only receiver on an internal, unpublished network. The installation
fixture separately starts/restarts the packaged workers against the migrated
database, checks crash-loop/private-port restrictions and retains no customer route. That fixture tests
firing/resolved notification, an unreachable router, restart, and owner-checked
cleanup. It creates no customer route and retains only bounded boolean evidence.
The separate product gate qualifies the disposable telemetry-to-alert path using
worker definitions shared with normal Compose. It does not exercise a retained
operator instance with that instance's provider, grants, devices or receivers.

| Topology / gate | Evidence and remaining boundary |
| --- | --- |
| Normal Compose | Opt-in four-stage device pipeline and combined analytics recipe; inspect actual instance progress and receiver delivery independently |
| `pnpm qualify` | Real base installation, loopback TCP/replay restart, packaged analytics worker restart and independent real-router/synthetic-receiver checks; infrastructure identity mode is unconfigured |
| `pnpm qualify:product` | Disposable HTTPS/OIDC, TCP, browser, shared workers, alert/recovery and synthetic receiver; published UX edge, not the legacy infrastructure adapter |
| `pnpm check` | Structural tests, offline native manifests, secrets and advisories; no live cluster or receiver evidence |
| Persistent D06 / nonlocal Kubernetes | Still requires target-specific identity, networking, storage, lifecycle and product qualification |

Merged [F-PR4 #42](https://github.com/stanimirivanov/fleetiq-deploy/pull/42)
records the complete normal Compose pipeline and passed installation/product gates.
Merged [F-PR6 #44](https://github.com/stanimirivanov/fleetiq-deploy/pull/44)
records the published-edge admission and login-burst check in disposable Compose.
Neither proves Helm ingestion/projection parity or live Gateway enforcement.
See the [completed PR16 plan](../exec-plans/completed/m05-analytics-packaging.md)
for historical receipt references and the initial qualification gap.
A missing Docker daemon/socket permission is incomplete qualification, never a pass.
