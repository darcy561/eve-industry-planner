# Migration plans

## Owns

Decision/history/work logs for long-running migrations. **Not SoT.**

## Does not own

- Live contracts → promote into [frontend/](../frontend/contents.md), [backend/](../backend/contents.md), [stack/](../stack/contents.md), or [deployment/](../deployment/contents.md) only when a project is complete and promotion is approved (see [documentation-rules.md](./documentation-rules.md))

## Task map

| I need to… | Read |
|------------|------|
| Websocket realtime — promote verified behaviour, then retire | [websocket-realtime/contents.md](./websocket-realtime/contents.md) |
| Entity id encryption (entity refs, entitlements snapshot) | [entity-id-encryption/contents.md](./entity-id-encryption/contents.md) |
| Swarm stack migration (**closed** — history; live SoT promoted) | [swarm-stack/contents.md](./swarm-stack/contents.md) |
| Changestream tenant scale (publisher queues / metrics / future auto-detect) | [changestream-tenant-scale/contents.md](./changestream-tenant-scale/contents.md) |
| Shared packages `go fix` cleanup (**closed** — history; Tier 4 omit tags waived) | [shared-go-fix/contents.md](./shared-go-fix/contents.md) |
| Archived jobs statistics (rollups, snapshots, corp aggregation) | [archived-jobs-stats/contents.md](./archived-jobs-stats/contents.md) |
| Collection naming (**promoted** — history; live SoT in [backend/shared/mongo.md](../backend/shared/mongo.md)) | [collection-naming/contents.md](./collection-naming/contents.md) |
| Go 1.27 adoption (json/v2, simulated-time tests, `go fix` sweep) | [go-127-adoption/contents.md](./go-127-adoption/contents.md) |
| Service library modules (split `shared/` into local `eip/*` modules; build per closure) | [service-library-modules/contents.md](./service-library-modules/contents.md) |
| NATS rebuild (bus handle, typed messages, stream specs, scheduled messages) | [nats-rebuild/contents.md](./nats-rebuild/contents.md) |
| Service import boundaries (stop services importing each other) | [service-import-boundaries/contents.md](./service-import-boundaries/contents.md) |
| Cron scheduler rewrite (one declaration per job, downtime deferral, gocron's future) | [cron-scheduler-rewrite/contents.md](./cron-scheduler-rewrite/contents.md) |
| Task dispatch (task type authority, envelope collapse, operator CLI) | [task-dispatch/contents.md](./task-dispatch/contents.md) |
