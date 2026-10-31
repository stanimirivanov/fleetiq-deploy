# FleetIQ runtime chart

Reusable HTTP backend and production UX edge behind a trusted HTTPS Gateway.
Defaults intentionally fail until required inputs are provided. See
[package contracts](../../docs/operations/kubernetes-packages.md) for ownership,
trust, credentials and qualification limits; values.schema.json owns input types.

- Digest-addressed backend/edge images; no environment-specific UI rebuild.
- Backend serve --check-schema, health probes and explicit shutdown grace.
- Existing database/OIDC Secret and public CA ConfigMap references only.
- Restricted application Pods, private Services and explicit network allow rules.
- maintenance=true stops both application Deployments without deleting data.
- profile=nonlocal requires two or more replicas of each application component.
- public.port and gateway.listenerPort distinguish browser and provider listener ports.
- gateway.ingressMode=cilium adds an edge-only reserved-ingress identity allow.
- Trusted OIDC egress derives its port from the configured HTTPS issuer URL.

The offline local-preview values are fixtures, not a release selection. No
migration, operator bootstrap, CRD/controller installation or Helm hook occurs.
The chart assumes its selected namespace is dedicated to FleetIQ.

Optional analytics workers and private notification routing are disabled by default.
See [configuration and qualification](../../docs/operations/analytics-notifications.md).
