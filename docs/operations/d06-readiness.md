# D06 publication and persistent-installation readiness

## TL;DR

Backend and corrected charts have successful publications. The chart package has
also passed independent GitHub/OCI verification. UX publication succeeded for the merged, passing PR 75 revision. The UX
image also passed independent GitHub/OCI verification. D06 remains incomplete until the full
release is independently verified and a separately authorized persistent install
passes its live gates. Identity configuration is deferred by the operator.

## Observations: 2026-10-22

Publication, independent verification, candidate admission and installation are
separate outcomes. Re-resolve exact current main and its passing merged-PR tree
before dispatching any new publication; do not rebuild successful inputs merely
to update this document.

| Producer | Reviewed source | Publication / verification |
| --- | --- | --- |
| Provider | `41c558a54bc923fa69d7afc42bc663b763c3add5` | Qualified I01-I04 revision, still remote main. Four new native offline previews passed; no live target queried. |
| Backend | `9260d135a06dfb9f92271a561c306a69533743b0` | [Publication 39618474515, attempt 1](https://github.com/stanimirivanov/fleetiq-platform/actions/runs/39618474515) succeeded. Independent verification reached a live OCI 404; current CLI credential lacks `read:packages`. Neither artifact deletion nor successful private access is established. |
| UX | `2cf767937473da98660f2152c78412609e77b94e` | [PR 75 qualification 39751424169](https://github.com/stanimirivanov/fleetiq-ux/actions/runs/39751424169) passed all five jobs. [Publication 39795529804, attempt 1](https://github.com/stanimirivanov/fleetiq-ux/actions/runs/39795529804) requested for this exact merged main revision; workflow completed successfully. Exact source/run/report hashes and live OCI index, manifests, blobs and source labels independently verified. |
| Deployment | `7c51685608c61851319ac7313b4a1739cc0ec89b` | [Publication 39628417018, attempt 1](https://github.com/stanimirivanov/fleetiq-deploy/actions/runs/39628417018) succeeded after merged PR 16. Independent publisher/report/archive/OCI/chart verification passed on 2026-10-22. |

[Issue 17](https://github.com/stanimirivanov/fleetiq-deploy/issues/17) tracks this
publication and persistent-qualification preparation. Historical failed publisher
runs remain failed; no failed result is reclassified as accepted.

## Immutable published selections

| Role | Reference |
| --- | --- |
| Backend image | `ghcr.io/stanimirivanov/fleetiq-platform@sha256:2dbfc81edaecfab70efe2f25c5fec03ec91257af43ad2ffdaa3aa06b3f04eefa` |
| UX image | `ghcr.io/stanimirivanov/fleetiq-ux@sha256:761141c95348b6c64963787a4e9167b03ea5dc09ab4fd07a109268983d6fd3cd` |
| Release metadata package | `ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-release@sha256:8a325a69b9dd2c86223e06133fe1c9c4878ae9801411a79c06df6a2f3e975a8a` |
| Runtime chart | `ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-runtime@sha256:d8aaa5f40b844524c484a49c6d6b32f2c651255c00c320cf1aa1af9180de960b` |
| Data chart | `ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-data@sha256:b2f8637c484f9d6a43a9eeaf1f16e3b1560eef33781dca9117954d9dff594d73` |

The chart version is
`0.1.0-r7c51685608c61851319ac7313b4a1739cc0ec89b.run39628417018.attempt1`.
No discovery tag, local image or precommit preview digest is an install selection.

| Evidence | Backend | Chart package |
| --- | --- | --- |
| GitHub report artifact | `backend-publication-39618474515-1` | `release-package-reports-39628417018-1` |
| Artifact ID | `12353133957` | `12356879780` |
| Archive digest | `sha256:b80a4b416881cea0e47471911343375da88fd37edbd1a3b07fea6fad05c5e749` | `sha256:c49a5eb5987f3156e2202b3a4d3feca1d525d348429b7fe3391c03c0396d4d17` |
| Publication JSON digest | `sha256:84aa3f916297248e7a9e0ee0deccafe93cc980b1d18a6f5d87d8926455dc065e` | `sha256:198ebebbd423a8745533bf0e929c569b1386336b7e10b38a8f821cc0ed28ffed` |
| Qualification JSON digest | `sha256:3dde5b268f0bf0a9c45e42842d59ca62935b4759186b679ee9323c5907c68f02` | `sha256:7e38f6721f1759f2b2a1e561a5281bdd03ec4387a73d1677e5b835e3f79965a9` |

The authentic backend SQLx inventory contains 30 migrations, exact JSON digest
`sha256:9a224cf50e6197994cff3bdc7a8832791931a33d6fc2d22b745b91e2c027a1e8`.
Reports remain under ignored `target/d06-preparation/`. A full schema-valid release inventory is now prepared in
`target/d06-preparation/release-bom.json`, with all three actual producer
selections, infrastructure/tool hashes and all 30 migrations. Schema validation
is not independent artifact acceptance, candidate admission or live permission.

## Independent verification and remaining prerequisites

The existing `verifyPublication` boundary independently checked the package's
successful authorized GitHub run, merged source, current maintainer identities,
GitHub archive digest, bounded report bytes and live release/runtime/data OCI
manifests and blobs. Its retained verification record is in
`target/d06-preparation/independent-package/`.

The same verifier reached backend manifest lookup and received HTTP 404.
A separate read-only package API query returned HTTP 403 explicitly requiring
`read:packages`. This is incomplete independent verification, not proof that the
backend image is missing. Supply a GHCR-capable read credential through the
private process environment before retrying; do not republish to hide access
failures or substitute cached local images. See [release operations](release-packages.md)
for registry and source credential requirements. Never paste credentials in chat.

The UX report archive `ux-image-reports-39795529804-1`, artifact ID
`12432114815`, has SHA-256
`6938f9e3d0b5ed3bb36c012f7a3d04dabc17e5ec1c0525de9a5c5b4548fb5787`;
the downloaded archive independently matches that GitHub digest. Its exact
publication directory is `39795529804-1/`, publication JSON digest
`sha256:8f24ffc7fd7291aa61b2170c4faf285eba91483bca99be0f04ca0b8401519aa7`,
and qualification JSON digest
`sha256:f51e9fb8000f040aa257901cb3370ffea9cafd905694350cce48ebf43c4fc9ae`.
Reports are retained in ignored `target/d06-preparation/ux-39795529804-1/`;
preserve them beyond seven-day producer retention.

This actual archive reproduced a consumer integration defect: the existing reader
flattened both qualification and publication directories and rejected duplicate
basenames. Issue 17 selects only the exact trusted run/attempt directory for UX,
while preserving all archive safety, receipt hashes and publisher identity gates.
Adversarial fixtures reject foreign attempts, missing selected reports, nested
selected reports, collisions, traversal, links and oversized foreign entries.
Backend/package selection semantics are unchanged.

The UX independent verification passed on 2026-10-22; its verified reports and
selection are retained under `target/d06-preparation/independent-ux/`. Actual
GHCR verification also exposed an unreachable intended blob-redirect path: the
request used `redirect: error` before the approved-host handler could inspect the
307. Issue 17 changes only the registry request to manual redirect inspection.
Only blob callers may follow the existing approved storage host, without registry
credentials; manifest redirects and a second storage redirect still fail.
Regression tests cover GET/HEAD, forbidden hosts/schemes/ports, credential removal
and repeated redirects. No registry or evidence check is bypassed.

Once private backend registry access is available, run the existing combined
verifier:

```powershell
pnpm releases:verify-artifacts <release-bom.json>
```

Only a fully successful verifier produces the combined artifact-verification
receipt. A successful chart check, partial evidence, JSON validation or local
report copy is not combined release acceptance. Preserve verified evidence in the
future durable store; ignored preparation files are not an environment ledger.

## Persistent qualification preparation

Use the [concrete qualification checklist](d06-qualification.md) for target
identity, initial database delegation, provider-native preview results, resource
accounting, identity references and ordered acceptance gates. The
[provider/package handoff](local-kubernetes-prerequisites.md) describes compatibility,
ingress, storage and trust; the [earlier provider request](../handoffs/k8s-infrastructure-d06-unblock.md)
is historical and does not mean I01-I04 are missing.

The current preparation contacts no cluster and grants no activation authority.
OIDC configuration is intentionally deferred; it remains mandatory for normal
startup. Protected Argo source-graph enforcement, combined resource review and
an exact durable-target preview/authorization are still required before apply.
The no-Argo-graph guard remains enabled until its replacement is implemented and
verified. No AppProject/Application or accepted candidate is created here.

D06 is incomplete until real installation, trusted HTTPS/private API, identity,
network allow/deny, database restart persistence and retained-data protections
pass on the authorized persistent target. D07 owns external backup/restore, D08
release workflows, D10 complete real-provider browser journeys, and M08 production
acceptance. Local Retain storage does not protect against kind or host loss.
