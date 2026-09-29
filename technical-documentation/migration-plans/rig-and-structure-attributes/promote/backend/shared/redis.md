# Redis access (`services/shared/redis`)

Live SoT for the shared Redis handle used by api, core, worker, websocket and capacity-controller. Package: [`services/shared/redis`](../../../services/shared/redis).

Stack image / data fragment → [stack contents](../../stack/contents.md). API handler wiring → [deps.md](../api/deps.md). Worker task bag → [worker.md](../worker/worker.md).

## Defaults

| Piece | Default | Change |
|-------|---------|--------|
| Driver | `github.com/redis/go-redis/v9` | `services/go.mod` |
| Connect | `Connect(ctx)` from `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `services/shared/core/config/redis.go` |
| Boot connect attempts | `5` × 5s delay, honouring the context | `services/shared/redis/connect.go` |
| Client timeouts / pool | dial 5s; read 10s; write 5s; pool 20 | same |
| Health loop | ping every 30s, observability only | same |
| Tracing | `redisotel.InstrumentTracing` on the client | same |
| Operation retry | `Retry` — 3 attempts, 100ms → 2s backoff | `services/shared/redis/retry.go` |
| Lease cadence | TTL 15s, renew 5s, acquire backoff 5s | `services/shared/redis/lease.go` |

A malformed `REDIS_URL` is an error rather than a fallback: connecting to the raw string instead would drop the password and report the failure later as an auth error.

## Wiring

```text
stackservices.Connect* ──► Clients.Redis (*eipredis.Redis)
                              │
         ┌────────────────────┼────────────────────┬────────────────────┐
         ▼                    ▼                    ▼                    ▼
   apideps.Deps      taskrun.Dependencies  contract.Dependencies   Server.Stack
   (API handlers)      (worker tasks)      (core schedulers)       (websocket)
