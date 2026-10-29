# Documentation map

- [Architecture](../ARCHITECTURE.md): service and trust boundaries.
- [Packaging decision](adr/0001-local-composition.md): source and image authority.
- [Local installation](operations/local-installation.md): setup, identity, trust,
  bootstrap, lifecycle and recovery.
- [Installed product qualification](operations/installed-product-qualification.md): real disposable HTTPS/OIDC, Teltonika TCP, browser evidence and owned cleanup.
- [Verification](development/verification.md): deterministic checks and evidence.
- [Kubernetes packages](operations/kubernetes-packages.md): reusable charts,
  offline preview, credentials, networking and retention boundaries.
- [Local Kubernetes prerequisites](operations/local-kubernetes-prerequisites.md): qualified-provider package compatibility, publication order and remaining D06 live gates.
- [Release packages](operations/release-packages.md): immutable OCI publication,
  producer verification and separate candidate/promotion contracts.
- [D06 readiness](operations/d06-readiness.md): observed publication runs, current
  blockers and persistent-target review inputs. The [earlier provider handoff](handoffs/k8s-infrastructure-d06-unblock.md) is historical.
- [Registered Argo sources](operations/argo-source-graphs.md): role-isolated control graphs, locked-ref verification and live-admission limits.
- [Auth0 onboarding](operations/auth0-onboarding.md): confidential application, user connection, private credential handoff and initial operator mapping.
- [D06 host preparation](operations/d06-host-preparation.md): operator-run disk, hostname and standard local TLS setup.
- [D06 staged approval](operations/d06-installation-approval.md): validated bootstrap package, actual provider placement, foundation proposal and application-release hold points.
- [Exact D06 target review](operations/d06-target-preview.md): confirmed non-AppData state path, native preview replay, host observations and remaining installation prerequisites.
- [D06 qualification preparation](operations/d06-qualification.md): proposed retained target, initial delegation, capacity review and ordered live acceptance gates.
- [Kubernetes delivery plan](exec-plans/active/kubernetes-gitops-deployment.md): D01-D14 sequence and provider prerequisites.
- [Active delivery plan](exec-plans/active/m02-development-installation.md):
  scope, remaining browser qualification and acceptance.
- [Completed work](exec-plans/completed/README.md): completed-plan convention.
- [Security reporting](../SECURITY.md): private reporting and credential handling.
