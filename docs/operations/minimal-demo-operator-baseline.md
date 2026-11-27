# Minimal-demo operator and evidence baseline

## TL;DR

Main supports the shared migration and grants Workflow and checked operator
bootstrap. The six routine administrative Job procedures in draft PR #136 are
source evidence. The first proposed cutover is one reviewed `rebuild-current`
attempt with one native create and one read-only status and recovery path.
Kubernetes execution and FleetIQ's durable effect need separate verdicts.

[Baseline issue][138] · [Delivery tracker][137] · [Original Job requirements][100] · [Pilot][139]

## Supported paths and draft evidence

This inventory uses the main deployment revision linked below, the provider
delegation revision `db9f01b7db30a4a72581781af35c04f38f9a1ec7`, and the platform
source selected by the demo's immutable backend pin. **Supported** means
documented and packaged on main. **Qualified** describes a recorded run at the
specified boundary. **Source or fixture** describes a contract, render or test
in the linked tree. **Open** means the proposed replacement still needs evidence
at the named boundary.

PR #121 shipped the shared Workflow. PR #130 qualified the exact published
backend and deployment SQL pair on a disposable CNPG retained upgrade. PR #131
qualified the demo data composition and provider-rendered bootstrap Job on kind.
The provider Cilium datapath and whole-demo installed acceptance remain separate
gates. Draft PR #136 reports offline Job and receipt fixtures and isolated
PostgreSQL checks for all eight observation branches. Its live second-operator
rehearsal is pending.

[Main backend selection][pin] · [Shared Workflow PR][121] · [Qualified upgrade][130] · [Demo data qualification][131] · [Provider contract][provider] · [Draft PR evidence][136] · [Draft revision][draft]

| Path and callers | Preparation, submission and recovery | Scoped access and authority handoffs | Evidence retained separately |
| --- | --- | --- | --- |
| **Supported** shared `migrate` Workflow, used by ordinary workload-identity upgrades and the demo installation. Main manifest verification renders the Workflow, SQL, staging and named route. #120 records qualification of the disposable CNPG 58-to-59 upgrade. | Verify the backend publication and migration inventory. Stage credentials, select the reviewed maintenance phase and verify writer exclusion. Stage two immutable ConfigMaps and a WorkflowTemplate with the release digest. Submit suspended, install the reviewed demo route pair for that name, obtain independent start approval, and observe fence/migrate/grant/verify. For interruption keep the runtime fenced, wait for Pod termination, recheck the same target and maintenance phase, and obtain fresh approval for the same reviewed template and digest. Use a fresh demo Workflow name and routes. | Credential and release owners pass the staged phase and request to the submitter. Provider controls the template allowlist. Network owner applies and removes the demo routes. Independent approver starts the Workflow. The Workflow uses the temporary owner login and public CA. In an ordinary upgrade the credential owner withdraws temporary credentials and switches clients to scoped logins. In the demo, remove the temporary migration route after the Workflow Pods terminate, reconcile the bootstrap phase, verify the migrator is `NOLOGIN`, and retire the migration password Secrets before bootstrap. Keep writers fenced through bootstrap. | Retain five evidence groups. Keep target/database/phase identity, publication/inventory/SQL revision, Workflow and Pod UIDs with the four step outcomes, ledger/grants/exporter visibility, and the ordinary client cutover or demo phase transition and credential withdrawal. [Main demo migration][main-migrate] · [Shared recovery and qualification][shared120] · [Main manifest caller][main-manifests] · [#120][120] |
| **Supported** checked `bootstrap-platform-operator --check-schema` Job in the demo data guide. The main chart emits its provider input and route. Main manifest verification renders both. | Keep all writers fenced, verify the bootstrap role and HBA, stage Secrets, render the request and route, and use the provider's preview and Job render. Submit the exact Job. Require the single successful Pod and expected command result. For failure or expiry, retain the original evidence for review before a fresh approved attempt. Independently confirm the same intended identity if the command reports it was already bootstrapped. After the Pod terminates, withdraw the launcher grant and both temporary route objects. Reconcile runtime, verify the bootstrap login is `NOLOGIN`, and retire the bootstrap password, URL and operator input Secrets. Verify withdrawal before admitting runtime writers. | Deployment/credential owner hands the named request and Secret references to the provider for the launcher grant. Network owner installs the reviewed route. Launcher submits. A separately authorized observer checks execution and intended identity. Provider, network and credential owners withdraw their exact resources. The Job uses a temporary bootstrap DB login, three identity input keys and the public CA. The runtime account carries no Kubernetes API token. | Retain five evidence groups. Keep target/publication/operation, bootstrap fence/role/route, Job and Pod identities with node/image/exit, intended identity on the already-present branch, and launcher/route/phase/credential withdrawal. [Main bootstrap][main-bootstrap] · [Producer contract][bootstrap] · [Main manifest caller][main-manifests] |
| **Draft source and fixtures** for bootstrap plus `rebuild`, `register`, `calculate`, `reclaim`, `summarize` and `expire`. The draft data guide points bootstrap at the draft administration guide. The chart and manifest checks render operation carriers and routes. The guide invokes the receipt filter and SQL manually. Migration still uses the shared Workflow. | Helm carrier and optional immutable input ConfigMap, provider preview and Job render, live admission and routes, target and fence checks, checksum manifest, SQL baseline and saved intent. One server dry-run and one native create. For status or lost response, refresh target identity, read the named Job and watch when needed, read owned Pods, fetch and corroborate logs, run the filter and SQL, assemble the outcome, then withdraw or escalate. | The six handoff groups run from deployment preparer to provider approver, provider to launcher, network owner to launcher, credential owner to Job and observer, launcher to observer, and observer to withdrawal owners. Count each transfer in rehearsal when one row covers multiple recipients. Distinct access includes provider authority, network authority, credential authority, launcher kubeconfig, observer kubeconfig, dedicated read-only PostgreSQL login, operation DB login and reclaim storage access where selected. Private input and kubeconfig/password material stay outside evidence. | The draft measurement below counts named evidence. The filter takes eight inputs. The SQL emits independent observations. [Draft guide][draft-guide] · [Draft chart][draft-chart] · [Draft fixture checks][draft-fixtures] · [Draft manifest caller][draft-manifests] |

