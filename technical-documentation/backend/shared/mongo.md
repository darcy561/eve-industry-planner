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
   apideps.Deps        taskrun.Dependencies   Server / core bags
   (API handlers)        (worker tasks)       (composition root)
         │                    │
         ▼                    ▼
   Docs fields / writers / eipmongo.Retry
```

Composition root opens Mongo via `stackservices`. API handlers use `apideps.Deps`; worker tasks use `taskrun.Dependencies`. Websocket keeps `Server.Stack`; core keeps `*stackservices.Clients` at the composition root.

## Handle surface

Type **`Mongo`**: one driver client, a pinned database, and every collection bound as a named `Docs`
field. A caller reaches a collection by name on the handle rather than by string.

| Field | Collection | Holds |
|-------|------------|-------|
| `Users` | `accounts` | the account record, keyed by the EVE main character hash |
| `ApplicationSettings` | `account_settings` | per-account application settings |
| `JobDocuments` | `account_job_documents` | planner job documents — the hot API path |
| `Jobs` | `account_jobs` | job records, distinct from the job-documents API above |
| `Groups` | `account_job_groups` | job groups |
| `TemplateCatalog` / `TemplatePayloads` | `account_group_template_catalog` / `…_payloads` | group templates, split so a listing does not load every payload |
| `ArchivedJobs` | `account_archived_jobs` | jobs moved out of the planner |
| `AccountProductionTotals` | `account_production_totals` | per-account build totals |
| `WatchlistDeprecated` | `account_watchlist_deprecated` | the watchlist carried over from Firestore |
| `Blueprints` | `shared_blueprints` | blueprint reference data, rebuilt from the SDE |
| `CitadelNames` | `shared_citadel_names` | station and structure names users have submitted |

`Coll(name)` returns a raw driver collection for a one-off or dynamically named query, and
`Docs.Collection()` the same for a call site building its own write models. Prefer the named fields.

## What a document carries

Every account-scoped document carries a `_meta` subdocument. Knowing its shape is usually the fastest
way to work out why a document did not reach a client, because the changestream routes on it.

| Field | Meaning |
|-------|---------|
| `_meta.accountID` | who owns it — every collection above filters on this |
| `_meta.corporationRef` / `_meta.allianceRef` | org ownership, for documents that are not account scoped; the changestream routes on these when `accountID` is absent |
| `_meta.sessionID` / `_meta.clientID` | which session and browser tab made the change, so the writer's own tab can be excluded from the fan-out |
| `_meta.lastModified` | stamped on every write |

`ApplyMetaSessionClient` stamps the session and client from request inputs. Upserts come in two
shapes: `UpsertStructWithMeta` writes the metadata from the struct, and `UpsertStructPreservingMeta`
keeps what is already stored and bumps `lastModified` — the second is what a partial update wants.

Documents also carry a `schemaVersion`, upgraded in batches by a maintenance task rather than on read.

## Reading and writing

Three layers, and which one to use is decided by how many collections a change touches.

| Scope | Use | Retry |
|-------|-----|-------|
| One collection | a `Docs` helper on the named field | many wrap `Retry` already; `…Retry` variants where the caller chooses |
| Several collections, one unit | [`writers`](../../../services/shared/mongo/writers) | `RunOrdered` / `RunUnordered` own it |
| A one-off or dynamic query | `Coll(name)` / `Docs.Collection()` | the caller's |

**Cross-collection writes do not belong in a handler.** A change spanning collections is assembled as
a `ClientBulk` — `UpdateOne`, `ReplaceOne`, `DeleteMany` and so on against a `Docs` field, with
`Upsert()` and `ArrayFilters()` as options — and run through `writers`, which owns the retry. Adding a
new one means a file under `writers`, not a bulk assembled at the call site.

`RunOrdered` stops at the first failure; `RunUnordered` attempts everything and reports what failed.
Order matters when a later write depends on an earlier one having landed.

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
`CollectionRenames` entry, carrying the next structural version, so deployed databases move with the
code — see [deploy.md](../../deployment/deployment-tool/cli/deploy.md) (`eip ensure-mongo`).

One collection in the database belongs to no service: `shared_deploy_state` holds a single row
recording the structural version `eip ensure-mongo` has applied, which is how it skips renames it has
already done. It is owned by the Deployment Tool, so it is absent from this package's constants by
design — a reader finding it in the database has not found an unclassified collection.

## Errors and retry

`Retry` runs an operation with backoff and honours the context, so a cancelled request stops waiting
rather than sleeping out its attempts.

| Outcome | Retried |
|---------|---------|
| Network failure, timeout, `ErrClientDisconnected` | yes — 3 attempts, 100ms → 2s |
| No documents, nil document | no — an answer, not a failure |
| Context cancelled | no |

`IsRetryableMongoError` prefers the driver's own `IsNetworkError` and `IsTimeout` helpers, with a
narrow message fallback for server-selection failures that arrive as text. A "not found" is reported
with `errors.Is(err, mongodriver.ErrNoDocuments)` — never a `==` comparison, because the driver wraps.

The background `monitorMongoConnection` loop pings for observability only. It does not rebuild the
client: the driver recovers through server discovery and the connection pool on its own, so a ping
failing in the log is a symptom to read, not a step in recovery.

## Readiness

API / worker / websocket / core readiness Pings Mongo where those services declare a ready check. API ready also requires the in-process SDE cache warm. Probe ports → stack / service topics.

## Topic-only detail

- Import alias `eipmongo` for the package; use `mongodriver` when a local variable is already named `mongo`.
- New multi-collection write units: add a file under `writers`, do not leave ordered pairs assembled in the caller.
- Collection names are duplicated across a module boundary. This package holds the constants, and the Deployment Tool repeats them as strings because it cannot import `services`. A test on each side pins the two copies together, so renaming a collection in one module fails the other module's test.
