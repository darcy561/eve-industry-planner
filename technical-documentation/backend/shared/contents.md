# Backend — shared

## Owns (SoT)

Shared Go libraries under `services/shared` that are not owned by a single service topic, including
the messaging layer — streams, subjects, publish and consume, and schedules — the Redis handle and
its keyspace, the backoff loop every retried operation runs through, the outbound HTTP client and ESI
rate limiter, the JSON encoding policy every service reads and writes through, the shared
S3-compatible object store and the buckets it holds, the stored shape of an account's and a job's
pricing defaults with the schema upgrader that seeds them, and the stored shape of a player's custom
structures with the decode-time fold and prerelease steps that keep every settings document on it.

## Does not own

- Feature contracts exposed via HTTP → [api/](../api/contents.md)
- Request/response JSON handling at the HTTP boundary → [api/json.md](../api/json.md) (the codec
  policy underneath is this section's; the HTTP wiring on top of it is api's)
- EVE SSO token exchange and JWT validation → `services/shared/evesso`, documented with sessions in
  [api/auth/sessions.md](../api/auth/sessions.md)
- Planner session state and HTTP auth middleware → `services/shared/plannersession`,
  `services/shared/httpmiddleware`, documented with sessions in
  [api/auth/sessions.md](../api/auth/sessions.md)
- Stack topology / EnsureMongo → [stack/](../../stack/contents.md),
  [deploy.md](../../deployment/deployment-tool/cli/deploy.md)
- Test depth for shared packages → [testing/services/shared.md](../../testing/services/shared.md)
- Recurring cron jobs and what each one does → [core/](../core/contents.md) (this section owns
  schedules, not the crons that use them)
- What is stored in an object-store bucket and how it earns or loses its place there → [worker/market-orders.md](../worker/market-orders.md)
- Which market and order type a client resolves for a side, and the resolution ladder →
  [frontend/pricing/defaults.md](../../frontend/pricing/defaults.md) (this section owns the stored
  shape and its seed; the frontend owns what reads it)
- A saved market's own stored fields, and what composes the set an account may price against →
  [api/market-locations.md](../api/market-locations.md) (this section owns the four build kinds a
  structure can be; a market is a different shape entirely)
- What the SPA holds a structure as, the field map that decides what a kind's form asks for, and the
  rig-conflict rule → [frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md)

## Task map

