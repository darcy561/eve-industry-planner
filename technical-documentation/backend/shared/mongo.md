# Mongo access (`services/shared/mongo`)

Live SoT for the shared Mongo handle used by api, worker, core, and websocket. Package: [`services/shared/mongo`](../../../services/shared/mongo). Multi-collection writers: [`services/shared/mongo/writers`](../../../services/shared/mongo/writers).

Stack image / data fragment → [stack contents](../../stack/contents.md). Day-2 ensure → [deploy.md](../../deployment/deployment-tool/cli/deploy.md) (`eip ensure-mongo`). API handler wiring → [deps.md](../api/deps.md). Worker task bag → [worker.md](../worker/worker.md).

## Defaults

| Piece | Default | Change |
|-------|---------|--------|
| Driver | `go.mongodb.org/mongo-driver/v2` | `services/go.mod` |
| Database name | pinned in package (`DatabaseName`) | `services/shared/mongo` |
| Connect (shared creds) | `ConnectPrimary` | URL from config / secrets |
| Connect (API prefer) | `ConnectAPI` | optional `MONGO_*_API` with shared fallback |
| Boot connect attempts | `5` × 5s delay | `services/shared/mongo/connect.go` |
| Client timeouts / pool | connect/serverSelection/timeout 10s; max pool 10; min 1; heartbeat 10s | same |
| Retry writes / reads | enabled on client | same |
| BSON | `DefaultDocumentM` + otelmongo monitor | same |
| Operation retry | `Retry` — 3 attempts, 100ms → 2s backoff | `services/shared/mongo/retry.go` |

Role-specific CSOT / pool splits are not configured; all roles share the connect helpers above.

## Wiring

```text
stackservices.Connect* ──► Clients.Mongo (*eipmongo.Mongo)
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   apideps.Deps          TaskDependencies     Server / core bags
   (API handlers)        (worker tasks)       (composition root)
         │                    │
         ▼                    ▼
   Docs fields / writers / eipmongo.Retry
```

Composition root opens Mongo via `stackservices`. API handlers use `apideps.Deps`; worker tasks use `TaskDependencies`. Websocket keeps `Server.Stack`; core keeps `*stackservices.Clients` at the composition root.

## Handle surface

Type **`Mongo`**: one driver client, pinned database, named **`Docs`** fields (not methods), plus `Bulk()` for client bulk writes.

| Field | Role |
|-------|------|
| `JobDocuments` | Planner job docs (`user_job_documents`) — hot API path |
| `Jobs` | Distinct jobs collection — **not** the job-docs API |
| `Users` / `ApplicationSettings` / `Groups` / `ArchivedJobs` / `BuildStats` | Account and archive surfaces |
| `TemplateCatalog` / `TemplatePayloads` | Group templates |
| `Blueprints` / `CitadelNames` / `WatchlistDeprecated` | Supporting collections |

Same-collection reads/writes go through Docs helpers (many already wrap `Retry`). Cross-collection units go through **`writers`** (`RunOrdered` / `RunUnordered` own `Retry`) — do not assemble client `Bulk()` in HTTP handlers.

`Collection()` returns the raw driver collection for call sites that build bulk models or one-off queries; prefer Docs/writers when a helper exists.

## Errors & retry

- Prefer `errors.Is(err, mongodriver.ErrNoDocuments)` (not `==` / `!=`).
- `IsRetryableMongoError` treats driver network/timeout helpers and `ErrClientDisconnected` as retryable; context cancel and no-documents are not.
- Background `monitorMongoConnection` Pings for observability only; the driver recovers via SDAM and the pool (the loop does not rebuild the client).

## Readiness

API / worker / websocket / core readiness Pings Mongo where those services declare a ready check. API ready also requires the in-process SDE cache warm. Probe ports → stack / service topics.

## Topic-only detail

- Import alias `eipmongo` for the package; use `mongodriver` when a local variable is already named `mongo`.
- New multi-collection write units: add a file under `writers`, do not leave ordered pairs assembled in the caller.
