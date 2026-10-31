# Analytics workers and notification routing

## TL;DR

M05-PR16 packages opt-in analytics-worker and notification-worker plus a private,
single-instance Alertmanager. Defaults start none of them. Migrate and qualify
producer artifacts before enabling. An HTTP-ready backend is not worker health,
and HTTP acceptance is not receiver delivery. Installed product qualification is
PR20; this slice supplies a separate synthetic router fixture.

## Artifact and configuration review

The local platform source pin is the exact PR15 producer commit
`e53c1fd8d6c5711acb7e918bdbad790c0d3a752f` (platform PR 378, still open when selected).
Do not promote this consumer before that dependency is reviewed and published.
Rebuild after a source-pin change; existing image provenance is invalidated.
The official `prom/alertmanager:v0.34.2` image index is pinned in the artifact lock
and chart schema. Its digest was resolved from the official Docker Hub manifest
API and independently matched to the manifest bytes. Alertmanager is Apache-2.0;
no npm dependency, controller or CRD is introduced. References:
[release](https://github.com/prometheus/alertmanager/releases/tag/v0.34.2),
[configuration](https://prometheus.io/docs/alerting/latest/configuration/).

## Local opt-in

Complete the [normal installation](local-installation.md), build the selected
sources, and migrate through 0049 before starting these checked-schema workers.
Provision `.local/instances/development/alertmanager.yml` privately as an owned
regular file, at most 64 KiB. Keep its parent mode 0700; the mounted file must be
readable by container UID 10001. This command checks file metadata and never reads
or prints its private contents. Supply operator-reviewed routes and receiver
credentials inside that mounted file, never tracked settings or argv. Use TLS,
disable HTTP redirects, set send_resolved, and group by tenant/rule/revision/episode.
Never use the synthetic fixture as a real customer route.

```bash
pnpm local analytics-up development
pnpm local analytics-stop development
```

The optional overlay uses the same verified backend image for both processes,
mounts only the database password, and supplies no OIDC or customer destination to
workers. Neither worker joins the browser/provider network. Notification delivery
can reach only the internal router network plus the private database network.
Alertmanager has no host port and does not join either application or database
networks. It alone joins a receiver-egress bridge. Docker bridge isolation does
**not** implement a per-destination firewall: qualify host egress policy separately.
Kubernetes packages provide explicit destination restrictions.

Stop pauses only the three optional services. Resume using analytics-up. To return
to defaults, run local down (without volume removal), then local up; do not overwrite
an analytics recipe through ordinary up/restart. Database and immutable outbox stay
retained. Alertmanager's bounded writable cache is ephemeral in both packages;
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
exhaustion, router outage and capacity separately; diagnostics arrive in PR17.

## Verification and limitations

Run pnpm check for real Helm/Kustomize/local-schema and safety rejection checks.
After pnpm local build, pnpm qualify additionally runs the real pinned router with
a synthetic-only receiver on an internal, unpublished network. The installation
fixture separately starts/restarts the packaged workers against the migrated
database, checks crash-loop/private-port restrictions and retains no customer route. That fixture tests
firing/resolved notification, an unreachable router, restart, and owner-checked
cleanup. It creates no customer route and retains only bounded boolean evidence.
It does not replace the installed telemetry-to-alert path planned for PR20.
A missing Docker daemon/socket permission is incomplete qualification, never a pass.
