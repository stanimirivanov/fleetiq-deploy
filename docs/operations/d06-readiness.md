# D06 publication and persistent-installation readiness

## TL;DR

The canonical fleetiq-ui image is published, and complete independent artifact
verification passed on 2026-10-22 for the new UI, existing backend and existing
chart package. No environment is promoted. D06 remains incomplete: Auth0
inputs are confirmed, the registered source guard is merged, and exact-target
previews are prepared. Actual protected phase sources, host/trust prerequisites
and persistent-target authorization remain required before installation.

## Current verified preparation: 2026-10-22

[Issue 21](https://github.com/stanimirivanov/fleetiq-deploy/issues/21) refreshes
D06 after merged UI PR 77 and deployment PR 20. The publisher uses the exact
merged UI revision below; no old-name image alias or retag is accepted.

| Producer | Reviewed source | Successful publication |
| --- | --- | --- |
| UI | `9cd5cb8684d7e39ac97e9f17cda04e34c5c9d0bd` | [39856130093, attempt 2](https://github.com/stanimirivanov/fleetiq-ui/actions/runs/39856130093/attempts/2) |
| Backend | `9260d135a06dfb9f92271a561c306a69533743b0` | [39618474515, attempt 1](https://github.com/stanimirivanov/fleetiq-platform/actions/runs/39618474515) |
| Charts / release metadata | `7c51685608c61851319ac7313b4a1739cc0ec89b` | [39628417018, attempt 1](https://github.com/stanimirivanov/fleetiq-deploy/actions/runs/39628417018) |

The backend and charts were reused without rebuilding. All producer runs,
merged-source review, maintainer identity, artifact archive hashes, report
bindings and live OCI indexes/manifests/blobs were independently verified by
the existing combined verifier. Runtime source labels/provenance and all 30
published backend migrations matched the selection. The CLI credential now
has working private-package access; the earlier backend access blocker is cleared.

## Immutable published selections

| Role | Reference |
| --- | --- |
| Backend image | `ghcr.io/stanimirivanov/fleetiq-platform@sha256:2dbfc81edaecfab70efe2f25c5fec03ec91257af43ad2ffdaa3aa06b3f04eefa` |
| UI image (wire role `ux`) | `ghcr.io/stanimirivanov/fleetiq-ui@sha256:3d2ad542f6f5e050c8635eb066f4cff9baa3e5595437659f0324e46185748bf8` |
| Release metadata | `ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-release@sha256:8a325a69b9dd2c86223e06133fe1c9c4878ae9801411a79c06df6a2f3e975a8a` |
| Runtime chart | `ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-runtime@sha256:d8aaa5f40b844524c484a49c6d6b32f2c651255c00c320cf1aa1af9180de960b` |
| Data chart | `ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-data@sha256:b2f8637c484f9d6a43a9eeaf1f16e3b1560eef33781dca9117954d9dff594d73` |

UI platform: `linux/amd64`. Chart version:
`0.1.0-r7c51685608c61851319ac7313b4a1739cc0ec89b.run39628417018.attempt1`.
Discovery tags and local qualification images are not install selections.

## Publication and combined-verification evidence

| Evidence | UI | Backend | Chart package |
| --- | --- | --- | --- |
| GitHub artifact | `ux-image-reports-39856130093-2` | `backend-publication-39618474515-1` | `release-package-reports-39628417018-1` |
| Artifact ID | `12461466098` | `12353133957` | `12356879780` |
| Archive SHA-256 | `sha256:249adc38af3eab6a85f8191f666eef0b42f07a0a41349e0defcfeeaa92e7ebc7` | `sha256:b80a4b416881cea0e47471911343375da88fd37edbd1a3b07fea6fad05c5e749` | `sha256:c49a5eb5987f3156e2202b3a4d3feca1d525d348429b7fe3391c03c0396d4d17` |
| Publication JSON SHA-256 | `sha256:1d6b2ddf1c537f2dfaeccac794cb109ff6480513a01993d87bdee7af42aba48c` | `sha256:84aa3f916297248e7a9e0ee0deccafe93cc980b1d18a6f5d87d8926455dc065e` | `sha256:198ebebbd423a8745533bf0e929c569b1386336b7e10b38a8f821cc0ed28ffed` |
| Qualification JSON SHA-256 | `sha256:ccad88556d1e525c65a80332839b9262e38a4c0da88e9bdb34db955456cd6e3f` | `sha256:3dde5b268f0bf0a9c45e42842d59ca62935b4759186b679ee9323c5907c68f02` | `sha256:7e38f6721f1759f2b2a1e561a5281bdd03ec4387a73d1677e5b835e3f79965a9` |

Preparation BOM: `target/d06-preparation/release-bom-ui-39856130093-2.json`.
Its exact bytes hash to `sha256:2d794c978f1a2b7ed59b5a1f96ea70a6d2182a843bbf30325e17efb3e43cd65e`.
Combined receipt: `target/release-evidence/2d794c978f1a2b7ed59b5a1f96ea70a6d2182a843bbf30325e17efb3e43cd65e/run-Cs60Tw/artifact-verification.json`.
Receipt SHA-256: `sha256:bd0ccae4b2a2fcee17e44a7bd07cf8d29127fe3bcad26590ad37020ccc69bb09`.
The receipt records `outcome: verified`, `liveAdmission: not-performed` and
`activation: not-performed`. It was produced by:

`pnpm releases:verify-artifacts target/d06-preparation/release-bom-ui-39856130093-2.json`

The credential was supplied only through the verifier child environment.
Each producer's verified report bytes remain beside the combined receipt;
the downloaded UI archive is retained under ignored `target/d06-preparation/`.
These local files are preparation evidence, not a durable environment ledger.
Preserve original archives and report bytes beyond producer artifact retention
(seven days for UI). Later admission must recheck live prerequisites; this
receipt does not authorize an installation or replace current target checks.

## Source inputs and historical evidence

Provider source: `41c558a54bc923fa69d7afc42bc663b763c3add5` in
`stanimirivanov/k8s-infrastructure`; complete original Git TAR SHA-256:
`sha256:95de6cf55807579b5f3e1f6e31ce1da4e12ca7ccc1063db7d523b5223fadc926`.
Tool input: exact published deployment source's `tools/manifests/tools.lock.json`,
SHA-256 `sha256:2089517fe740fdc182243e857b453f00a45825f7b4f4e3eb866d01775269f3ff`.
Both preserved input hashes were rechecked. The backend's 30-entry original
migration inventory JSON SHA-256 remains
`sha256:9a224cf50e6197994cff3bdc7a8832791931a33d6fc2d22b745b91e2c027a1e8`.
`workflowTemplate: null` remains appropriate until D08 delivers its capability.

The earlier UI publication at source `2cf767937473da98660f2152c78412609e77b94e`,
run 39795529804, old-name image digest
`sha256:761141c95348b6c64963787a4e9167b03ea5dc09ab4fd07a109268983d6fd3cd`,
and its original BOM/reports remain unchanged in ignored preparation storage.
They are historical and are not accepted by current canonical-producer contracts.
[Issue 17](https://github.com/stanimirivanov/fleetiq-deploy/issues/17) records the
earlier evidence-reader and registry-redirect corrections;
[issue 19](https://github.com/stanimirivanov/fleetiq-deploy/issues/19) records the
coordinated repository rename.

Publication attempt 1 failed before image creation: the interruption fixture
read a newly opened PID file before its contents were written and interpreted
empty bytes as PID 0. Attempt 2 reran the unchanged reviewed source and all
publication gates successfully. The fixture readiness race remains a known
harness limitation; no checks, timeouts or source bytes were changed to publish.

## Auth0 preparation: 2026-10-23

[Issue 23](https://github.com/stanimirivanov/fleetiq-deploy/issues/23) prepares
identity onboarding. Trusted HTTPS discovery confirmed issuer
`https://dev-iqzkuoz81x7gifev.us.auth0.com/` and same-origin authorization/token/JWKS
endpoints, with Basic and POST client-secret methods advertised. The provided
public client ID is retained only in ignored preparation values. This does not
prove that the specific application is configured as a confidential client.

The selected release BOM remains unchanged. Its actual backend/UI image digests,
the qualified database image, public Auth0 issuer/client ID and proposed Secret
references passed native Helm lint/render, all 19 local schemas and complete
manifest policy in namespace `fleetiq-apps`. Public discovery, DNS observation,
overrides, rendered resources and a preparation record are retained under
`target/d06-preparation/auth0-20261023/`. No secret or user subject is stored there.

The verifier now takes a selected issuer and registered application namespace
rather than requiring fixture port 19443 and namespace `fleetiq-local`. It binds
runtime issuer, HTTPS egress port, database ingress peer and quota checks to those
independent expectations. Native fixtures reject wrong issuers/ports/namespaces,
broad egress, public backend exposure and insufficient quota; no checks are removed.

This is an offline rehearsal, not an installation candidate: namespace/quota
objects and the API-server CIDR include fixture inputs. DNS answers are transient
observations and must be checked again from the actual target. The operator
confirmed Regular Web Application and supplied the intended initial user's subject;
the personal identifier is not stored in this repository. On 2026-10-23 the operator
confirmed `client_secret_basic` and enabled the user connection. Metadata-only
inspection confirmed a private client-secret file exists and its parent has ACL
inheritance disabled; secret bytes and effective access were not inspected.
The operator subsequently confirmed both default private files; their existence
was checked using the provider runtime without reading contents. No
authentication/code exchange, bootstrap, Secret creation, target query or live
installation was performed.

## Persistent qualification preparation

Follow the [concrete qualification checklist](d06-qualification.md) for target
identity, provider-native previews, initial database delegation, capacity,
identity references and ordered acceptance gates. The
[provider/package handoff](local-kubernetes-prerequisites.md) covers compatibility,
ingress, storage and trust. The earlier provider request is historical: I01-I04
are merged, but their disposable qualification does not authorize a retained target.

Auth0 onboarding is in progress and remains mandatory for normal startup; see
the [operator runbook](auth0-onboarding.md).
[Issue #25](https://github.com/stanimirivanov/fleetiq-deploy/issues/25) implements
registered role-isolated control graphs and a read-only locked-ref verifier; see
[source operations](argo-source-graphs.md). Actual phase payloads, activation-ref
protection and controller admission remain unqualified.
[Issue #27](https://github.com/stanimirivanov/fleetiq-deploy/issues/27) prepares
the [exact persistent-target preview](d06-target-preview.md) at the operator-confirmed
non-AppData path. All four native offline previews passed; final capacity review,
host disk/name/trust prerequisites, live authorization and ownership/incarnation
checks remain outstanding.
No cluster, namespace, Secret, AppProject, Application or candidate was created
or queried during this publication/verification task.

D06 remains incomplete until real installation, trusted HTTPS/private API,
identity, network allow/deny, database restart persistence and retained-data
protections pass on the authorized persistent target. D07 owns external
backup/restore, D08 release workflows, D10 complete real-provider browser journeys,
and M08 production acceptance. Local Retain storage does not protect against
kind or host loss.
