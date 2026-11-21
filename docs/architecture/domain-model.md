# Installation domain boundaries

The [local glossary](../../GLOSSARY.md) owns release and qualification terminology;
[platform](https://github.com/stanimirivanov/fleetiq-platform/blob/main/docs/architecture/domain-model.md)
owns shared product meaning. The owner endorsed this scope on 21 November 2026.

| Boundary | Owner and evidence |
| --- | --- |
| Application meaning and HTTP contracts | Platform; exact producer artifacts are selected, not redefined |
| Browser runtime and presentation | UI; deployment qualifies the selected edge and same-origin composition |
| Synthetic records and acknowledgement observations | Simulator; installed processing needs independent evidence |
| Installation inputs and lifecycle | Deploy [local boundary](../../local/AGENTS.md) and [architecture](../../ARCHITECTURE.md) |
| Packaging and offline manifests | Deploy [chart boundary](../../charts/AGENTS.md) |
| Release admission and retained outcomes | Deploy [release contracts](../../contracts/releases/README.md) and [automation boundary](../../tools/releases/AGENTS.md) |
| Kubernetes substrate | Product-neutral infrastructure owner; deployment consumes qualified capabilities |

Artifact and contract compatibility is specific to selected producer/consumer
versions. Deployment provisions reviewed configuration and qualifies the assembled
system; it does not infer signal bindings, grant permissions or redefine business
meaning. Platform, UI and simulator each retain their own compatibility obligations.

Candidate selection, request, activation and receipt are distinct. Merging a
candidate cannot activate workloads. Validation establishes neither execution
authority nor runtime health; failure and recovery-required outcomes remain durable.
See [ADR 0003](../adr/0003-protected-rendered-activation-sources.md).

Protocol conformance, component compatibility, installed-product qualification and
hardware qualification answer different questions. A wire ACK does not alone prove
projection or browser visibility. A router accepting a notification does not prove
receiver delivery. Worker startup does not prove progress or health. See
[installed product qualification](../operations/installed-product-qualification.md)
and [analytics routing](../operations/analytics-notifications.md).

The simulator’s current product concurrency limit is a qualification constraint,
not a permanent application capacity promise. Retained receipts must name the
versions, environment and boundary tested. Existing ADRs and historical plan
proposals retain their identities and statuses; deployment does not ratify a
simulator-owned recovery policy merely by carrying an earlier planning copy.
