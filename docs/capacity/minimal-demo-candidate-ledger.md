# Minimal-demo resource ledger — approved design, unqualified

## TL;DR

This is an owner-approved planning allocation, not measured demand or an implemented profile. The owner accepted all targets and qualification gates, explicitly as unqualified, on 22 November 2026. No live qualification has occurred. Canonical decision: [Reconcile the minimal-demo resource ledger and qualification gates](https://github.com/stanimirivanov/fleetiq-deploy/issues/92).

## Envelope

Nodes: control plane 2 CPU / 4096 MiB; worker 2 CPU / 8192 MiB. Existing reservation formula yields candidate Pod envelopes 1750m / 3484 MiB and 1750m / 7580 MiB; implementation must verify actual values. Non-Pod reservation/eviction deductions are already included, not added again.

Host tooling: at most 1 CPU / 2048 MiB. Browser separately accounted, not hidden in tooling. Preserve at least 4096 MiB host MemAvailable after accounted demo/browser consumption. Fresh admission includes the incremental not-yet-running footprint; do not double-count already resident processes or infer physical reservation from a limit.

## Worker resident allocations

CPU units are millicores; memory units MiB. All rows are one instance. Requests/limits below are candidate settings, not proven minima.

| Component | CPU request / limit | Memory request / limit |
| --- | ---: | ---: |
| Cilium agent | 100 / 1000 | 256 / 512 |
| Envoy | 50 / 500 | 64 / 128 |
| Cilium operator | 50 / 500 | 128 / 256 |
| CNPG operator | 100 / 500 | 192 / 384 |
| Barman controller | 50 / 500 | 64 / 128 |
| cert-manager | 50 / 500 | 128 / 256 |
| CA injector | 50 / 500 | 64 / 128 |
| Certificate webhook | 50 / 500 | 64 / 128 |
| PostgreSQL | 200 / 1000 | 256 / 768 |
| API | 100 / 1000 | 128 / 256 |
| UI edge / static map serving | 50 / 500 | 64 / 128 |
| TCP ingestion | 100 / 1000 | 256 / 512 |
| Replay | 100 / 1000 | 256 / 512 |
| Semantic | 50 / 1000 | 128 / 256 |
| Current projection | 50 / 1000 | 128 / 256 |
| Analytics | 50 / 250 | 64 / 128 |
| Notification | 25 / 250 | 64 / 128 |
| Alertmanager | 25 / 250 | 64 / 128 |
| Issuer | 50 / 250 | 128 / 256 |
| Receiver | 25 / 250 | 64 / 128 |
| Worker system Pod/helper envelope | 100 / 500 | 256 / 256 |

Resident totals: **1425m CPU requested; 2816 MiB memory requested; 5632 MiB memory limits/envelopes**. CPU limits intentionally share the node cap.

## Nonresident worker allocations

| Component | CPU request / limit | Memory request / limit | Lifecycle |
| --- | ---: | ---: | --- |
| Simulator | 100 / 1000 | 128 / 256 | Explicit normal/fleet/fault Job; one selected run at a time |
| RustFS | 100 / 1000 | 512 / 1024 | Archive phase |
| Archive worker | 50 / 1000 | 128 / 256 | Publication, not concurrent with maintenance Job |
| Administrative Job | 100 / 1000 | 192 / 384 | At most one; no simulator or archive-worker overlap |
| Each Argo component (nine) | 50 / 500 | 64 / 384 | Controlled maintenance only |

Every task-specific initializer has a finite limit and a full memory request equal to that limit. Enforce complete Pod effective-resource accounting, including concurrent/restartable sidecars and Pod overhead; do not simply add or omit init containers. No initializer inherits an unlimited default.

## Phase calculations

| Phase | Worker memory | CPU requests | Peak with 512 MiB extra init/replacement allowance | Remaining from 7580 MiB |
| --- | ---: | ---: | ---: | ---: |
| Resident only | 5632 | 1425m | 6144 | 1436 |
| Normal + simulator | 5888 | 1525m | 6400 | 1180 |
| Archive publication | 6912 | 1575m | 7424 | 156 |
| Archive maintenance | 7040 | 1625m | 7552 | 28 |
| Other administration | 6016 | 1525m | 6528 | 1052 |
| Argo maintenance | 6784 | 1350m | 7296 | 284 |

Argo maintenance retains required provider controllers, worker-system allowance and PostgreSQL; all other normal application roles stop. It adds all nine Argo main containers and one administrative Job. Init requests/CPU still must pass admission: the phase table's CPU column is steady workload requests, not proof all init fits. Serialize/defer starts when additional requests would exceed 1750m.

The 512 MiB allowance is an upper bound on **extra concurrent footprint**, not a blanket per-container allowance and not evidence that current initialization fits. Stop-before-start avoids planned worker surge, but actual terminating Pods must be observed. Controller/database init/sidecars and any replacement overlap must fit the accounted envelope or block the phase. The archive-maintenance margin is only 28 MiB; any missing overhead invalidates this candidate. Memory never relies on request overcommit or swap.

## Control-plane allocation

| Component | CPU request / limit | Memory request / limit |
| --- | ---: | ---: |
| Cilium agent | 100 / 1000 | 256 / 512 |
| Envoy | 50 / 500 | 64 / 128 |
| System-Pod/helper envelope | 700 / 1500 | 2048 / 2048 |

System envelope includes the actual scheduled API server/etcd/scheduler/controller-manager/CoreDNS/local provisioner/helper inventory; resolve its actual placement and per-container finite settings before admission. It is a reservation, not a measured requirement. Worker system envelope covers only actual worker-side counterparts/helpers, not duplicates of control-plane instances.

Control-plane steady memory 2688 MiB; candidate network-init peak 3200 MiB when the agent's effective Pod footprint reaches 1024 MiB, leaving 284 MiB. Steady CPU requests 850m; all initializer requests also must fit. Do not assume unbounded Cilium initializers already satisfy the candidate.

## Approved candidate database connection budget

Use PostgreSQL max_connections 64 as the qualification target: observed producer pool ceilings up to 36 with archive worker, plus up to two for one operation; leave at least 26 for controller/health/administrative use. This conservative pool sum does not imply all clients open their ceilings or every phase permits them concurrently. Set explicit reserves, verify actual pools and CNPG needs, and prove 768 MiB sufficient under this configuration. A connection/OOM problem fails qualification; do not increase the ceiling silently.

## Disk allocation

45 GiB admission envelope on the actual shared backing filesystem: retained claims 11 GiB, image/cache/unpacked layers 12 GiB, runtime logs/writable/temp 4 GiB, preparation/scratch/artifacts 8 GiB, preserved free headroom 10 GiB. Count physical stores and per-node unpacked duplicates rather than adding overlapping apparent filesystem capacities.

| Namespace owner | Retained request |
| --- | ---: |
| Data: PostgreSQL | 4 GiB |
| Application: simulator | 1 GiB |
| Demo support: RustFS / issuer / receiver | 4 / 1 / 1 GiB |

These respect current per-namespace whole-1–4-GiB claim, four-claim/8-GiB limits arithmetically, but namespace opt-in and placement still require implementation. Claims are not physical disk quotas. Retained claims survive ordinary stop/restart, not cluster/node destruction.

Static generated map pack cap: 512 MiB, charged within the artifact allowance; source/derived-database offers, fonts, renderer cache, temporary copies and unpacked serving copies also consume their applicable disk categories. Retained receiver content remains capped at 1000 deliveries or 10 MiB despite its 1-GiB allocation floor. Measure actual usage and stop admitting heavy work before a budget/headroom violation; cleanup never silently deletes product data.

## Qualification and remaining gates

- Finite source-linked rendered inventory, actual node allocatable, placement, init/sidecars/overhead, requests/limits and namespace quotas. Quotas are derived admission controls, not extra memory/disk to add to workload totals.
- Enforce node caps from creation: no temporarily uncapped bootstrap. Refuse startup until every bootstrap/init/replacement stage has finite accounted bounds; provider support for this is an implementation prerequisite.
- Cold bootstrap/startup, 30-minute normal operation, every archive/administration/Argo phase and the agreed one-component interruption/recovery cases. Natural-age reclamation/restore remains required next-day work.
- No OOM, eviction, unexpected restart or lost state. Semantic progress and recovery meet published deadlines; CPU throttling alone is not a failure. Requests/limits or process-running status alone do not prove fit.
- Peak-aware container/node/host collection, CPU/throttling, init overlap, disk and MemAvailable, including collector costs. No permanent metrics-server by default.
- Bounded host preparation within 1 CPU / 2 GiB, serialized with expensive work; no uncapped image/map build. Exact artifacts and their sizes are measured before installation acceptance, not invented during planning.
- Quantified failures return to the owner; no silent higher budget, dropped capability, weakened tests or substituted Compose path.

Source inputs: infrastructure b2da14318ea78634e0e478502420f28e0746ed8e; deployment 969abc5e90f48587521d1bbd0c5082a920b4e28e; platform 5b31f959bb4a45611820aca72027959f74535e18; simulator cda938df36b468ef0296b2118e982ff3d417529a. Source-backed baselines differ from these candidate settings; preserve that distinction in implementation reviews.

## Source-linked baseline and deliberate changes

All allocation tables above are **proposed settings**. The following inspected source facts explain the starting point; neither configured limits nor vendor guidance are measured minima.

- [Infrastructure capacity formula](https://github.com/stanimirivanov/k8s-infrastructure/blob/b2da14318ea78634e0e478502420f28e0746ed8e/scripts/node_capacity.py) supplies the candidate reservation arithmetic. [Full-profile ledger](https://github.com/stanimirivanov/k8s-infrastructure/blob/b2da14318ea78634e0e478502420f28e0746ed8e/docs/capacity/fleetiq-full-installation.yaml) is historical full-profile design, not this composition.
- [Network resource rendering](https://github.com/stanimirivanov/k8s-infrastructure/blob/b2da14318ea78634e0e478502420f28e0746ed8e/scripts/network_assets.py), [database-controller rendering](https://github.com/stanimirivanov/k8s-infrastructure/blob/b2da14318ea78634e0e478502420f28e0746ed8e/scripts/database_assets.py) and [Argo rendering](https://github.com/stanimirivanov/k8s-infrastructure/blob/b2da14318ea78634e0e478502420f28e0746ed8e/scripts/delegated_argo_render.py) establish existing limits. Candidate changes include Cilium768→512, Envoy256→128, Cilium operator384→256, CNPG512→384, Barman256→128 and CA injector256→128 MiB, plus moving certificate controllers to the worker. Cert-manager256/webhook128 and nine Argo384 limits remain, but Argo becomes phase-controlled. These changes need rendered and installed qualification; they are not already a supported profile.
- [Runtime values](https://github.com/stanimirivanov/fleetiq-deploy/blob/969abc5e90f48587521d1bbd0c5082a920b4e28e/charts/fleetiq-runtime/values.yaml) and [analytics workloads](https://github.com/stanimirivanov/fleetiq-deploy/blob/969abc5e90f48587521d1bbd0c5082a920b4e28e/charts/fleetiq-runtime/templates/analytics.yaml) supply API256/edge128 and analytics/notification/router128 MiB ceilings. [Data values](https://github.com/stanimirivanov/fleetiq-deploy/blob/969abc5e90f48587521d1bbd0c5082a920b4e28e/charts/fleetiq-data/values.yaml) currently use PostgreSQL1024, proposed768 MiB here.
- [Pipeline configuration](https://github.com/stanimirivanov/fleetiq-deploy/blob/969abc5e90f48587521d1bbd0c5082a920b4e28e/local/pipeline/compose.yaml) supplies ingestion/replay768 and semantic/projection384 MiB existing ceilings; the candidate reduces them to512/256. Compose configuration is evidence of an existing setting, not qualified Kubernetes capacity.
- [Demo configuration](https://github.com/stanimirivanov/fleetiq-deploy/blob/969abc5e90f48587521d1bbd0c5082a920b4e28e/local/demo/compose.yaml) and [product fixtures](https://github.com/stanimirivanov/fleetiq-deploy/blob/969abc5e90f48587521d1bbd0c5082a920b4e28e/tools/product/compose.mjs) supply issuer/simulator256, receiver128 and RustFS1024 MiB starting ceilings. New persistent/multi-persona/inspectable services must be measured, not assumed equivalent to fixtures. The384 MiB administrative Job ceiling is a new candidate.
- [Node accounting limits](https://github.com/stanimirivanov/k8s-infrastructure/blob/b2da14318ea78634e0e478502420f28e0746ed8e/docs/node-capacity.md) document missing init bounds; [storage policy](https://github.com/stanimirivanov/k8s-infrastructure/blob/b2da14318ea78634e0e478502420f28e0746ed8e/scripts/database_policy.py) defines existing claim admission. Neither establishes physical disk reservation or a bounded complete bootstrap.

Temporary-filesystem usage and child-process resident memory must remain within their charged container envelopes. Do not add protocol executor virtual address-space ceilings as resident reservations, add namespace quotas to workload budgets, or count the same edge/map process twice. Planned phase serialization does not authorize dropping required normal pipeline roles.