### Count preparation, launch and recovery

Use one prepared-target run as the unit. Include the work owners do to prepare
the target and the attempt, and record shared target setup separately so it
appears in both totals. Count each human-issued invocation, review/check,
manual input or evidence assembly, and transfer of approval, responsibility or
scoped access. Count pipelines as one invocation plus each human decision.
Count logical roles even if one person happens to hold two of them.

- **Main migration.** The ordinary guide shows one Kustomize staging
  invocation. The demo guide shows three command blocks for phase renders,
  request and Workflow staging, and the named migration-route render. Five
  identifiable handoff groups cover credential staging, release request,
  provider template allowlisting, network routes, and independent start
  approval. Count submission and start separately. Count ordinary client
  cutover or the demo's route withdrawal and bootstrap transition separately.
  An interrupted attempt adds the Pod wait, target and phase rechecks, fresh
  submission and approval, and, in the demo, fresh routes. Live invocation
  totals are unavailable because submission, live checks and retries include
  prose or conditional steps. [Demo migration][main-migrate] · [Shared upgrade][shared120]
- **Main bootstrap.** The guide shows two Helm preparation pipelines for the
  carrier and route. The procedure names three provider invocations (offline
  configure preview, Job render and authorized configure) and one native Job
  submission. Six identifiable handoff groups cover staging, provider grant,
  network routes, launcher submission, independent observation and withdrawal.
  Count reconciliation of a failed attempt and any fresh preparation separately.
  Live invocation totals are unavailable because the guide leaves live checks,
  recovery and withdrawal in prose. [Demo bootstrap][main-bootstrap] · [Provider delegation][provider]

The draft rebuild guide shows 13 literal command examples across 10 command
blocks and one JSON intent example. The command examples include one Helm
render, two checksums, one dry-run, one create, six Kubernetes observer calls
(including the conditional watch), one filter invocation and one SQL example.
Use these source-based lower bounds for a complete attempt. The guide also
names owner actions whose invocation counts need rehearsal.

