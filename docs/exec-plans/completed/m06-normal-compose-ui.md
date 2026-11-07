# Reviewed M06 UI in normal Compose

Deployment issue #51 advances the local source pin to the same reviewed UX
revision as the immutable edge publication. Normal Compose continues to build
and serve the UI with its own Caddy packaging. The chart continues to use
the separately published NGINX image. The local static matcher handles compiled
resources while /assets/<id> uses the SPA fallback.

The installed-product gate starts both edge images. A separate Chromium
instance resolves the existing fixture origin to the local Caddy edge,
signs in through the real disposable OIDC issuer and opens a property history
deep link. The test checks the responding address, exact history value, and
restore and export controls. Only the fixture hostname and TLS certificate
differ from the normal Caddy routing file. The normal installation gate
separately checks the standard localhost TLS and runtime routing.

Use `pnpm local sources` followed by `pnpm local build` to update a local
installation's source-built image. The verification gates are `pnpm check`,
`pnpm qualify` and `pnpm qualify:product`.
