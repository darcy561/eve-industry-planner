# Mongo access (`services/shared/mongo`)

Live SoT for the shared Mongo handle used by api, worker, core, and websocket. Package: [`services/shared/mongo`](../../../services/shared/mongo). Multi-collection writers: [`services/shared/mongo/writers`](../../../services/shared/mongo/writers).

Stack image / data fragment → [stack contents](../../stack/contents.md). Day-2 ensure → [deploy.md](../../deployment/deployment-tool/cli/deploy.md) (`eip ensure-mongo`). API handler wiring → [deps.md](../api/deps.md). Worker task bag → [worker.md](../worker/worker.md).

## Defaults

| Piece | Default | Change |
|-------|---------|--------|
| Driver | `go.mongodb.org/mongo-driver/v2` | `services/go.mod` |
| Database name | pinned in package (`DatabaseName`) | `services/shared/mongo` |
| Connect | `ConnectPrimary` | shared `MONGO_USERNAME` / `MONGO_PASSWORD` |
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
| `JobDocuments` | Planner job docs (`account_job_documents`) — hot API path |
| `Jobs` | Distinct jobs collection (`account_jobs`) — **not** the job-docs API |
| `Users` / `ApplicationSettings` / `Groups` / `ArchivedJobs` / `BuildStats` | Account and archive surfaces (`accounts`, `account_settings`, `account_job_groups`, `account_archived_jobs`, `account_production_totals`) |
| `TemplateCatalog` / `TemplatePayloads` | Group templates (`account_group_template_catalog`, `account_group_template_payloads`) |
| `Blueprints` / `CitadelNames` / `WatchlistDeprecated` | Supporting collections (`shared_blueprints`, `shared_citadel_names`, `account_watchlist_deprecated`) |

Same-collection reads/writes go through Docs helpers (many already wrap `Retry`). Cross-collection units go through **`writers`** (`RunOrdered` / `RunUnordered` own `Retry`) — do not assemble client `Bulk()` in HTTP handlers.

`Collection()` returns the raw driver collection for call sites that build bulk models or one-off queries; prefer Docs/writers when a helper exists.

## Collection naming

Every collection name states the scope of its documents: who a query filters on to decide which rows
a caller may see.

```
<owner>_<noun>
```

| Kind | Test | Prefix |
|------|------|--------|
| Entity data | The rows a caller sees depend on which account / corporation / alliance they are | `account_` / `corporation_` / `alliance_` |
| Shared reference | Every caller reads the same rows regardless of who they are | `shared_` |

`shared_` is about **scope, not mutability**: `shared_blueprints` is rebuilt from the SDE and
`shared_citadel_names` is written by users submitting names they have seen, but both serve every
caller the same rows.

`accounts` is the one bare name — that collection *is* the account records, so the tier word is the
noun rather than a prefix on one. Everything else an account owns reads as `account_<noun>`.

**An unprefixed collection is a defect**, not a default: it means nobody has classified it.

The planner has four tiers and they are not interchangeable. An account is the login, derived from
the EVE main character hash; it attaches **several** in-game characters. So `character_` is
deliberately unused — every collection today filters on `_meta.accountID`, and `characterHash`
appears only as a field inside job documents, never as a collection key. Naming an account-scoped
collection `character_*` would assert a scope the data does not have. The prefix is reserved for
collections that are genuinely character-keyed, which would be new collections rather than renamed
ones.

Collection names are duplicated across a module boundary — this package holds the constants, and
`deployment-tool` repeats them as bare strings, because `deployment-tool` cannot import `services`.
`TestCollectionNames_canonical` here and `TestIndexSpecCollectionsAreKnown` /
`TestPreimageCollectionsAreKnown` there pin the two copies together, so changing a name in one
module fails the other module's test. Renaming an existing collection additionally needs a
`CollectionRenames` entry so deployed databases move with the code — see
[deploy.md](../../deployment/deployment-tool/cli/deploy.md) (`eip ensure-mongo`).

## Errors & retry

- Prefer `errors.Is(err, mongodriver.ErrNoDocuments)` (not `==` / `!=`).
- `IsRetryableMongoError` treats driver network/timeout helpers and `ErrClientDisconnected` as retryable; context cancel and no-documents are not.
- Background `monitorMongoConnection` Pings for observability only; the driver recovers via SDAM and the pool (the loop does not rebuild the client).

## Readiness

API / worker / websocket / core readiness Pings Mongo where those services declare a ready check. API ready also requires the in-process SDE cache warm. Probe ports → stack / service topics.

## Topic-only detail

- Import alias `eipmongo` for the package; use `mongodriver` when a local variable is already named `mongo`.
- New multi-collection write units: add a file under `writers`, do not leave ordered pairs assembled in the caller.
