# M05-PR16: optional analytics and notification packaging

## TL;DR

Status: completed for packaging and disposable qualification. Issue #35 was delivered
by [PR #36](https://github.com/stanimirivanov/fleetiq-deploy/pull/36). The initial
Docker gap was resolved by later passed receipts; persistent D06 and live Kubernetes
acceptance remain separate. F-PR12 reconciles this record without changing runtime.

## Scope and producer dependency

- Disabled-default analytics-worker/notification-worker and a private router.
- Explicit source/image pins, mounted secrets and distinct process-health claims.
- Closed Helm schemas, native rendering, maintenance and scoped networking.
- Isolated real-router/synthetic-receiver qualification within pnpm qualify.
- Migration order, non-DDL grants, ephemeral router cache and retained outbox.

The original producer dependency, platform [PR #378](https://github.com/stanimirivanov/fleetiq-platform/pull/378),
merged as 2d2bed6307a92b8d3cc3f80348ed399fca1a73c6. The deployment lock later
advanced to platform baseline.28 at 47b8016b4df08b7b7920ddbc2932f8ae12d11282,
including migration 0051 and reviewed recovery fences. Rebuild after changing pins;
this record does not select or promote new artifacts.

## Acceptance evidence reviewed for completion

PR #36 originally reported structural/native-manifest passes but Docker socket
permission failure. That incomplete trial remains a failure, not a retrospective
pass. The following ignored local receipts were inspected during reconciliation:

| Receipt | Observed outcome / scope |
| --- | --- |
| .verification/structural-871fafeb-7af8-41b8-979e-ffe58185f60c.json | Passed all structural checks on PR16 merge 1286a177019861c17d7cc3123830afe4b2577cc7 |
| .verification/docker-f0618a3c-88da-47fd-b0d2-90e167ff90a2.json | Passed installation, checked-schema packaged worker startup/restart, private router, firing/resolved, outage/restart and owned cleanup |
| .verification/product-c3084dd4-6a1a-4079-b680-6700bdbeaeaf.json | PR20 disposable product run passed the then-required 20 assertions and owned cleanup |
| .verification/docker-ea51d60a-350c-49e0-b0f1-ae111ad209de.json | Later pipeline installation/routing run passed, including loopback TCP acceptance and durable replay after restart |
| .verification/product-9d238197-b0e4-47e9-8d4a-014a196ae867.json | F-PR6 product candidate passed 21 checks including published-edge admission and owned cleanup |

Receipt head alone is not candidate identity: receipts also record source
fingerprints, and later candidate runs can contain uncommitted implementation.
These are historical observations, not reruns or qualification of F-PR12's commit.
The completed [PR20 record](m05-installed-analytics.md) and merged
[F-PR4 #42](https://github.com/stanimirivanov/fleetiq-deploy/pull/42) /
[F-PR6 #44](https://github.com/stanimirivanov/fleetiq-deploy/pull/44) record delivery
and verification boundaries. The F-PR6 PR also records an earlier later-stage
analytics-resolution failure before its successful unchanged retry.

The F-PR6 passed product receipt selects platform 47b8016b4df08b7b7920ddbc2932f8ae12d11282
and published UI source 7d249a5d635ca5a8e575df8c19406cf3c277c660. Its worker definitions
are local/pipeline/compose.yaml and local/analytics/compose.yaml. Normal Compose
uses those definitions, while the product fixture supplies disposable identities,
internal TCP routing, synthetic map resources and a synthetic receiver.

## Completion limits and operating handoff

Use the [analytics runbook](../../operations/analytics-notifications.md) for private
inputs, activation, observation and disable steps. Defaults remain opt-in. Stop
old processes before incompatible migrations; never downgrade SQL or delete
volumes to reverse packaging. PostgreSQL work/outbox persists; router cache does not.

No customer destination, live Kubernetes apply, persistent D06 activation, hardware,
load, production HA or image-security attestation is claimed. The infrastructure
fixture and published-edge product fixture are separate topologies. Helm still
lacks the complete normal Compose device pipeline; chart policy checks do not
prove live provider behavior. These limits do not keep the delivered PR16 packaging
plan active indefinitely.
