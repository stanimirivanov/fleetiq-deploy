# M05-PR16: optional analytics and notification packaging

Issue: #35. Producer dependency: platform PR 378 (PR15 exact source pin).

- Package disabled-default analytics-worker/notification-worker and private router.
- Keep source/image pins explicit, secrets mounted, process health claims distinct.
- Extend closed Helm schemas, native rendering, maintenance and scoped networking.
- Add an isolated real-router/synthetic-receiver qualification to pnpm qualify.
- Document migration order, grants, ephemeral router cache and retained outbox.
- Run pnpm check, pnpm manifests:check and pnpm qualify; inspect their receipts.

No live Kubernetes apply, customer recipient or production HA is in scope.
PR20 owns installed telemetry-to-alert-to-receiver qualification. Keep this plan
active while Docker qualification or the producer dependency remains incomplete.
