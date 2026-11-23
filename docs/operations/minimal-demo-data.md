# Minimal-demo PostgreSQL candidate

Render the candidate offline with the deployment's pinned Node, pnpm and
manifest tools. Use the consumer from the [private network composition](minimal-demo-network.md).
The approved budget sets a 256 MiB request, a 768 MiB limit, 64 connections and a
4 GiB claim on the provider's retained StorageClass. These are qualification
targets. [Approved resource ledger](https://github.com/stanimirivanov/fleetiq-deploy/blob/75b65e1f7dab9b04e3c3e586797ff7cce15970b3/docs/capacity/minimal-demo-candidate-ledger.md)

```sh
pnpm install --frozen-lockfile
pnpm manifests:install
pnpm manifests:check
umask 077
pnpm --silent minimal-demo:data:render qual-fleet > /private/data-candidate.json
```

The explicit renderer records the Cluster, schema result, fingerprint, platform pin
and calculated pool budget. It also records the reviewed backend selection. The default manifest receipt records resource and
schema counts, the fingerprint and execution state. `execution: not-performed`
identifies offline evidence. The Cluster contains a synthetic image and a placeholder migration
Secret reference. Keep this output for review and use the supported release flow
when an installable selection is available. The candidate has no managed runtime
logins or legacy chart network policies. The data namespace, PostgreSQL network
routes and retained StorageClass come from [private networking](minimal-demo-network.md)
and [provider delegation](https://github.com/stanimirivanov/k8s-infrastructure/blob/0d92be31e9c6a538bb9c2e69175deec2ec2f5089/docs/minimal-delegation.md).

The pinned producer's resident pool ceilings total 34, with another two for the
archive worker. The conservative budget adds two for one recurring operation.
That sum of 38 leaves 26 of the configured 64 for nonproduct uses. The
candidate configures zero regular reserved slots and three superuser-reserved
slots. Run at
most one administrative operation at a time and fence both the simulator and
the archive worker for its duration. Check the individual pools in the render
receipt and account for actual PostgreSQL reserved slots, controller and health
traffic during managed maintenance.
Initial checked bootstrap inherits SQLx's 10-connection ceiling, and migration
has a ceiling of one. Run these installation operations serially with product
writers fenced. [Serving pool](https://github.com/stanimirivanov/fleetiq-platform/blob/c0d71a56dad0596d3c6a6b866e4338d25b597af2/crates/server/src/runtime.rs#L52),
[bootstrap pool](https://github.com/stanimirivanov/fleetiq-platform/blob/c0d71a56dad0596d3c6a6b866e4338d25b597af2/crates/server/src/bootstrap.rs#L124),
[migration pool](https://github.com/stanimirivanov/fleetiq-platform/blob/c0d71a56dad0596d3c6a6b866e4338d25b597af2/crates/server/src/migration.rs#L64),
[SQLx pool defaults](https://docs.rs/sqlx-core/0.9.0/src/sqlx_core/pool/options.rs.html#151)

## Grant contract and installed evidence

The [minimal-demo backend selection](../../environments/minimal-demo-candidate/backend.json)
pins the published image, exact platform revision, workflow artifact digest,
migration inventory, and PostgreSQL grant contract. The grant contract’s
ledger head matches the published image inventory. Use the producer contract
for the replay-to-semantic and semantic-to-projection writes that occur with the
caller’s privileges. [Publication run](https://github.com/stanimirivanov/fleetiq-platform/actions/runs/45174819423),
[platform grant contract](https://github.com/stanimirivanov/fleetiq-platform/blob/c0d71a56dad0596d3c6a6b866e4338d25b597af2/docs/operations/postgres-runtime-grants.md)

Use the [scoped roles and installed probe](minimal-demo-database-roles.md) to
render the installation phases and collect target-bound database evidence.
The offline PostgreSQL fixture retains its placeholder image and Secret.
Legacy Compose source locks and protected environment selections each have
their own review and rollout path.