- **Preparation.** Deployment renders the carrier and the exact attempt
  route, verifies target, publication, staged image and reviewed inputs, and
  saves the evidence manifest and intent. The provider runs four named steps
  (offline configure preview, exact Job render, authorized configure and
  health). The network owner installs the reviewed route pair and verifies
  isolation. The credential owner stages the operation login and URL Secret
  and the separate read-only access. Deployment confirms the writer fence.
  The observer runs the first SQL read for the baseline.
- **Launch.** The launcher runs at least four commands (two checksums, one
  server dry-run and one create). Count the endpoint, principal, UIDs, provider
  health and unused-name checks and the saved submission evidence separately.
- **Observation and recovery.** After target identity is established, a
  complete observation takes at least six observer invocations (initial
  named Job GET, owned Pod list, bounded logs, Pod reread, filter and final
  SQL read). If the Job is active, add the bounded watch and a second exact
  Job GET after the watch. On response loss repeat both checksums, recheck
  the TLS endpoint and observer principal, and add the fresh target GET for
  namespace and CNPG UIDs before the initial Job GET. Count the observer's
  comparison and manual outcome assembly separately. Recovery uses the same
  attempt without another create.
- **Withdrawal.** Count four owner groups after reconciliation. The provider
  withdraws exact attempt authority, the network owner removes the routes,
  the credential owner retires the temporary credentials, and deployment
  preserves the outcome and handles any approved UID-scoped cleanup. The
  prose defines those responsibilities. Live invocation counts remain open.

The draft names 20 attempt records for a complete rebuild observation. Ten
cover Job values, rendered carrier, provider Job, grant receipt, health
receipt, checksum manifest, approved digest, observation input file,
before-state and intent. Submission adds two records for the raw result with
diagnostics and the parsed response or empty placeholder. Observation adds
eight records for the target, Job, Pod list, Pod after log collection, bounded
logs, execution receipt, after-state and reviewed outcome. These are logical
records, even if stored together. Record withdrawal separately. The
qualification run also needs independent accepted-create evidence. Other
operations may add input UID/digest, an exact summary revision read or trusted
archive read-back.

The draft independently enters or copies facts already present in reviewed
inputs and producer responses. Examples are target and backend identity in
the intent, before/after observer selectors copied from the chart carrier,
and Job/Pod identity derived again when selecting logs and assembling the
receipt. The comparison should show which producer now supplies each fact
and which operator copies and checks disappear.

[Draft preparation][draft-prep] · [Draft submit and recovery][draft-guide] · [Receipt inputs and checks][draft-receipt] · [Draft durable observation][draft-sql]

## Evidence matrix for #100

Admission covers which exact request may start. Execution covers the Kubernetes
objects and process that ran. Durable effect covers independently read FleetIQ
state. The provider owns cluster identity and grant behavior. Deployment owns
reviewed operation inputs, environment fences, executable PostgreSQL grants,
scoped access wiring and the outcome record. The platform owns command
compatibility with the privilege boundary, schema migrations, verified
PostgreSQL TLS and the durable product facts. [Accepted database ownership ADR][adr-db]

