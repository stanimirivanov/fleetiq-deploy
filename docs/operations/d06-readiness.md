# D06 publication and persistent-installation readiness

## TL;DR

Provider I01-I04 and the D06 package corrections are merged. D06 remains
incomplete: there is no accepted persistent FleetIQ Kubernetes installation.
The first backend publication failed runtime export; UX and package publication
are blocked by failed exact-source CI. This record prepares the remaining gates;
it is not a release selection, target authorization or installation receipt.

## Source and publication observation: 2026-10-21

These immutable source observations are not interchangeable with OCI digests.
A workflow dispatch is not a successful publication. Re-resolve current main and
its exact latest passing PR qualification before each publication attempt.

| Producer | Reviewed main revision | Publication readiness |
| --- | --- | --- |
| Provider | `41c558a54bc923fa69d7afc42bc663b763c3add5` | I01-I04 merged; a fresh combined FleetIQ target still needs qualification. |
| Backend | `76bc728a23b23610874fe6dd710cb079662358be` | PR 305 qualified in CI run 39149557120. [Publication run 39561201804](https://github.com/stanimirivanov/fleetiq-platform/actions/runs/39561201804) passed authorization and vulnerability/secret scanning, then failed `runtime-export` with Docker tool exit 125. No successful image receipt was produced; repair the producer qualification before retrying. |
| UX | `6a52bee99f02d7da483af3cab24ae2deb4a11862` | [PR 67 qualification 39218130996](https://github.com/stanimirivanov/fleetiq-ux/actions/runs/39218130996) failed with `reviewed-tools-unavailable`. No publication dispatched. Correct the actual installed-tool mismatch and qualify a reviewed merged source first. |
| Deployment | `e8a9770def5756949ffe05348329e8e5a965649b` | PR 12 merged, but [qualification 39559487435](https://github.com/stanimirivanov/fleetiq-deploy/actions/runs/39559487435) failed all four jobs at the opening-summary documentation rule. Issue 13 corrects the guide and improves diagnostic fixtures; publish only after the correction merges and passes CI. |

The deployment plan's status preamble had pushed its TL;DR beyond the existing
first-500-character check. The correction restores the opening summary; it does
not relax the 100-line threshold, opening window, CI requirement or source/tree
matching. The diagnostic now identifies the file that needs repair.

The [earlier infrastructure request](../handoffs/k8s-infrastructure-d06-unblock.md)
records the superseded 2026-10-19 blocker assessment. It is not evidence that
I01-I04 remain missing. The [current provider/package handoff](local-kubernetes-prerequisites.md)
owns compatibility, ingress, storage and trust details.

## Immutable publication and evidence gates

1. Repair and requalify the backend runtime-export failure through its normal
   issue/PR process, then publish the exact eligible merged current-main source.
   Run 39561201804 retained `backend-publication-39561201804-1`: its qualification
   is `incomplete` at `runtime-export`, while its recorded scan outcome is `passed`.
   Exit 125 alone does not establish the underlying Docker error. Preserve the
   original OCI bytes, scan gate, bounded resources and owned cleanup; never
   invent an image reference or silently retry a changed source.
2. Correct and requalify UX's installed tools through its normal issue/PR process.
   Preserve type, browser, security and measured-quality checks. Dispatch
   `publish-image.yml` for the exact eligible merged current-main revision.
3. Merge the deployment correction and obtain passing exact-source CI. Dispatch
   `publish-release.yml` for that new current-main revision. An unmerged fix branch
   or the previously failing source is not publication eligible.
4. Retain each successful run/attempt's actual report archive, artifact digest,
   publication receipt, qualification bytes and source binding. Backend reports
   also supply the real SQLx migration inventory. UX reports expire after seven
   days; verify and preserve evidence before expiry.
5. Assemble the closed full release BOM from actual producer/package receipts,
   then run `pnpm releases:verify-artifacts <release-bom.json>`. Its independent
   GitHub and live OCI checks must pass before installation input is accepted.

Use private repository/registry read credentials only as documented in
[release operations](release-packages.md). Never copy credentials, signed
artifact-download URLs or kubeconfig into this record. No accepted BOM, candidate,
activation record or synthetic success receipt is committed by this preparation.

## Persistent-target review inputs

The following is a proposed topology to complete with actual inputs. It grants
no permission to create, adopt, resize or remove a target.

| Input | Preparation / remaining condition |
| --- | --- |
| Consumer / target | `fleetiq` / `fleetiq-local`, dedicated context `kind-fleetiq-local`; prove complete absence or original matching ownership before creation/reuse. |
| Provider / profile | The immutable provider revision above; explicit `isolated-network-local`. No retained Perfeng cluster or disposed I04 qualification target is adopted. |
| Docker / private state | Propose local `desktop-linux`; operator-selected ordinary private state root outside Git, with private Windows ACLs. Do not use global kubeconfig. |
| Capacity | Two nodes capped after bootstrap at 2 CPUs/4 GiB each; initial bootstrap temporarily uncapped. Review free host/engine resources, Pod placement, combined controllers and rollout headroom before asking for execution authorization. |
| Delegation | Consumer-owned `fleetiq-apps`, `fleetiq-data` and `fleetiq-releases`; database namespace opt-in and provider quota/admission before database Argo grants. Provider owns its system namespaces, shared APIs and controller accounts. |
| Ingress | Propose loopback HTTPS 18443 to node listener 8443, hostname `fleet.local.test`, Cilium reserved ingress identity. Confirm port availability, name resolution, certificate and client trust without host-wide trust changes. |
| Data | One database instance, explicit `local-retained`, 2Gi claim with 8Gi/four-claim admission accounting; select the actual supported PostgreSQL digest, not the preview's synthetic value. |
| Identity | Deployment-selected trusted HTTPS OIDC issuer, client ID, authority, confidential Secret reference and actual issuer egress destinations; separately provide its public CA when needed. The fixture issuer on 19443 is not a selected live provider. |
| Application artifacts | Actual verified backend, UX and chart digests plus migration inventory; no local build or preview digest substitution. |
| GitOps authority | Register and enforce protected activation source graphs and test revision-override rejection before adding Applications. Preserve distinct bootstrap and release authority. |
| Lifecycle | Persistent state is retained on normal stop/failure; never run the disposable cluster-destruction path as successful cleanup. Destructive removal needs its own reviewed authorization and data policy. |

Default application/database requests are 400m CPU and 384Mi combined, before
provider controllers and system Pods. These values are not a complete capacity
assessment: inspect per-node placement, limits, startup and migration/probe overlap
against the bounded Docker nodes. Local volume requests are not physical quotas.

Once immutable inputs and identity references are ready, generate the provider's
offline preview for the exact state root, context, ports, delegation and combined
resource envelope. Inspect that preview before requesting its explicit live
execution authorization. No cluster or private instance state was read here.

## Native offline rehearsal

The exact merged provider revision above was fetched into temporary isolated Git
state and archived without changing the shared provider checkout. Its native
`consumer_kind up`, `network apply` and `database apply` previews passed for
consumer `fleetiq`, profile `isolated-network-local`, Docker context
`desktop-linux`, HTTPS port 18443 and network hostname `fleet.local.test`.
All three reported `execution: not-performed`; no `--execute` was supplied.

Reports are retained locally under ignored `target/d06-preparation/` as
`consumer_kind-preview.json`, `network-preview.json` and `database-preview.json`.
They use a temporary empty state directory for rehearsal, not the future
persistent state root. No kubeconfig, owner journal, Secret or cluster was read.
The database preview had no delegation file, so it does not establish database
namespace admission, Argo authority, controller readiness or persistence.

These native previews validate input composition, not a complete installation,
resource-capacity acceptance or live permission. Repeat the final combined preview
with the actual private root, reviewed delegation, immutable artifacts and identity
references before requesting execution authorization.

## Live acceptance still required

- Observe exact owner/context, cluster incarnation, empty-target preconditions,
  narrow delegated access and protected source revisions before mutation.
- Run explicit initial migrations using the selected inventory and separate role;
  prove serve-mode readiness performs no DDL.
- Prove normal trusted HTTPS/OIDC startup, SPA deep links and private API routing;
  unconfigured identity and synthetic upstreams do not establish acceptance.
- Exercise actual allow/deny traffic, DNS/issuer egress and cross-consumer denial;
  prove backend/database Services remain private and wrong-host/untrusted TLS fail.
- Seed real database state, replace only the owned database Pod and verify data
  persistence. Exercise retained-data protections without destroying this target.
- Reject wrong context/owner, stale or foreign resources, missing trust and
  incomplete evidence. Retain non-secret source/target-bound outcomes durably.

D06 stays incomplete until these gates pass. D07 owns external backup/restore,
D08 owns release Workflow execution, D10 owns full real-provider browser journeys,
and M08 owns production acceptance. Local Retain storage does not protect against
kind node or host loss.
