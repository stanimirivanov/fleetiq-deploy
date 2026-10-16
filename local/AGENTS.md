# Installation constraints

Read [architecture](../ARCHITECTURE.md) and
[operations](../docs/operations/local-installation.md) before changing composition.

- All external images use reviewed manifest digests; application source uses full
  commit IDs. Runtime application image IDs must match verified build provenance.
- Publish the edge on loopback only. No backend/database host ports or Docker
  socket mounts. Preserve separate application/database networks.
- Keep normal browser identity complete and fail closed. The qualification
  override removes all identity settings, rather than passing empty values.
- Secrets enter as private mounted files. Never place them in Compose YAML,
  interpolation values, example settings, image layers or build arguments.
- Do not modify sibling source checkouts. Changes to upstream contracts need a
  separate application PR and an explicit source pin update.
- Run structural checks and real Docker qualification for all changes here.
