# Installed history lifecycle qualification

Run from a clean reviewable checkout with the pinned Node, pnpm and Linux Docker
Compose tools. Use the existing installation and product gates.

```sh
pnpm check
pnpm local sources
pnpm local build
pnpm qualify
pnpm qualify:product
```

The installed product uses a local backend build from the reviewed platform
revision and pulls the published UX by digest. The platform revision
`d4509837f17aa06dc1e7b7c7db61df09853e3cba` was qualified and published for
Linux AMD64 at digest
`sha256:742b2dd37f714935c39f3a03898ada451939cfb2f4b7b959bfd817aa889ff8db`.
The local backend build has its own image identity. The current UX digest and
publication receipt are in the [reviewed edge record](../../charts/fleetiq-runtime/qualified-edge.json).

The product gate uses a disposable PostgreSQL database and pinned RustFS on
backend loopback. The provider and signed fault client receive only generated
storage inputs. The worker starts with separate storage and database files.
No S3 port is published. The gate removes the owned containers, networks and
volumes after success or failure.

The lifecycle tenant contains two synthetic interpretations. The publisher
alone uses a disposable database clock eight days behind to exercise the
seven-day receipt-age policy. The reclaim command, browser, and other workers
use the normal database clock. The gate interrupts a claimed publication,
restarts on the same manifest, and checks its object digest and exact membership.
A provider outage and same-length corruption each leave zero reclamation
receipts and zero cleared timestamps. With original bytes restored, the explicit
command clears the old payload and reconciles its exact retry during an outage.

The browser requests restore while storage is paused. The first attempt stages
no bytes. Retrying the same generation after recovery restores exact value,
binding, source and first-resolution evidence with selected-manifest coverage.
The browser downloads the restored Parquet export and checks authorization again
after telemetry access is revoked.

Read the product evidence under `.verification/` for the archive reservation,
object and staging byte counts, restore attempts, remaining logical work and
cleanup result. The lifecycle tenant allows three jobs and 8 MiB of work. The
segment and download each have a 2 MiB cap. These measurements describe the
synthetic workload and logical accounting. Production capacity and physical
allocation need separate measurements.