| I need to… | Read |
|------------|------|
| Retry an operation, or choose its attempts and delays | [retry.md](./retry.md) § The shape a caller supplies |
| Know which error a caller gets when attempts run out | [retry.md](./retry.md) § What the caller receives |
| Spread retries of a contended operation | [retry.md](./retry.md) § Backoff and jitter |
| Wait for something to arrive rather than budget attempts | [retry.md](./retry.md) § Waiting instead of budgeting |
| Retry at a flat delay rather than a growing one | [retry.md](./retry.md) § Fixed delays |
| Use the Mongo handle / Docs / writers / Retry | [mongo.md](./mongo.md) |
| Name a new Mongo collection | [mongo.md](./mongo.md) § Collection naming |
| Work out whether a subject is stored or fire-and-forget | [nats.md](./nats.md) § Two kinds of messaging |
| Find which stream or subject carries something | [nats.md](./nats.md) §§ JetStream streams, Core-NATS topics |
| Publish a task, or add a new one | [nats.md](./nats.md) § Publishing |
| Send many messages in a loop | [nats.md](./nats.md) § Publishing |
| Know whether a publish waited, and whether it was retried | [nats.md](./nats.md) § Publishing |
| Consume a subject, and decide what happens to a message | [nats.md](./nats.md) § Consuming |
| Work out why a message was redelivered, or never came back | [nats.md](./nats.md) §§ Consuming, Two kinds of messaging |
| Add, change or retire a stream | [nats.md](./nats.md) § JetStream streams |
| Understand how abandoned durables are removed | [nats.md](./nats.md) § Durable cleanup |
| Schedule something for later, or cancel it | [nats.md](./nats.md) § Schedules |
| Work out why a schedule did not fire | [nats.md](./nats.md) § Schedules |
| Know what is retried and what is not | [nats.md](./nats.md) § Errors and retry |
| Use the Redis handle, or find what it can do | [redis.md](./redis.md) § Handle surface |
| Find out what is in Redis, and what expires it | [redis.md](./redis.md) § What Redis holds |
| Add a key, or name a new namespace | [redis.md](./redis.md) § What Redis holds |
| Batch commands, run a Lua script, or subscribe to a pattern | [redis.md](./redis.md) § Handle surface |
| Run something on one replica only | [redis.md](./redis.md) § Coordination |
| Work out why a leader stood down, or why a lock was not freed | [redis.md](./redis.md) § Coordination |
| Tell a missing key from an outage, and know what is retried | [redis.md](./redis.md) § Errors and retry |
| Reach the driver for something the handle does not model | [redis.md](./redis.md) § Handle surface |
| Document locks (shared package) | [api/document-lock/](../api/document-lock/overview.md) (API topic owns product behaviour; package under `services/shared/core/documentlock`) |
| Make an outbound HTTP call from a service | [esi.md](./esi.md) § Outbound HTTP |
| Stream a large response without holding it whole | [esi.md](./esi.md) § Outbound HTTP |
| Retry a request, or decide what is not retryable | [esi.md](./esi.md) § Outbound HTTP |
| Call ESI from a service | [esi.md](./esi.md) |
| Work out what a call costs, and what the allowance is | [esi.md](./esi.md) § What a bucket is |
| Know how spend is stored, and why a charge must not be reversed twice | [esi.md](./esi.md) § What a bucket is |
| Tune how one endpoint is paced | [esi.md](./esi.md) § Endpoint policy |
| Understand why a call was refused and when to come back | [esi.md](./esi.md) § Acquiring a slot |
| Tell whether a refusal was the bucket, a floor, or an endpoint's share | [esi.md](./esi.md) § Acquiring a slot |
| Work out whether ESI is down, and how that was decided | [esi.md](./esi.md) § Downtime is observed, never scheduled |
| See what ESI activity is reported to Grafana | [esi.md](./esi.md) § What it reports |
| Read or reset ESI bucket state as an operator | [esi.md](./esi.md) § Operating it |
| Marshal or unmarshal JSON anywhere in `services/` | [jsoncodec.md](./jsoncodec.md) |
| Decide whether a decode should be strict or lenient | [jsoncodec.md](./jsoncodec.md) § Strict vs lenient |
| Tag a new numeric or bool model field `omitzero` vs `omitempty` | [jsoncodec.md](./jsoncodec.md) § The `json` / `bson` tag pair |
| Stream a JSON array without holding the body whole | [jsoncodec.md](./jsoncodec.md) § Functions |
| Find the account's or a job's pricing fields, or what an unfilled side looks like on the wire | [pricing-defaults.md](./pricing-defaults.md) § The stored shape |
| Know what the schema upgrader seeds for pricing, and when | [pricing-defaults.md](./pricing-defaults.md) § Seeding an account's defaults |
| Work out what removing a stored field breaks, and for how long | [pricing-defaults.md](./pricing-defaults.md) § Wire compatibility |
| Read or write an object in the shared object store, or add a bucket | [objectstore.md](./objectstore.md) |
| Hold a Go and a Deployment Tool bucket list together | [objectstore.md](./objectstore.md) § Buckets |
| Replay a region's market pages on a 304, or drop a region's pages | [objectstore.md](./objectstore.md) § `MarketPages` |
| Find a custom structure's stored fields, or which ones a kind carries | [custom-structures.md](./custom-structures.md) § The stored shape |
| Know why `RigType` is still declared and cannot be removed yet | [custom-structures.md](./custom-structures.md) § Rigs are two slots, on every kind |
| Know how a settings document is folded onto one array, and when it is converted on disk | [custom-structures.md](./custom-structures.md) § The fold, at decode, § Prerelease steps |
