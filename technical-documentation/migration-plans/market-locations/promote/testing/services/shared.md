# shared — tests

Live SoT for test depth under [`services/shared`](../../../services/shared). Behaviour → [shared/contents.md](../../backend/shared/contents.md), [mongo.md](../../backend/shared/mongo.md), [objectstore.md](../../backend/shared/objectstore.md), [pricing-defaults.md](../../backend/shared/pricing-defaults.md); planner sessions and HTTP middleware → [api/auth/sessions.md](../../backend/api/auth/sessions.md); identity / secrets → [stack.md](../../stack/stack.md), [secrets.md](../../stack/secrets.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Tree | From `services/`: `go test ./shared/...` | No Docker |
| Document locks | `go test ./shared/core/documentlock/` | Large focused suite |
| Object store | `go test ./shared/core/objectstore/` | `MemoryBackend`, no dial needed — see § Topic-only detail |
| Redis handle / lease | `go test ./shared/redis/` | Handle, keyspace, lease, and the driver-boundary test |
| Planner sessions | `go test ./shared/plannersession/... ` | Kernel, request-side reading, maintenance sweep |
| HTTP middleware | `go test ./shared/httpmiddleware/` | Constructors + composition kit |
| Identity | `go test ./shared/container/ ./shared/wsplacement/` | Common control-plane helpers |
| Messaging | `go test ./shared/nats/` | Live tests start a server in-process via `testing/natsfake`; nothing to run |
| Live Mongo (opt-in) | `EIP_MONGO_PARITY_LIVE=1 go test ./shared/mongo/ -run Live -count=1` | Needs stack `MONGO_*`; skips otherwise |
| Live Redis (opt-in) | `EIP_REDIS_PARITY_LIVE=1 go test ./shared/esiclient/` | Needs a throwaway Redis on 6399; skips otherwise. Never the stack's on 6379 |

```bash
go test ./shared/...
EIP_MONGO_PARITY_LIVE=1 go test ./shared/mongo/ -run Live -count=1
```

## Coverage map

**Depth:** Strong for document locks, archiveimport normalise, models, crypto/keyrings, Redis lease, planner sessions, orchestration probes, and the object store. SDE store, connect/monitor loops, and lifecycle runners are largely untested. Opt-in live Mongo covers Docs put/get parity under `shared/mongo`.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `core/documentlock` | Atomic acquire/release/handover/extend races; Redis lock roundtrip, waitlist, promote; status batch; cascade pipeline/predicate/membership; lease rebind; event payloads |
| `core/objectstore` | `MemoryBackend` matches `S3Backend`'s contract exactly — a missing key is `ErrNotFound` rather than empty, keys normalised on the way in, `ListKeys` recursive and sorted where `ListChildNames` collapses to one level, what is read back is a copy, deletion and copy scoped to their own subtree, a cancelled context refused; `MarketPages` — a page round-trips, a missing page is not found, two regions never share a page, page numbers come back in numeric order, dropping a region leaves the others and dropping one page leaves the ones below it, retention drops only regions older than its cutoff by their **newest** page (a region mid-walk is not dropped), and a page store with no backend reports itself unavailable rather than panicking; the S3 dial retries until the store accepts, returns an error if it never does, and stops on context cancel; the committed bucket-list fixture is current, no bucket name carries the module boundary's separator, and every bucket name is distinct |
| `models` | Job JSON/BSON parity & unknown-field policy; refresh-token encrypt/reencrypt; group-template validation; a saved market's shape, encoding and `Validate` limits; the hub list held to the SPA's copy and to what a region walk needs; `ComposeMarketLocations` — a reader's own row wins a collision, the nearer owner wins between two inherited rows and settles a tie the same way every time, an unshared row reaches nobody, `sharedBy` is never stored; `TakeMarketLocations` lifting rows out of `customStructures` and leaving one naming nowhere in place; a new account's pricing defaults price both sides from constants; a `PricingDefaults` pair round-trips through BSON as two subdocuments, each carrying only the fields its side answers with |
| `documentschema` | `Upgrader.ApplicationSettings` seeding pricing defaults: gated on an empty market rather than the schema version, idempotent on a second run, a side the account already chose is left alone, a group table on a side survives the seed, an account's stored order type is read into an exit route and a route already chosen is kept, and an account with neither falls back to the global default |
| `core/crypto` + `keyrings` | AES-GCM roundtrip/rotate/AAD; refresh-token keyring legacy parsing |
| `redis` | Handle and connection defaults; key names and lifetimes pinned to literals; values, keys, collections, lists, compare-and-set, cardinality; pipeline batching and what `Exec` reports; scripts and their result readers; pattern subscription delivery and goroutine lifetime; retry and the three error predicates; the lease — single-leader, takeover, lost-lease cancel, reacquire on fn error, and that neither renew nor release touches another holder's lease; and that no package outside `shared/redis` imports the driver |
| `plannersession` | The multi-key invariant each write owes (`TestOperationsLeaveTheKeysTheyOwe`); reauth deadline math; record normalise and prune; TTL constants pinned to literals, not to themselves; refresh-token key trimming; grants — refs stored rather than raw entity ids, an account's own key always granted, a corporation ref never grants the alliance of the same id, concurrent grant writes; grants repair — legacy rewrite, sessions survive, idempotence, dry run writes nothing, an account already on the new shape gains its own key, and a record stored under an untrimmed key; `ResolveTokenForValidSession` and `RefreshTokenReauthExpired`; `RevokeSessionTokens` reaching every token a scan attributes to a session, not only the indexed one; `ErrNoStore` classifying as a dependency outage; `GenerateRefreshToken` / `GenerateSessionID` distinctness |
| `plannersession/request` | Session id precedence — header, then query, then cookie; cookie round-trip and clear; failure classification and its log fields for every failure code; an outage reported as an outage rather than a missing session; revoked and expired sessions rejected; identity round-trips through context |
| `plannersession/maintenance` | `RunLoop` runs a pass before the first tick and stops when its context is cancelled; the sweep no-ops on a store with no Redis rather than erroring |
| `httpmiddleware` | `Chain` runs constructors in the order written; `Wrap` applies the chain to a handler; `Group` registers routes behind its chain; `ApplyIf` skips rather than no-op'ing on a non-match; request start time is on the context before the handler runs; request logging's client-failure detail, debug steps, caveats, and health-endpoint skip |
| `orchestrationprobes` | Health/ready handlers; bus ping role parse/start |
| `telemetry` | Trace sample rate, service version, deployment env, OTLP endpoint normalise; NATS log-context inject/extract |
| `nats` (unit) | Retry attempts, backoff and the error classifier, including that a cancelled context ends a wait rather than sleeping it out; envelope trace and log-context enrichment; subject builders and tenant filters; consumer keep policy; task registry — every task registered under its own name, every subject ending in its task name, every task having a publish helper |
| `nats` (live, embedded server) | Stream and durable reconcile; the three cleanup layers; bounded consume concurrency and that stop waits for in-flight handlers; the three handler outcomes (ack, terminate, redeliver) asserted from what the server still holds; batched publish and `Wait`; schedules — fire, replace-by-id, cancel, and read-back of the server's own fire time |
| `logs` | Request ID/account identity; operation context; debug steps; access-log / handler detail; OTLP JSON export |
| `mongo` (unit) | `IsRetryableMongoError` classifier (cancel / no-docs / disconnected / string fallback); groups membership-diff helper; which fields a row-scoped refresh-token write puts on the wire, so a row carrying only a bumped failure count cannot blank its own credential |
| `mongo` (live, opt-in) | `TestLive_*` put/get/schema/load-filter/doc-shape parity against stack Mongo; `MarketLocationsForAccount` — an account's own markets composed with those a planner it belongs to has shared, a market the planner kept internal reaching nobody, a planner with no settings document left out rather than refusing the set, the account's own row surviving a collision over one place, and the two refusals; citadels compose beside stations and are never folded into each other, and one citadel saved twice collapses the way one station saved twice does; the `users.refreshTokens` row helpers — a bulk write and a single-row write racing on one account with every rotation surviving, an unmatched row reported as an error, push adding then replacing without duplicating, pull removing only the named rows, and a control performing a whole-array write that still loses a concurrent rotation |
| `mongo/writers` | Arg-validation / nil-bulk unit tests; exercised on live paths via group-templates / build-stats consumers |
| `httpclient` | Retry classification and what is never repeated; gate refusals escaping the retry loop; wire-byte counting through gzip; conditional headers and validator parsing; h2 negotiation |
| `esiclient` (unit) | Bucket keying and token cost against the protocol; allowance learned from headers, never written in code; the slot-hash ledger and its two key lifetimes; which term bound a refusal; class floors and hand-off order; glide; the observed downtime gate, including source spread and the lone-source trip; operator reset dropping the allowance and keeping the ledger |
| `esiclient` (ledger model) | `TestLedgerMatchesAModelOfOutstandingAndSettled` drives randomised sequences of reserve, settle, release, bucket-move and expiry, comparing what Redis holds against a plain Go tally after every step. The model counts tokens and knows nothing of slots, floors or classes, so a mistake copied into both sides cannot pass. The seed is printed on every run and settable with `-ledger.seed` |
| `esiclient` (live Redis, opt-in) | The whole suite again against a real server, which is what settles `TIME`, script atomicity and hash-field expiry — the things a reimplementation gets subtly and materially different. The ledger model runs there too, on a short window, waiting real expiry out rather than skipping time. The handful that skip are the ones that can only skip time |
| `esiclient` (soak, `testing/esi_soak`) | Replay; Redis-op counts per call; fleet soak across replicas; outage and recovery; mixed classes; production-shaped load |
| `evesso` | Token exchange and refresh against `testing/evessofake`, which signs with a real RSA key it publishes through JWKS, so the whole validation path runs rather than a stub of it: issuer, audience, expiry and unpublished-key rejection, plus the rule that a refused grant means the server answered |
| Other focused | `container` ID; `wsplacement` tenant keys / routing precedence; `swarmsecret` env-over-file; Mongo/Redis URL API fallback; process `APP_VERSION` helpers; dependency unavailable-error detection |

### Thin

- `nats` connect and reconnect: the retry loop and its options are not exercised against a server that goes away and returns
- `nats` core topics: publish and subscribe helpers are covered by their callers rather than directly, and the health census gather has no test of its own
- `core/config` — mostly service-cred URL fallback; other loaders untested
- `mongo` connect / monitor loops and most raw `Collection()` escape hatches

### Little / none

- `core/sde/`, `lifecycle/`
- `stackservices/connect` (no package tests); `wsplacement` keys untested (`tenant` key helpers have unit tests)
- Main `appconfig` loader beyond process-version helpers

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Shared changes often affect multiple services — run the touched shared package plus the consuming service's suite.
- The whole-array control in the live `users.refreshTokens` suite is the point of that suite: it is expected to lose a concurrent rotation, and if it ever starts passing, the row-scoped helpers are no longer what holds the invariant up.
- `plannersession`, `plannersession/request` and `plannersession/maintenance` tests build their fixtures through `testing/redisfixture` rather than hand-rolling the fake-to-handle bridge — see [../harness.md](../harness.md) § `redisfixture`.
- **`core/objectstore` needed an in-process `Backend` to be testable at all.** `OpenTestStore` reaches a live store on a port not published to the host, so every package test there skipped silently until `MemoryBackend` gave them somewhere to run; it is written to match `S3Backend`'s contract rather than to be convenient, because a fake friendlier than the real thing would make its callers' tests lie. It is not test-only — any caller wanting object storage without a store to dial can take it, and the worker's market-lifecycle test does — see [worker.md](./worker.md).
- Cross-service agreement on what a stored session means is not this file's concern — it is a property of the whole fleet, not one package — and is proved by `testing/sessionhandover` instead; see [../harness.md](../harness.md) § `sessionhandover`.
- Live Mongo tests skip unless `EIP_MONGO_PARITY_LIVE=1`; they do not run in default CI unit jobs.
- Live Redis tests skip unless `EIP_REDIS_PARITY_LIVE=1`, and they need a throwaway server:

  ```bash
  docker run -d --rm --name eip-test-redis -p 6399:6379 redis:8
  cd services && EIP_REDIS_PARITY_LIVE=1 go test ./shared/esiclient/
  ```

  **Never the stack's Redis on 6379.** The helper refuses that address outright: these tests delete
  every key under `esi:`, and the limiter's budget is shared state the running system relies on.
- `testing/ledgerbench` measures how the ledger's read cost scales, against the same throwaway server
  on 6399: `cd testing && go test ./ledgerbench/ -count=1 -timeout 20m`. It is what established the
  ledger's shape — read cost for a sorted set grows with traffic *volume*, one member per call,
  reaching 6.1ms at 12,000 charges, while for the slot hash it grows with traffic *variety* (slots ×
  classes × endpoints) and stays flat at roughly 210µs at the same depth, for 19× less memory per
  bucket.
- **Known flake.** Running the whole `shared/esiclient` package repeatedly fails roughly once in
  twenty runs, in a rotating set of tests that assert on freshness or allowance adoption. Each passes
  alone, and it has not been reproduced against a real Redis. The suspicion is a wall-clock read
  racing an assertion; it is not diagnosed.