| Gate and decision | Authoritative producer | Baseline and open proof |
| --- | --- | --- |
| **Admission** Reject wrong target, namespace, replaced infrastructure or database. | Provider confirms live API identity, endpoint and `kube-system` UID. Deployment binds the namespace and CNPG UIDs and verified TLS. The database supplies system identifier, OID and primary state. | Draft intent, fresh observer reads and the SQL identity check cover these at source level. The pilot must prove a fresh comparison along both launch and recovery, including stale target and database mismatch. Provider owns target observations. Deployment owns binding those observations to the approved backend. |
| **Admission** Reject unsupported operations, wrong scope or inputs, mutable artifacts and unapproved Secret references. Restore and export use product APIs. | Deployment's reviewed operation manifest and backend publication choose command, digest, references and immutable input bytes. Provider admission binds the exact PodSpec for the named attempt and credential operator stages only the approved references. Platform validates command semantics. | Draft chart/schema and provider admission cover envelope changes, with draft live input ConfigMap UID and digest checks for file-backed operations. Admission checks references and the PodSpec. The pilot must prove the live inputs, publication and staged runtime image, including wrong tenant or input. Deployment owns the missing end-to-end proof. [Draft chart][draft-chart] · [Restore API][restore] · [Export API][export] |
| **Admission** Reject duplicate active or incomplete attempts, a reused/foreign name, and overbroad access. | Provider's serialized configuration and native admission bind exact launcher, namespace, name and PodSpec. The API enforces named-object uniqueness. A separate observer has read access; the Job runtime gets no Kubernetes API token. | The scoped launcher has create plus named Job and PodTemplate reads. Admission supplies exact create restrictions. Qualify denial for wrong actor/spec/namespace and observer create/delete/exec, no runtime token, partial admission setup and withdrawal. Provider owns the grant and deployment owns the observer wiring. [Provider configure checks][provider-preflight] · [Admission policy][provider-admission] · [Launcher Role][provider-role] |
| **Admission and durable effect** Require actual writer exclusion, minimal database grants, TLS, and the reviewed resource bounds. | Deployment supplies reviewed routes and phase, and verifies termination and grants against the exact backend. PostgreSQL and the platform supply positive and negative privilege behavior and TLS/database identity. | #120 covers its selected runtime workloads and migration fence. The six routine grants and their denials remain open at the selected operation/backend/SQL pin. Demonstrate the operation-specific fence and resource bounds on the actual target, including a competing writer and wrong trust. Keep the historical 28 MiB margin as an unqualified target. [Shared qualification][shared120] · [Producer grant contract][grants] · [Resource requirements][resources] |
| **Execution** Bind success or failure to the original Job and its process. | Kubernetes supplies Job UID, owned Pod UID and controller reference, actual worker, applied spec, terminal status, container identity, restart count, times and image ID. | The provider enforces one completion, one parallel Pod, zero retry budget and a deadline. The draft verifies exact envelope, one owned Pod, expected image/container and zero exit, then checks bounded log provenance and an operation-specific marker. The pilot must prove equivalent execution attribution from native evidence. Log text is diagnostic. Multiple, replaced or conflicting Pods leave execution unresolved. [Draft execution checks][draft-execution] · [Provider admission][provider-admission] |
| **Execution** Handle interruption, denial, deadline, missing or foreign Job and response loss. | Native API response or independent accepted-create evidence supplies the UID. Fresh target, exact Job and owned Pod reads resolve the same attempt. Provider owns the authorization window and exact grant withdrawal. | Draft fixtures exercise correlated and uncertain snapshots. The pilot must induce post-acceptance response loss on Kubernetes and correlate one accepted create and original UID with the observer and owned Pod. This is separate from proof of production audit coverage or exactly-once process starts. On denial, preserve the trusted response. On absent, mismatched, unreadable or still-active evidence at the bound, keep the attempt unresolved. [Draft recovery][draft-recovery] · [Draft receipt fixtures][draft-receipt-fixtures] |
| **Durable effect and custody** Distinguish exit from commit and keep evidence and retained data through recovery. | Independent product/maintenance reads below establish effects. Deployment assembles and retains the reviewed result. Provider withdraws the grant. Credential and network owners withdraw their resources. Authorized cleanup uses exact UIDs. | Draft logs, Job condition and SQL snapshots are separate evidence. Prove private off-cluster custody, withdrawal, and that pending Jobs and retained checkpoints, PVC/PV, archive and database data survive cleanup. Escalate release recovery without starting an old image after a migration failure. [Provider withdrawal][provider-withdrawal] · [Deployment evidence and recovery][deployment-recovery] |

A successful command exit supplies the execution verdict alone. The operation
rows give the effect conditions and where an independent read falls short.

