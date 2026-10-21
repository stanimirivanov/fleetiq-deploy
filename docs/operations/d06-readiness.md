# D06 publication and persistent-installation readiness

## TL;DR

The reviewed backend image is published. Chart publication reached structural
verification but exposed a detached-checkout Git-base bug; issue 15 fixes that
prerequisite. UX still lacks passing exact-source qualification. D06 remains
incomplete: no complete verified release BOM or persistent FleetIQ installation
is accepted. This record grants no target or activation authority.

## Source and publication observation: 2026-10-21

Workflow dispatch, successful publication, independent release verification and
installation acceptance are distinct. Re-resolve current main and its exact
latest passing PR qualification before any new publication attempt.

| Producer | Reviewed source revision | Publication readiness |
| --- | --- | --- |
| Provider | `41c558a54bc923fa69d7afc42bc663b763c3add5` | Last reviewed I01-I04 source; re-resolve before the final combined target preview. No provider or private cluster state was inspected in this publication step. |
| Backend | `9260d135a06dfb9f92271a561c306a69533743b0` | PR 307 qualified in CI 39612886207. [Publication 39618474515, attempt 1](https://github.com/stanimirivanov/fleetiq-platform/actions/runs/39618474515) succeeded, including original-OCI scanning, runtime/config proof, migrations, Compose, registry read-back and owned cleanup. |
| UX | `6a52bee99f02d7da483af3cab24ae2deb4a11862` | [PR 67 qualification 39218130996](https://github.com/stanimirivanov/fleetiq-ux/actions/runs/39218130996) failed with `reviewed-tools-unavailable`. Its retained report records one installed-tool issue but omits the role. No publication dispatched; diagnose the exact installed package/peer before proposing a correction. |
| Deployment | `7b9483d56aeffcc8a2fdf4e746638a4b313158cc` | PR 14 passed CI 39563876274. [Publication 39618482279](https://github.com/stanimirivanov/fleetiq-deploy/actions/runs/39618482279) passed authorization, then failed the release-contract check: its detached source checkout has no local `main`. [Issue 15](https://github.com/stanimirivanov/fleetiq-deploy/issues/15) fixes base resolution; no chart receipt was produced. |

The prior backend run 39561201804 is failed historical evidence, not a usable
publication. Its exit 125 omitted the underlying diagnostic. The later
preflight exposed an unavailable Skopeo manifest; PR 307 replaced it and forces
registry resolution even when a daemon caches the image. The successful run
above is the new source-bound receipt. No failed run is rewritten as passed.

## Retained backend publication

The producer reports identify this immutable image:

`ghcr.io/stanimirivanov/fleetiq-platform@sha256:2dbfc81edaecfab70efe2f25c5fec03ec91257af43ad2ffdaa3aa06b3f04eefa`

| Evidence | Actual producer value |
| --- | --- |
| Run / attempt | `39618474515` / `1` |
| GitHub report artifact | `backend-publication-39618474515-1`, ID `12353133957` |
| GitHub archive digest | `sha256:b80a4b416881cea0e47471911343375da88fd37edbd1a3b07fea6fad05c5e749` |
| Publication JSON digest | `sha256:84aa3f916297248e7a9e0ee0deccafe93cc980b1d18a6f5d87d8926455dc065e` |
| Qualification JSON digest | `sha256:3dde5b268f0bf0a9c45e42842d59ca62935b4759186b679ee9323c5907c68f02` |
| SQLx inventory | 30 migrations; exact JSON digest `sha256:9a224cf50e6197994cff3bdc7a8832791931a33d6fc2d22b745b91e2c027a1e8` |

Authentic publication, qualification, scan, scanner, inventory, SBOM and provenance
reports were downloaded into ignored
`target/d06-preparation/backend-39618474515-1/`. Their publication/qualification
source and inventory digests agree. These retained producer reports are not a
complete release selection or independent live-OCI verification receipt. Run the
existing full verifier after all three producers are eligible. No local build,
preview digest, synthetic UX receipt or unsigned statement replaces that gate.

## Immutable publication and evidence gates

1. Preserve the successful backend reports and their source binding. A new
   backend source requires its own eligible reviewed publication; do not rerun
   the failed old source or substitute a discovery tag for the published digest.
2. Merge issue 15 after qualification. Publish charts for that new exact eligible
   current-main revision. Release checks resolve fetched `origin/main` to one
   ancestor commit; absent/foreign bases fail. They never fall back to `HEAD`
   or silently create a local branch to make publisher checks pass.
3. Repair UX's actual installed-tool mismatch through its normal issue/PR
   workflow, preserve all type/browser/security/quality checks, then publish
   its exact eligible merged source with `publish-image.yml`.
4. Retain actual successful run/attempt reports, artifact digests, qualification
   bytes and producer source binding. UX reports expire after seven days.
5. Assemble the full release BOM only from actual receipts. Run
   `pnpm releases:verify-artifacts <release-bom.json>` with independent GitHub
   and live OCI checks before accepting installation inputs. Complete the final
   combined preview and exact-target authorization below before any live apply.

Credentials remain process/private state as documented in
[release operations](release-packages.md). No credential, signed download URL,
kubeconfig, accepted candidate or activation record is committed here. The
[historical provider request](../handoffs/k8s-infrastructure-d06-unblock.md) does
not mean I01-I04 are missing; the [provider/package handoff](local-kubernetes-prerequisites.md)
owns compatibility, ingress, storage and trust details.

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