```

The composition root opens Redis once via `stackservices` and hands the handle to every role. `Close` stops the health loop and the connection together.

A role that does not select Redis holds a nil handle. `Driver()` is nil-receiver safe and every method reports `ErrNoClient`, so a guard checks `Driver() == nil` rather than the handle itself — checking the handle passes for a handle that has no connection.

## Handle surface

Type **`Redis`**: one connection, and two layers over it.

**The core** is the vocabulary every namespace needs, and knows nothing about what is stored:

| Group | What it covers |
|-------|----------------|
| Values | `PutJSON` / `GetJSON`, `PutString` / `GetString`, `GetInt`, `PutIfAbsent` |
| Keys | `ScanPrefix`, `SuffixAfter`, `Delete`, `Exists` |
| Collections | `PutFields` / `Fields` / `DeleteFields` / `RemoveFields`, `PutScored` / `AddScored` / `Scored` / `RemoveScored` / `ScoreOf`, `GetManyJSON` |
| Lists | `HeadOfList`, `AppendToList`, `RemoveFromList`, `ListLength` |
| Read-modify-write | `Update` — WATCH/MULTI/EXEC, 20 attempts with randomised backoff |
| Cardinality | `AddDistinct` / `CountDistinct` over HyperLogLogs |
| Batching | `Pipe` returns a `Pipeline`, with typed results per queued command |
| Scripting | `Script` compiles, `Run` evaluates |
| Pub/sub | `SubscribePattern` returns a channel of payloads |
| Coordination | `RunWhileHeld`, `ReleaseIfMine`, `LeaseInstanceID` |

**The helpers** are per-namespace and built from the core, not the driver: `Cache(dataset)` for the ESI caches, `MarketOrders()` for region order books, `AcquireRefresh(dataset)` for the refresh locks.

`Driver()` is the escape hatch for work the handle does not model. One caller uses it: `capacity-controller` hands the driver to `asynq`, which builds its own client from its own options struct. A test enforces that, and names the exception with its reason.

## What Redis holds

| Namespace | Holds | Lifetime | Owner |
|-----------|-------|----------|-------|
| `esi:market_prices:` | adjusted prices, ETag, last-updated | 24h | `Cache(DatasetMarketPrices)` |
| `esi:industry_systems:` | per-system cost indices, ETag, last-updated | 24h | `Cache(DatasetIndustrySystems)` |
| `esi:militia_systems:` | which faction holds each factional warfare system, ETag, last-updated | 24h | `Cache(DatasetMilitiaSystems)` |
| `esi:market_orders:<type>:<region>` | best and percentile prices per type | 2h | `MarketOrders()` |
| `esi:market_orders:region:<id>:` | per-page ETags and cached pages | 24h | `MarketOrders()` |
| `esi:market_orders:region_refresh_times` | when each region last swept | none | `MarketOrders()` |
| `esi:*:next_refresh` | when ESI says a dataset goes stale | 48h | `PutNextRefresh` |
| `esi:*:refresh_lock` | one refresher at a time | 300s | `AcquireRefresh` |
| `esi:b:` / `esi:errors:` / `esi:group:` / `esi:path:` / `esi:downtime` | limiter buckets, ledger, learned groups, downtime | per key | `shared/esiclient` |
| `lease:` | leader election for core primary, capacity primary, singletons | 15s, renewed | `RunWhileHeld` |
| `doc_lock:` / `doc_lock_wait:` / `doc_lock_pulse:` / `doc_lock_viewers:` | lock records, waitlists, presence pulses, viewers | 5m / 2m / 5m | `shared/core/documentlock` |
| `refresh_token:` / `account_sessions:` / `session_index:` / `session_refresh:` | planner sessions and the two indexes that resolve them | 7d | `shared/plannersession` |
| `custom_claims_corporations:` / `custom_claims_alliances:` | org ids ESI reported for an account | 30d | `shared/plannersession` |
| `apimetrics:` | HyperLogLogs behind the distinct-account and distinct-character gauges | 35d / 8d | `shared/telemetry/apimetrics` |
| `eip:core:handoff:v1:` | change-stream resume tokens across a core failover | none | `core/primaryhandoff` |
| `eip:capacity:cooldown:v1:` | capacity controller action cooldowns | 2× window, min 1h | `capacity-controller/cluster` |
| `asynq:` | the worker queue's own keyspace | asynq's | asynq |

Every key is built by a named builder; no call site spells one. A key with no expiry is a decision recorded as `forever` rather than an omission.

**New namespaces use `eip:<service>:<thing>:v<n>:`** — the prefix says the application owns the key, and the version lets a shape change without a migration. The older namespaces above predate that convention and stay as they are; one moves only when a shape change gives it a reason to, under its own version bump.

## Coordination

The lease is set-if-absent to acquire, plus two Lua scripts that compare the holder id before acting: renew extends only a lease this holder still owns, and release deletes only a lease this holder still owns. Both matter. A holder whose lease lapsed and was taken cannot extend the new holder's, and `RunWhileHeld` reads a failed renew as "lost" and cancels the scoped context — that single signal is what makes a displaced leader stand down. A late release does not free the lock someone else now holds.

A lease id is `<container id>:<uuid>`: the container attributes a held lease when inspecting keys, and the uuid keeps it unique across restarts so a resurrected process cannot refresh its own stale lease.

`RunWhileHeld` runs the core primary controller, the capacity primary, and the singleton jobs (doc-lock expiry subscriber, auth session maintenance). The refresh locks use the same compare-and-set release through `AcquireRefresh`.

## Errors and retry

`Retry` runs an operation through the shared backoff loop — three attempts, 100ms → 2s — and reports the Redis failure itself when they run out. Attempts, delays and what a caller receives → [retry.md](./retry.md). Three predicates decide what an error means here:

- **`IsNotFound`** — the key does not exist. An answer, not a failure, and never retried.
- **`IsRetryableError`** — a transient condition worth another attempt: a closed client, a network error, a dataset still loading, a pool timeout, a broken pipe.
- **`IsUnavailableError`** — Redis could not be reached, so a caller can degrade rather than fail. A handle with no connection counts, because it is unreachable by definition even though retrying will not help.

All three prefer the driver's own sentinels and error types, falling back to message text only for conditions a server reports in prose. `ErrNotFound` is the driver's sentinel re-exported, so a caller matches it with `errors.Is` without importing the driver.

## Readiness

Core and capacity-controller ping Redis in their ready checks; the singleton catalogue reports ready when its lease runners are started and Redis answers. A ping round-trips rather than reading link state, and the health loop alongside it logs failures without acting — the driver reconnects on its own.

## Topic-only detail

Import as `eipredis`, matching `eipmongo` and `eipnats`. Files are named for what they own — `values.go`, `keys.go`, `collections.go`, `lists.go`, `dataset.go`, `marketorders.go` — and a namespace's keys, lifetimes and invariants live together in one of them.

Empty input has three meanings and the package keeps them apart: nothing to do succeeds without a connection, a caller mistake reports `ErrEmptyKey` or `ErrEmptyPrefix` whether or not there is one, and a value not worth storing is the owning helper's decision rather than this layer's.