| Operation | Durable acceptance and refusal or ambiguity | Producer and remaining proof |
| --- | --- | --- |
| `migrate` | Exact successful prefix before restart, then the selected complete ledger with matching checksums, transactional effective grants, exporter access and no foreign writer. Prefix, OID or ACL mismatch keeps the installation fenced for reviewed recovery. | **Qualified for #120's scoped upgrade.** Deployment reuses its Argo fence/migrate/grant/verify Workflow and the platform inventory. The draft ledger snapshot alone cannot prove the grant transition. Demo composition and installed acceptance still have their own gates. [Shared Workflow][workflow] · [Shared recovery and evidence][shared120] |
| `bootstrap-platform-operator --check-schema` | An exact prior bootstrap receipt and its matching actor, authority and subject mapping establish `already present`. A different identity is a refusal. Initial commit requires separate evidence of the grant created atomically with the actor, mapping and receipt. An exact retry leaves a deliberately revoked grant revoked. An exit or ambiguous read without the required evidence leaves the effect unresolved. | **Supported on main with a scoped kind rehearsal.** Main calls for independent identity confirmation on the already-present branch. Draft SQL compares the singleton and matching external mapping with the reviewed identity digest. A replacement needs demonstrated scoped receipt and mapping reads for recovery and independent grant evidence for the initial transition, while keeping the subject private. Deployment owns wiring and qualification. The platform owns any missing product facts. [Platform bootstrap][bootstrap] · [Draft identity read][draft-sql] |
| `rebuild-current` | Match tenant and exact asset/property/version. On the quiesced fixture, expect a generation and revision increase of one and the expected semantic winner. Retain processed count and pending state. A verified unchanged snapshot under the same fence can show unchanged. Unexpected advances, wrong scope, lost fence or unavailable reads leave the effect unresolved. | **Pilot candidate.** The protected current-property GET provides generation, revision, processed count, pending state and the winner's semantic fields. Bind the HTTPS serving origin and exact request scope to the reviewed target and backend. Deployment supplies the database and image identity and proves that scoped reads work under the actual writer fence. The draft SQL exposes generation, revision, processed count and an opaque row digest. Only the three counters are directly comparable across the GET and draft SQL. The pilot must account for the draft probe's pending and winner coverage gaps. [Platform recovery][rebuild] · [Current property DTO][current-dto] · [Draft rebuild read][draft-rebuild-read] · [Pilot][139] |
| `register-calculator` | For the exact tenant/calculator/version, compare the immutable typed declaration parsed from the approved input, including implementation and both property/version references, with the persisted declaration. A matching prior declaration is already present. A changed implementation or property reference for the same key is a conflict. Whitespace and JSON key order leave typed equality intact. Missing or inconclusive independent evidence remains unresolved. | **Draft source.** Verify exact staged input bytes and their digest at admission. Draft SQL compares the persisted definition's typed fields for durable evidence. Deployment must identify a scoped read of that declaration. The platform owns any missing fact. Evidence for a calculator configuration or a later evaluation alone cannot show declaration parity. [Producer registration][register] · [Draft declaration read][draft-calculator-read] |
| `calculate-once` | Verify the exact prepared request/evaluation ID and terminal outcome, output count and expected ordered output identities and values. Distinguish preparation-only persistence from terminal commit, and match zero-output terminal results. A changed request under the same ID is a refusal. | **Draft source with candidate product reads.** Evaluation and output GETs provide terminal evidence, with no raw preparation read. A missing terminal result can still mean preparation persisted. Deployment must show exact request and preparation-only parity. The platform owns any demonstrated missing facts. [Producer evaluation][calculate] · [Evidence APIs][calculator-evidence] · [Draft preparation read][draft-calculator-read] |
| `reclaim-once` | Require a naturally aged verified archive, exact tenant/manifest/policy revision, recorded disposition, original member count, expected local payload clearing and verified retained bytes. Disabled, protected or denied leaves the bounded scope unchanged. An already-reclaimed result requires the matching prior receipt and retained bytes. | **Draft source awaiting installed evidence.** The platform supplies retention semantics. Draft SQL reads the receipt, clearing indicators and stored digest. The storage owner must supply separately read bytes and confirm their digest and reachability through qualified private storage. Deployment must demonstrate the exact policy, unchanged denial and positive/negative scoped grants. [Retention contract][reclaim] · [Draft retention read][draft-history-read] · [Private storage dependency][storage] |
| `summarize-once` | Bind the exact tenant/property/version, window/resolution, and presence or absence of restore manifest/generation selectors. Verify the exact persisted series and reported revision, coverage and expected numeric result, including absent-source refusal. A newer head alone cannot settle an ambiguous attempt. | **Draft source with a candidate product read.** Draft SQL reads the head or the exact series/revision when supplied, with a fingerprint and counts. The product GET selects the exact scope and returns its head, with continuation for the revision previously read. Deployment must show recovery of the exact persisted revision when the head moved, plus source selection and semantic result parity. Platform owns gaps in revision/source or result facts. [Numeric downsampling][summarize] · [Numeric summaries API][summaries-api] · [Draft summary read][draft-history-read] |
| `expire-history-once` | Check before/after whole bounded tenant fixture for correct restore/export expiry, cleared payloads, eligible export leases and live leases preserved. The two batches can commit separately. Distinguish partial from complete or unchanged. Record eligibility at the observed times. | **Draft source.** Draft SQL covers at most 32 restore and 32 export rows in the fixture. Existing status reads can supply individual lifecycle facts. Deployment must prove bounded inventory, payload/lease clearing and partial-state parity through supported reads. Platform owns missing lifecycle visibility. [Expiry contract][expire] · [Restore status][restore-status] · [Export status][export] · [Draft expiry read][draft-expire-read] |

