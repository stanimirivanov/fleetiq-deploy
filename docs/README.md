# Documentation map

- [Architecture](../ARCHITECTURE.md): service and trust boundaries.
- [Packaging decision](adr/0001-local-composition.md): source and image authority.
- [Local installation](operations/local-installation.md): setup, identity, trust,
  bootstrap, lifecycle and recovery.
- [Verification](development/verification.md): deterministic checks and evidence.
- [Kubernetes packages](operations/kubernetes-packages.md): reusable charts,
  offline preview, credentials, networking and retention boundaries.
- [Local Kubernetes prerequisites](operations/local-kubernetes-prerequisites.md): qualified-provider package compatibility, publication order and remaining D06 live gates.
- [Release packages](operations/release-packages.md): immutable OCI publication,
  producer verification and separate candidate/promotion contracts.
- [D06 readiness](operations/d06-readiness.md): current provider/publication
  blockers and [focused provider handoff](handoffs/k8s-infrastructure-d06-unblock.md).
- [Kubernetes delivery plan](exec-plans/active/kubernetes-gitops-deployment.md): D01-D14 sequence and provider prerequisites.
- [Active delivery plan](exec-plans/active/m02-development-installation.md):
  scope, remaining browser qualification and acceptance.
- [Completed work](exec-plans/completed/README.md): completed-plan convention.
- [Security reporting](../SECURITY.md): private reporting and credential handling.
