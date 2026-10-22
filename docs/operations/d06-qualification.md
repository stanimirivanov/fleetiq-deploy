# D06 persistent installation qualification preparation

## TL;DR

This is an execution checklist for a proposed retained FleetIQ target, not a
live-installation receipt or permission to create it. Four native provider
previews passed on 2026-10-22 with `execution: not-performed`. OIDC configuration
is deferred at the operator's request. The canonical UI publication and complete
independent release-artifact verification passed on 2026-10-22; see the readiness
record for exact selections and evidence. Exact-target live admission and
installation remain pending; earlier old-name reports remain historical.

## Selected source and evidence

Use the [readiness record](d06-readiness.md) for producer revisions, actual
publication outcomes and independent verification. Preserve the selected backend
and charts rather than rebuilding them to advance the release record.

The provider is `stanimirivanov/k8s-infrastructure` at
`41c558a54bc923fa69d7afc42bc663b763c3add5`. Its local working checkout was on a
different revision; this rehearsal used a separate exact-source export. The
SHA-256 of the complete `git archive --format=tar` source bytes is
`95de6cf55807579b5f3e1f6e31ce1da4e12ca7ccc1063db7d523b5223fadc926`.
This defines the infrastructure input digest; it is not a cluster health receipt.

The tool input is the exact published deployment source's
`tools/manifests/tools.lock.json`, SHA-256
`2089517fe740fdc182243e857b453f00a45825f7b4f4e3eb866d01775269f3ff`.
Use `workflowTemplate: null` for guided D06 execution: D08 has not delivered an
approved consumer release WorkflowTemplate. No placeholder template is installed.

## Proposed target and ownership

| Input | Proposed selection / required proof |
| --- | --- |
| Consumer / cluster / Kubernetes context | `fleetiq` / `fleetiq-local` / `kind-fleetiq-local`; prove absence or exact original ownership before mutation. |
| Docker / profile | `desktop-linux` / `isolated-network-local`; no existing Perfeng cluster is used. |
| Private state | Proposed `%LOCALAPPDATA%/k8s-infrastructure/fleetiq-d06`; require an ordinary dedicated directory and private ACL review. The rehearsal instead used an empty ignored preparation directory. |
| HTTPS | `127.0.0.1:18443` to node listener `8443`, hostname `fleet.local.test`; check availability and name resolution. No automatic hosts-file or host trust-store edit. |
| Application / database / release namespaces | `fleetiq-apps`, `fleetiq-data`, `fleetiq-releases`, consumer-owned with exact provider labels. |
| Provider namespaces | `fleetiq-gitops-system`, `fleetiq-workflow-system`, and provider-owned network/database/controller namespaces. |
| Database | `fleetiq-db`, one instance, `local-retained`, 2Gi; provider admission allows 8Gi/four claims with replacement headroom. PVC size does not impose a physical disk quota. |
| Identity | Deferred: trusted HTTPS issuer, public client ID, authority, confidential Secret reference, actual issuer egress CIDRs and optional public CA still required. |
| Lifecycle | Retain state and data on stop/failure. No disposable qualification removal or automatic cluster destruction. |

The database image selected by the qualified provider inventory is
`ghcr.io/cloudnative-pg/postgresql:18.4-system-trixie@sha256:42708a75345b7a48fdd9257b071830783a97fd228529196b6313187a7198e185`.
Its live availability must still be checked at execution; the synthetic digest
in the offline chart fixture is not an installation input.

The public delegation rehearsal selects workload namespaces `fleetiq-apps` and
`fleetiq-data`, with `databaseNamespaces: [fleetiq-data]`. It reserves approved
template name `fleetiq-release-v1` for future D08; reserving a name creates no
WorkflowTemplate or release authority. Native delegation fingerprint:
`40700ac8e3c0990041e7b63a792b7d65a951ac724a7e91df146daa523b3275c8`.
Review this initial delegation before installation because later authority changes
require an explicit transition, not relabeling or forced adoption.

## Capacity review before authorization

The profile caps each of two nodes at 2 CPUs/4Gi after bootstrap, for 4 CPUs/8Gi
total, with 2048 PIDs per node and no swap. Bootstrap is temporarily uncapped.
The engine requires at least 4 CPUs/12Gi; that minimum does not prove free host
capacity or isolation from Perfeng benchmarks.

| Group | Pods | CPU requests | Memory requests |
| --- | ---: | ---: | ---: |
| Cilium / Envoy / operator | 5 | 350m | 768Mi |
| Argo CD / Workflows | 9 | 450m | 576Mi |
| Database / certificate controllers | 5 | 300m | 448Mi |
| Backend / edge / one database | 3 | 400m | 384Mi |
| Subtotal | 22 | 1500m | 2176Mi |

This subtotal excludes kind system components, init containers, migrations,
qualification probes and rollout overlap. Requests alone do not establish safe
capacity: Argo controller limits total 4500m/3456Mi, and database/application
limits add further pressure. Inspect actual per-node placement, aggregate limits,
startup headroom, free memory and disk before requesting execution. No larger
profile or resource limit change is implicitly authorized.

## Ordered execution and acceptance

1. Verify all producer publications, exact release BOM bytes, migration inventory
   and source/tool inputs. Preserve evidence beyond the UX seven-day retention.
2. Complete identity, private Secret references, CA handling and bounded issuer
   egress; validate configuration without logging secrets. Do not use disabled
   identity, plaintext HTTP or a synthetic issuer as successful product startup.
3. Implement and verify the registered Argo source-graph boundary against protected
   `environments/<environment>/active` refs. Main/candidate tracking and revision
   overrides must fail. The existing no-Argo-graph guard remains until this works.
4. Generate final provider previews for the exact durable state path, delegation,
   capacity and ports. Obtain explicit authorization for that named live target.
5. Prove absent-target ownership, establish cluster/network capability, then
   bootstrap exactly the consumer-owned namespaces. Install database capability
   and its namespace quota/admission before granting delegated Argo database rights.
6. Observe dedicated kubeconfig/context and cluster incarnation. Keep bootstrap
   administrator, application reconciler and release authority separate. Verify
   provider health, protected Git authority and exact desired sources before
   creating consumer AppProjects/Applications.
7. Provision private credentials and trust, execute explicit initial migrations
   with the migrator role, and start normal backend/edge workloads. Prove runtime
   readiness performs no DDL and the runtime database role cannot migrate.
8. Verify trusted HTTPS, SPA deep links, same-origin private API and normal OIDC;
   reject wrong hosts, untrusted certificates and missing identity. Keep database
   and backend Services private.
9. Exercise real permitted and forbidden traffic, DNS, issuer egress and
   cross-consumer denial. A rendered NetworkPolicy is not traffic evidence.
10. Seed real application data, replace only the owned database Pod, and prove
    persistence. Check retained-storage protection without deleting this target.
11. Reject wrong owner/context, stale incarnation, foreign resources and incomplete
    receipts. Record actual source/target-bound outcomes and retained evidence.

The four new reports under ignored
`target/d06-preparation/persistent-preview/` cover cluster, networking, database
and delegated Argo **offline** input composition. Database admission includes
`fleetiq-data`, unlike the earlier rehearsal. No cluster, kubeconfig, Secret,
private ownership journal, live listener or namespace was queried or changed.
The rehearsal is not a final durable-target preview or live installation.

D06 remains incomplete until these gates pass. D07 owns external backup/restore,
D08 owns release workflow execution, D10 owns full real-provider browser journeys,
and M08 owns production acceptance. Retain storage does not protect against kind
node or host loss.