## Proposed operator contract for the pilot

Use Helm and protected Argo CD for declared phases. Main ADR 0002 is Proposed.
The one-off Job boundary for this work comes from #137. The existing Workflow
remains the migration operation. Keep Job instances outside continuous
reconciliation and make qualification call the supported operator path.
The prospective read sources are the native Kubernetes API for execution and
the protected FleetIQ current-property GET for durable effect. Which existing
product or provider interface can present one usable read-only result from
those sources is an open deployment-owned gap. Before cutover, #139 must show
that the same scoped interface works for ordinary status and response-loss
recovery while the actual writer fence is in force. Prove reachability and
read-only authorization within the approved scope. If the pilot cannot show
this through an existing interface, record the gap in #139 and leave cutover
open.

[Main architecture ADR][adr-arch] · [Parent operator requirements][137]

1. **Preview once.** On a prepared and authorized target, present the immutable
   deployment, provider, publication, operation and input selections alongside
   current endpoint and target identities, named Job and grant, intended fixture
   and pre-state, routes, credential references, writer fence and deadlines. Review
   the exact provider render and its native server dry-run, the unused Job name,
   observer reachability, and withdrawal ownership. Report ready or refused
   with an actionable cause. Save the name, approved intent, identity and
   expected effects in private custody before create.
2. **Submit once.** Use the exact admitted native create under the named,
   bounded launcher identity. A verified response records the original Job UID.
   Retain a trusted denial as refused. Timeout, disconnect or ambiguous
   response goes directly to read-only recovery for this intent.
3. **Read status and recover the same attempt.** Use the same scoped read-only
   entry point for ordinary status and recovery. Reconfirm fresh target
   identity. Read the exact named Job in the reviewed namespace through the
   Kubernetes API. Correlate its original UID with the accepted response or
   independent accepted-create evidence when available. Check the attempt
   marker, creation time and approved envelope. List Pods by
   `batch.kubernetes.io/controller-uid`, verify the controller owner reference
   matches that Job UID, and read the exact owned Pod for container and image
   evidence. Independently read the durable state with FleetIQ's protected GET
   `/api/v1/tenants/{tenant_id}/assets/{asset_id}/properties/{property_id}/versions/{version}/current`
   under tenant `telemetry.read`. Use the same exact reviewed scope and HTTPS
   origin as the baseline. A lost response plus a missing, foreign, replaced or
   conflicting Job keeps the attempt unresolved. Keep the original Job
   available for reconciliation. For the pilot, independently record the
   accepted UID and one accepted create. [Draft Kubernetes reads][draft-recovery] · [Platform snapshot procedure][current-snapshot]

The draft sets a 300-second Job deadline, 60-second Pod termination grace and a
375-second observation bound from submission. Use the remaining part of that
bound on recovery, including a final exact Job read on timeout. The reviewed
client requests use 10-second Kubernetes request and 30-second SQL command
bounds. The platform current-property read has an 8-second database wait.
#139 must verify the final read and recovery limits for the chosen interface.
The shared migration guide has its own 900-second Workflow bound.

[Draft deadlines][draft-recovery] · [Provider envelope][provider-admission] · [Platform snapshot timeout][current-route] · [Main Workflow bound][main-migrate]

