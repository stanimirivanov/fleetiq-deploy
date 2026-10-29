# FleetIQ deployment

Development and repository verification are supported on Linux.


Run the production FleetIQ web build, Rust backend and PostgreSQL through a
single local HTTPS origin. Only the edge publishes a loopback port.

## Start here

Requires Git, Node **24.18.0**, pnpm **12.5.1**, Docker with Linux containers,
and Docker Compose **5.5.1**.

```bash
pnpm install --frozen-lockfile
pnpm secrets:install
pnpm local sources
pnpm local build
pnpm local init
```

Configure the generated private files, register the OIDC callback, then start:

```bash
pnpm local up
pnpm local trust
```

Read [local installation](docs/operations/local-installation.md) before
configuring identity or importing the development CA. Credentials stay outside Git.
The default origin is **https://localhost:58443**; choose another free port
in the instance configuration. PostgreSQL port 5432 on your host is unaffected.

- [Architecture and trust boundaries](ARCHITECTURE.md)
- [Contributor workflow and verification](CONTRIBUTING.md)
- [Documentation map](docs/README.md)
- [Delivery plan and qualification boundary](docs/exec-plans/active/m02-development-installation.md)
- [Kubernetes package contracts and offline preview](docs/operations/kubernetes-packages.md)
- [Kubernetes GitOps delivery plan](docs/exec-plans/active/kubernetes-gitops-deployment.md)
