# PROTOTYPE — from simulator movement to an owner verdict

## TL;DR

Review this document's usability and evidence format. It is a throwaway planning
artifact, **not a runnable guide or evidence that FleetIQ works**. No observations
below were collected. Exact Kubernetes launcher commands, UI labels and timeouts
must be supplied and verified in implementation PRs before publication.

Question: can an owner follow one chapter, locate evidence, distinguish technical
success from product suitability, and resume after a failure without an agent?

Context: [chapter-format decision](https://github.com/stanimirivanov/fleetiq-deploy/issues/88)
and [approved scenarios](https://github.com/stanimirivanov/fleetiq-deploy/issues/87#issuecomment-7070749881).

## Proposed documentation home

| Material | Authoritative owner | How this walkthrough uses it |
| --- | --- | --- |
| Install, chapter order, prerequisites, actions spanning services, evidence and resume | fleetiq-deploy | One offline entry point and numbered chapter pages |
| Screen navigation, controls and browser behavior | fleetiq-ui guide | Pinned guide sections bundled into the offline documentation; linked from steps |
| Product meaning, permissions and API/CLI contracts | fleetiq-platform | Pinned references, not duplicate definitions |
| Scenario inputs, transport and playback semantics | fleetiq-simulator | Named run manifest and pinned instructions |
| Cluster lifecycle and substrate operations | k8s-infrastructure | Pinned operational references |
| Human outcomes and gap decisions | Private per-attempt Markdown record | References to private evidence and sanitized issue links |

The release's offline documentation bundle records source revisions and copies
referenced content for access, without becoming a separately edited authority.
Synthetic UI previews are labelled **preview / not installed verification** and
cannot satisfy chapter acceptance. No new interactive documentation app is proposed.

## Chapter C03 — watch one vehicle move and inspect its evidence

**Purpose:** decide whether the installed system lets you understand where a
simulated vehicle is and trace the displayed position back to its input.

**Place in journey:** after installation, login and commissioning; before the
three-vehicle and advanced chapters. Approximately five minutes of playback plus
observation time, within the proposed 20–30 minute core. These are unmeasured targets.

**You will change:** append telemetry for the selected demo asset and create an
attempt record. You will not reset the installation or rewrite earlier evidence.

**You will retain:** simulator checkpoint, product history and private evidence.

### Before you start

- [ ] The installed-release receipt identifies reviewed images, sources and configuration.
- [ ] The isolated browser trusts the demo CA and opens the canonical HTTPS origin on port 18443.
- [ ] Sign-in and commissioning chapters passed for this tenant, asset and device.
- [ ] The selected persona has the explicit grants required by this chapter.
- [ ] The admitted protocol route and exact latitude/longitude bindings are recorded.
- [ ] The pipeline is ready by its documented progress checks, not just pod status.
- [ ] The Sofia map pack, attribution and route coverage checks passed.
- [ ] A new run has a recorded epoch, seed, route, scenario hash and attempt ID; or an explicitly selected retained run is being resumed.

If a prerequisite is missing, record **blocked** and its cause. Do not start a
new run to hide a previous failure. Permission/commissioning blockers affect this
chapter; unrelated documentation or already independent exercises may continue.

### Attempt header

| Field | Value to record |
| --- | --- |
| Attempt / chapter | Local attempt ID / C03 |
| Started / ended | UTC timestamps, with local display timezone noted |
| Installation / release | Private owned-target reference and reviewed release receipt |
| Actor / tenant / asset | Private local references; sanitized aliases in shared reports |
| Simulator run | Manifest/checkpoint reference, new or resumed, seed and starting epoch |
| Map / documentation | Artifact identities and source-revision manifest |
| Prerequisites | Links to successful attempts or explicit outstanding blockers |

### Do, observe, stop

Each numbered step ends with an observation stop. Continue when you have inspected
and recorded the result; this does not pause every background process.

| Step | Your action | Expected observation and boundary | Evidence to retain |
| --- | --- | --- | --- |
| 1. Establish context | Open the installed fleet view, select the agreed tenant and commissioned asset. | The selected identity and tenant scope match the attempt. Existing values may be absent or older; neither is proof the new run worked. | Private context reference and starting observation |
| 2. Start playback | Invoke the reviewed launcher for the selected single-device real-time run. **Launcher command is not implemented in this prototype.** | The launcher identifies the selected scenario/run and bounded execution. It emits movement, stop and movement phases. | Run manifest and bounded producer receipt |
| 3. Inspect movement | Observe the asset on the map during the driving and stop phases. | New positions appear inside the prepared map coverage. The observed phase agrees with the scenario. Smooth animation is not assumed by this contract. | Timestamped browser observations with selected record references |
| 4. Trace a position | Open the selected coordinate/property inspection and its history/provenance. **Exact UI labels are to be checked against the selected UI revision.** | Value, device event time and provenance agree with the generated record and configured binding. A visually plausible point alone is insufficient. | Correlated generated-record, accepted-message, binding and property references |
| 5. Inspect progress | Compare producer, durable acceptance, semantic/projection and browser evidence for the selected record. | Each required boundary is established independently. An ACK alone is not durable or browser acceptance. | Sanitized boundary receipts; private detailed evidence where needed |
| 6. Finish this attempt | Let the bounded run finish; record technical outcome and your verdict below. | Completion does not clear history/checkpoints or overwrite prior attempts. | Completed attempt record and any gap links |

**Publication gate:** replace every action placeholder with a tested command or
pinned guide anchor, including acting persona, required permission and expected
response. Never publish an executable-looking invented command or an undocumented
credential substitution. The walkthrough must be usable without an agent.

### Bounded observation and diagnostics

The published chapter must specify an actual timeout for each asynchronous boundary,
derived from configured intervals and measured qualification. **No timeout value
has been measured for this prototype.** An unset timeout blocks publication.

| Symptom | First evidence to inspect | Record / progression |
| --- | --- | --- |
| Producer cannot connect or receive the expected ACK | Admitted target, producer receipt and ingestion diagnostics | Failed attempted step; do not infer the server's rejection reason from a timeout |
| ACK exists, but no durable accepted record can be established | Correlated ingestion/durability evidence | Failure at that boundary; dependent property/browser claims stay unverified |
| Accepted record exists, but no attributed property | Replay/semantic progress and exact binding inputs | Preserve evidence; do not repair history by direct database edits |
| Property exists, but the browser point is missing or stale | Projection/live delivery, browser response and coordinate mapping | Isolate the first unmet boundary; investigate UI only with supporting evidence |
| Map tiles are absent | Pack manifest, local asset requests and geographic/zoom coverage | Record missing/corrupt/unsupported coverage; no internet fallback |
| A required prerequisite cannot be established | Prerequisite attempt and its blocker | Block this chapter; continue independent safe chapters only |

Do not silently extend timeouts or retry until green. A deliberate retry gets a
new attempt ID linked to the previous failure and the reason for retrying.

### Resume and cleanup

For a short interruption, select the same retained run and unchanged inputs using
the reviewed resume procedure. Simulator downtime pauses scenario time; it is not
a claim that wall-clock freshness is preserved. After a long interruption, choose
an explicit fresh run for live observations and retain the old attempt.

Ordinary stop retains the owned state. Cleanup/reset is a separate explicit
operation naming its affected data, not a chapter completion action. Never attach
private keys, cookies, authorization headers or unsanitized diagnostics to an issue.

## Product-verdict record — copy once per attempt

```markdown
# Attempt <local-id> — C03

- Installation/release receipt: <private reference>
- Run/scenario/map/doc identities: <references>
- Start/end UTC; new run or resumed: <values>
- Prerequisites: <attempt references or blocker>
- Technical outcome: <passed | failed | blocked>
- Reason and first unmet boundary: <specific observation; none if passed>
- Owner verdict: <matches intent | needs change | undecided>
- Why / intended behavior: <owner's words>
- Boundary evidence: <generated, ACK, durable, semantic/projection, browser refs>
- Retry/resume relationship: <previous attempt and reason, or none>
- Required follow-up: <action or none>
- Dependent chapters blocked: <named chapters, or none>
- Retained state / cleanup performed: <references and action, or none>

## Gaps (zero or more)

| Gap | Class | Expected / actual | Reproduction and evidence | Owner | Existing/new issue |
| --- | --- | --- | --- | --- | --- |
| <id> | <defect / missing functionality / usability / documentation / blocked verification> | <difference> | <refs> | <repo; unknown pending triage if unsupported> | <link or not yet filed> |
```

A passed technical result requires all mandatory chapter observations and evidence.
A failed result means an attempted required behavior did not meet its expectation.
Blocked means a prerequisite prevents reaching the required check. If some steps
ran before a block, retain their results; do not promote the chapter to passed.
An owner may remain undecided after a technical pass. A failure can have an
undecided product verdict because behavior could not be assessed.

Keep step execution state separate from those outcomes: **not started, in progress,
complete**. An unexecuted next-day check is not a technical pass or a fabricated
failure. Completion requires an outcome; blockers can leave follow-up outstanding.

## Fictional examples — format demonstration only

**Example A: technically passed, needs change.** All required coordinate/provenance
checks succeeded in this invented example. The owner says, “I cannot tell when this
position was last updated.” Record a usability gap for triage with the UI owner;
no claim is made that the current UI has this defect. Do not change the technical
result simply to make it agree with the verdict.

**Example B: failed observation, dependent work blocked.** An invented attempt has
an ACK but cannot establish durable acceptance before its documented timeout.
Record failure at that boundary; downstream map/analytics verification is blocked.
The owner verdict is undecided. Preserve diagnostics and investigate; do not assign
a root cause from the ACK alone. No real failure or issue is asserted here.

**Example C: next-day follow-up outstanding.** Archive publication passed in an
invented first-day attempt, but the manifest is not yet eligible for reclamation.
If early rejection is the expected check, that check can pass. The separate aged
reclamation/restore exercise remains not started, with its actual eligibility check
required before execution. The overall lifecycle chapter is not fully verified.

## Completion report sketch

| Baseline capability | Chapter / attempt | Execution state | Technical outcome | Owner verdict | Evidence / gap |
| --- | --- | --- | --- | --- | --- |
| Current/history/map evidence | C03 / <id> | <state> | <outcome or not yet assessed> | <verdict> | <refs> |
| Aged reclamation and restore | Lifecycle / <id> | Not started | Not yet assessed | Undecided | Natural-age follow-up outstanding |
| Every other baseline capability | <chapter / id> | <state> | <outcome or not yet assessed> | <verdict> | <refs> |

The real report must expand every capability; the final row is a prototype
placeholder, not an acceptable catch-all. Separate completion from owner approval:
a fully executed walkthrough can still yield needs-change verdicts and open gaps.

## Review decisions requested

1. Is the linear **do → observe → stop**, with diagnostics below, usable enough?
2. Should one private Markdown record per attempt, linked to machine receipts,
   be the authoritative human verdict rather than introducing a tracking app?
3. Does the documentation ownership/offline bundle arrangement avoid duplication
   while making the walkthrough self-contained for you?

No outcome has been validated by the owner yet. Preserve this prototype on a
throwaway branch and record feedback on the chapter-format decision before closure.