Return the attempt identity, evidence fingerprints and times, an execution
verdict (`refused`, `in progress`, `exited zero`, `failed`, or `unresolved`), and
a durable effect verdict (`committed`, `already present`, `unchanged`,
`partially committed`, or `unresolved` as applicable). Record `not attempted` for
a confirmed refusal before create was accepted. Each verdict records the
reason and the next owner action. Report withdrawal progress as a separate fact. A verified failed process may have a durable result. Missing or
stale evidence and contradictory reads are unresolved. Unavailable evidence
at the deadline goes to the deployment owner for review. Target, grant or Job
identity conflicts go to the provider. Missing durable facts go to the
platform owner once deployment has verified access, scope and reachability.
Retain the fence where required and the original evidence. Withdrawal follows
the provider's unused-or-terminal rule with all Pods accounted for. A fresh
attempt requires reviewed reconciliation and fresh approval.

Keep raw records in approved private off-cluster custody, with encrypted
off-host copies where retention requires them. Retain sanitized identities,
verdicts and evidence fingerprints for review. Keep credentials and raw
diagnostics out of Git and CI evidence. Unresolved attempts keep their records
and retained data for diagnosis. [Deployment recovery and receipt custody][deployment-recovery] · [Provider withdrawal][provider-withdrawal]

## Compare before and after

In #139, time and count target preparation, attempt preparation, submit,
ordinary observation, response-loss recovery, and withdrawal separately using
the same accounting above. Include operator commands, approvals, independent
checks, manual inputs and evidence assembly, access/authority handoffs, elapsed
time, operator help, and retained proof. Record check results and scopes. The
proposed target is one reviewed preview, one native create, one read-only status
and recovery path, zero manual receipt assembly, zero routine SQL/jq invocations
by the operator, zero undocumented help, and fewer commands and handoffs across
the full attempt. Use the draft source count as the comparison baseline and
label any missing measurement.

Exercise normal commit and deliberate post-acceptance response loss on a
separately authorized disposable Kubernetes target using published pins.
Compare unchanged, ambiguous, wrong tenant/input, stale target, foreign Job,
denial, unavailable evidence and failed withdrawal as appropriate. Bind the
accepted Job UID, Pod, expected image, grant, actual fence, reviewed input and
independent result.

In qualification only, compare generation, revision and processed count from
the protected GET against before and after reads of the draft SQL for the same
exact tenant/asset/property/version under the fence. Compare the winner's
presence, value, quality, event time and provenance against the exact approved
fixture. If needed, read the authoritative projection and source row fields
in qualification to verify those semantics. The draft SQL's opaque row digest
supports a within-SQL change comparison. It provides neither decoded winner
fields nor pending state. Record pending from the protected GET and verify it
against the fixture's committed queue state. Report the pending and winner
coverage gaps explicitly wherever the fixture and any supplemental reads
leave parity unproven. [Draft rebuild read][draft-rebuild-read] · [Platform snapshot procedure][current-snapshot]

Re-render the same ordinary provisioning profiles at the before/after
revisions with the same pinned inputs and tools. Compare the raw bytes across
local, provider-local and nonlocal Helm fixtures and both Kustomize overlays.
PR #131 and draft PR #136 record a 36-output comparison. Keep the existing
manifest and installation gates in the implementing slice. The composed
installed second-operator acceptance remains #114.

[Disposable pilot][139] · [Verification groups][verification] · [Installed handoff][114]

