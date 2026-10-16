# M02: Complete development installation (original plan PR 11)

## Goal and ownership

Compose pinned platform/UX artifacts under local HTTPS in fleetiq-deploy.
Issue #1 owns packaging, safe configuration, installation operations and its
progressively discoverable validation harness.

## Acceptance

- Production UX and real backend/PostgreSQL compose at one loopback HTTPS origin.
- Backend/database are private; application containers have restricted roots,
  users and capabilities.
- Config, secret material and image provenance fail closed.
- Real qualification verifies TLS, routing, readiness, persistence, proxy semantics,
  outage recovery and owned cleanup.
- PR-only CI runs the same structural and Docker checks.
- Operations cover trust, bootstrap, restart, rollback limitations and credentials.

Record actual verification evidence in the PR; move this plan to completed when
its implementation and required local checks pass.

## Next slice: original PR 12, M04

Qualify real browser sign-in, tenant selection, metadata read/commands, logout,
CSRF, expiry/revocation and cross-tenant authorization using POM browser tests
and a controlled HTTPS OIDC provider. Resolve trusted private-provider CA support
with the backend first. Infrastructure-only identity mode and synthetic proxy
probes do not fulfill those criteria.
