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
and calculated pool budget. The default manifest receipt records resource and
schema counts, the fingerprint and execution state. `execution: not-performed`
identifies offline evidence. The Cluster contains a synthetic image and a placeholder migration
Secret reference. Keep this output for review and use the supported release flow
when an installable selection is available. The candidate has no managed runtime
logins or legacy chart network policies. The data namespace, PostgreSQL network
routes and retained StorageClass come from [private networking](minimal-demo-network.md)
and [provider delegation](https://github.com/stanimirivanov/k8s-infrastructure/blob/0d92be31e9c6a538bb9c2e69175deec2ec2f5089/docs/minimal-delegation.md).

The pinned producer's resident pool ceilings total 34, with another two for the
archive worker. The conservative budget adds two for one recurring operation.
That sum of 38 leaves 26 of the configured 64 for nonproduct uses. Run at
most one administrative operation at a time and fence both the simulator and
the archive worker for its duration. Check the individual pools in the render
receipt and account for actual PostgreSQL reserved slots, controller and health
traffic during managed maintenance.
Initial checked bootstrap inherits SQLx's 10-connection ceiling, and migration
has a ceiling of one. Run these installation operations serially with product
writers fenced. [Serving pool](https://github.com/stanimirivanov/fleetiq-platform/blob/a40217ae14c467ec91de163e46ced68590731f6b/crates/server/src/runtime.rs#L52),
[bootstrap pool](https://github.com/stanimirivanov/fleetiq-platform/blob/a40217ae14c467ec91de163e46ced68590731f6b/crates/server/src/bootstrap.rs#L124),
[migration pool](https://github.com/stanimirivanov/fleetiq-platform/blob/a40217ae14c467ec91de163e46ced68590731f6b/crates/server/src/migration.rs#L64),
[SQLx pool defaults](https://docs.rs/sqlx-core/0.9.0/src/sqlx_core/pool/options.rs.html#151)

## Grant contract and installed evidence

The pinned platform publishes the bootstrap and migration-ledger rights. The
platform must publish and verify the remaining per-command runtime privileges
before deploy can provision them. The exact contract must account for the
decoded-output trigger writing semantic work and the semantic-output trigger
writing projection work with the caller's privileges. Review and publish the
producer result and select its immutable artifact in a separate deployment pin
update. [Platform runtime contract](https://github.com/stanimirivanov/fleetiq-platform/blob/a40217ae14c467ec91de163e46ced68590731f6b/docs/operations/runtime-and-migrations.md#database-roles-and-first-installation),
[semantic handoff](https://github.com/stanimirivanov/fleetiq-platform/blob/a40217ae14c467ec91de163e46ced68590731f6b/migrations/0035_durable_semantic_work.sql#L93),
[projection handoff](https://github.com/stanimirivanov/fleetiq-platform/blob/a40217ae14c467ec91de163e46ced68590731f6b/migrations/0037_current_property_projection.sql#L99)

The installed gate remains pending under [#96](https://github.com/stanimirivanov/fleetiq-deploy/issues/96).
It needs a reviewed installable selection and separate execution authorization for
one positively identified disposable target. Collect the exact candidate, image,
Cluster and claim identities, effective memory and connection settings, role and
ledger checks, live pool peaks, and authenticated commissioning evidence. For
retention, verify a bounded commissioned observation before and after the
authorized restart and compare the claim and volume identities. Preserve
the installed data and sanitized evidence if any check fails. A failed schema
mutation requires reviewed recovery before product writers restart. [Installation
acceptance](https://github.com/stanimirivanov/fleetiq-deploy/issues/89#issuecomment-7071307181)