[100]: https://github.com/stanimirivanov/fleetiq-deploy/issues/100
[114]: https://github.com/stanimirivanov/fleetiq-deploy/issues/114
[121]: https://github.com/stanimirivanov/fleetiq-deploy/pull/121
[130]: https://github.com/stanimirivanov/fleetiq-deploy/pull/130
[131]: https://github.com/stanimirivanov/fleetiq-deploy/pull/131
[136]: https://github.com/stanimirivanov/fleetiq-deploy/pull/136
[120]: https://github.com/stanimirivanov/fleetiq-deploy/issues/120
[137]: https://github.com/stanimirivanov/fleetiq-deploy/issues/137
[138]: https://github.com/stanimirivanov/fleetiq-deploy/issues/138
[139]: https://github.com/stanimirivanov/fleetiq-deploy/issues/139
[resources]: https://github.com/stanimirivanov/fleetiq-deploy/issues/92#issuecomment-7071204249
[storage]: https://github.com/stanimirivanov/fleetiq-deploy/issues/108
[pin]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/environments/minimal-demo/backend.json
[main-migrate]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/docs/operations/minimal-demo-data.md#migration-and-grants
[main-bootstrap]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/docs/operations/minimal-demo-data.md#checked-operator-bootstrap
[main-manifests]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/tools/manifests/minimal-demo-data.mjs
[shared120]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/docs/operations/workload-database-identities.md#operate-the-upgrade
[workflow]: https://github.com/stanimirivanov/fleetiq-deploy/blob/d269d16a4d23169e34042a29cb594b66c08d6e22/operations/workload-database/base/workflow.yaml
[deployment-recovery]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/docs/architecture/kubernetes-gitops-deployment.md#release-contract-and-state-machine
[adr-db]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/docs/adr/0004-demo-environment-and-database-provisioning.md
[adr-arch]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/docs/adr/0002-kubernetes-gitops-target.md
[verification]: https://github.com/stanimirivanov/fleetiq-deploy/blob/ad56603bd1a60eeb2cbdecaeb4c05ff5437b7684/docs/development/verification.md
[draft]: https://github.com/stanimirivanov/fleetiq-deploy/commit/f381025a838eab9ae4f3375b3c0d89dc098d760a
[draft-guide]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/docs/operations/minimal-demo-administration.md
[draft-prep]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/docs/operations/minimal-demo-administration.md#prepare-the-handoff
[draft-recovery]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/docs/operations/minimal-demo-administration.md#recover-and-record
[draft-chart]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/charts/fleetiq-minimal-demo-operations/templates/operation.yaml
[draft-fixtures]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/tools/tests/minimal-demo-data.test.mjs
[draft-manifests]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/tools/manifests/minimal-demo-data.mjs#L334-L458
[draft-receipt-fixtures]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/tools/tests/minimal-demo-admin-receipt.test.mjs
[draft-receipt]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/operations/minimal-demo/administration/job-receipt.jq
[draft-execution]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/operations/minimal-demo/administration/job-receipt.jq#L128-L208
[draft-sql]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/operations/minimal-demo/administration/observe.sql
[draft-rebuild-read]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/operations/minimal-demo/administration/observe.sql#L68-L77
[draft-calculator-read]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/operations/minimal-demo/administration/observe.sql#L78-L98
[draft-history-read]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/operations/minimal-demo/administration/observe.sql#L99-L132
[draft-expire-read]: https://github.com/stanimirivanov/fleetiq-deploy/blob/f381025a838eab9ae4f3375b3c0d89dc098d760a/operations/minimal-demo/administration/observe.sql#L133-L168
[provider]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md
[provider-preflight]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/scripts/minimal_delegation.py#L267-L347
[provider-admission]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/scripts/minimal_delegation_policy.py#L283-L322
[provider-role]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/scripts/minimal_delegation_policy.py#L625-L640
[provider-withdrawal]: https://github.com/stanimirivanov/k8s-infrastructure/blob/db9f01b7db30a4a72581781af35c04f38f9a1ec7/docs/minimal-delegation.md#withdrawal-and-retained-state
[bootstrap]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/platform-bootstrap.md#L63-L80
[grants]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/postgres-runtime-grants.md
[rebuild]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/current-property-state.md#rebuild-and-recovery
[current-snapshot]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/current-property-state.md#snapshot-procedure
[current-route]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/crates/server/src/current_state.rs
[current-dto]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/crates/server/src/current_state/dto.rs
[register]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/calculator-registration.md
[calculate]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/calculator-once.md
[calculator-evidence]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/calculator-evidence.md
[reclaim]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/hot-retention.md
[summarize]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/numeric-downsampling.md
[summaries-api]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/contracts/http/openapi/paths/history/numeric-summaries.yaml
[expire]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/docs/operations/history-expiry-cleanup.md
[restore]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/contracts/http/openapi/paths/history/restore-request.yaml
[restore-status]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/contracts/http/openapi/paths/history/restore-status.yaml
[export]: https://github.com/stanimirivanov/fleetiq-platform/blob/c2135d3f77ef1150efbc7beeee8d160271822da7/contracts/http/openapi/paths/history/export-job.yaml
