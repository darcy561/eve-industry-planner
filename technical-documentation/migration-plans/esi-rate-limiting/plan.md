# ESI rate limiting — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this exists

Three services now depend on ESI budget state and only one of them can see it properly. The worker
paces its own requests, `core`'s scheduler reads the worker's Redis keys to decide whether to publish
a market refresh, `core`'s metrics scan the same namespace for gauges, and the api will shortly need
to make its own ESI calls with a user waiting on the response. The limiter that all of this rests on
lives inside one service, meters buckets it invented rather than the ones ESI charges, and resolves
contention by rejecting tasks that then replay work they had already done.

This project builds a replacement at `services/shared/esiclient` **alongside** the existing package.
Nothing switches until the new one is complete and tested on its own.

## The bucket model

Everything here follows from how ESI meters, which the current implementation does not model:

> Buckets are keyed on a **rate limit group** and a **userID** pair. For authenticated routes the
> userID is `"<applicationID>:<characterID>"` from the access token; for unauthenticated routes it is
> `"<sourceIP>"`, or `"<sourceIP>:<applicationID>"` when a token is supplied.

Source: [ESI rate limiting](https://developers.eveonline.com/docs/services/esi/rate-limiting/).

| Fact | Consequence for the design |
|------|----------------------------|
| Bucket = (group, userID) | The clock and the ledger key on that pair, nothing else |
| Group is reported in `X-Ratelimit-Group` | The group name is learned from the response, never invented by the caller |
| 2XX costs 2, 3XX costs 1, 4XX costs 5, 5XX costs 0, 429 excluded from the 4XX charge | Conditional requests are half price; error storms are 2.5× price |
| `X-Ratelimit-Limit` is `"150/15m"` — tokens **and** window | Both halves are parsed; the window is not assumed to be 15 minutes |
| Consumed tokens return after the window, individually | The ledger expires entries by their own timestamps, not in a block |
| Authenticated routes bucket per character | Per-character work barely contends; the IP bucket is the scarce one |
| Legacy routes: 100 non-2xx/3xx per minute returns 420 **across all ESI routes** | One fleet-wide error counter, separate from any bucket |

Sustained throughput is therefore derived, not configured: `limit ÷ window ÷ cost`.

### Measured allowances

Read from the running deployment's Redis, where the current client caches what ESI reported:

| Group | Observed limit | Sustained (2 tokens/req) | Paced at | Live spend when sampled |
|-------|---------------|--------------------------|----------|-------------------------|
| `market-order` | 12,000 / 15m | **6.67 req/s** | 3 req/s | 356 tokens (178 requests) — 3% of window |
| `status` | 600 / 15m | 0.33 req/s | 3 req/s | 6 tokens |
| `industry` | 150 / 15m | 0.083 req/s | 3 req/s | 2 tokens |
| `""` (adjusted prices + affiliation) | unset (`-1`) | — | 3 req/s | none — token accounting is off |

**Real allowances span 80×, and one configured `3.0` governs all of them.** It is under half the
sustained rate for `market-order` and 36× the sustained rate for `industry`; the latter survives only
because its volume is two tokens. That spread, not any single wrong number, is the argument for
deriving the rate per bucket.

The empty-named bucket never received a parseable `X-Ratelimit-Limit`, so `enforce_tokens` is false
and two unrelated real buckets share one unmetered fake key.

## What is wrong today

Recorded here because each one is a requirement on the replacement, not as a change log.

**Buckets are invented.** Every `GroupDesignation` in the tree is a hand-written literal or empty:
`{PrimaryGroup: "status"}`, `{PrimaryGroup: "market-order"}`, `{PrimaryGroup: "industry"}`, and `{}` at
both `refreshAdjustedPrices.go` and `update_account_session_grants.go`. The two empty ones share a
bucket whose Redis key is `esi:group::tokens:sum`. `X-Ratelimit-Group` is not read. No call site ever
sets a character, so authenticated and unauthenticated work is metered the same way.

**Tokens are counted after the fact, never reserved.** `CheckAndReserveScript` states it does not
reserve; concurrent callers all pass the same check and the overshoot is only discovered from the next
response's headers.

**Denial has no ordering.** A refused caller re-enters the same check on wake. Under contention the
outcome is a lottery, and losing means the whole asynq task is requeued — `FetchRegionMarketOrders`
restarts at page 1, re-requesting pages it already has. Those replays answer 304 but still take a slot
and a token each, so bouncing consumes more budget than waiting would have.

**Cost accounting is wrong for 429.** `getTokensForStatus` charges 5 tokens for a 429; ESI excludes it
from the 4XX charge.

**Rates are configured rather than observed.** `worker/app.go` sets `defaultRateLimit = 3.0` and
`InitializeDefaultRateLimits` writes that same figure into Redis for four named primary groups on
every boot, overwriting whatever is there. The pacing key is the full group name while the rate key is
the primary group, so the configured value does not reliably reach the clock that uses it — and a
change on CCP's side to any real allowance is invisible to all of it.

**Redis work is unbatched.** A single request issues two GETs, an EVAL, three EXPIREs, another EVAL and
four more EXPIREs — eleven round trips, none pipelined — plus an unconditional 0–100 ms sleep.

**Half the package is unreferenced.** `client.go`, `limiter.go`, `cleanup.go` and their ~1,600 lines of
tests exercise an in-process `ESIClient` that nothing constructs. Its token reservation model is the
one the live path needs.

**The key namespace is a cross-service contract that is typed in two places.**
`shared/core/redis/market_orders.go` hard-codes `esi:group:market-order:token_limit` and
`:tokens:sum`; `worker/ratelimiter` builds the same strings with `fmt.Sprintf`.

## Package layout

```
services/shared/esiclient/
├── bucket.go       Bucket, Identity, Class, key building, token cost table
├── client.go       Client, Request, Response, Do
├── dispatcher.go   permit acquisition, priority queue, waiter cap, block loop
├── state.go        Redis accessors: reserve, settle, headroom, error counter
├── downtime.go     observed availability gate, probe backoff, /status/ single-flight
├── scripts.go      the two Lua scripts
├── config.go       Config and defaults — rates, lanes, budgets, tolerances
├── errors.go       RateLimitError and classification
└── fake.go         in-memory Client for other packages' tests
```

Three layers, each with one job: `client` knows HTTP and ESI headers and never touches Redis;
`dispatcher` knows permits, ordering and the decision to wait or yield, and never touches HTTP;
`state` knows key names and the scripts, and never knows that anything is waiting.

The name `esiclient` is chosen against `worker/esi` and `shared/core/evesso`, which already exist and
own different things (status checking and SSO token exchange respectively).

## Go models

Every type the package defines. Nothing here is left to be settled during implementation.

### Identity and bucket

```go
// Identity is the ESI-side principal a request is charged to.
// The zero value means an unauthenticated request.
type Identity struct {
    CharacterID int32
}

// Bucket is one ESI rate-limit bucket, keyed exactly as ESI meters it.
type Bucket struct {
    Group string // X-Ratelimit-Group, learned from a response
    User  string // "char:<id>" when authenticated, "ip" otherwise
}

// Key returns the Redis key segment for the bucket: "<group>|<user>".
func (b Bucket) Key() string
```

`"ip"` is a constant standing for this deployment's egress address. ESI keys unauthenticated calls on
the source IP; we hold one budget for the fleet and do not treat replicas on separate hosts as
separate allowances.

### Request and response

```go
// Class decides queue order and how long a caller will wait before yielding.
type Class uint8

const (
    ClassBulk        Class = iota // background refresh; yields early, frees the worker slot
    ClassStandard                 // default for task work
    ClassInteractive              // a user is waiting; may draw on the urgent lane
)

type Request struct {
    Method    string
    Path      string            // includes query string
    Headers   map[string]string
    Body      []byte            // nil for GET
    Auth      Identity
    Class     Class
    GroupHint string            // used only until this path's real group is known
}

type Response struct {
    Status int
    Header http.Header
    Body   []byte      // decompressed; nil when the caller streams
    Bytes  int64       // compressed bytes off the wire, for transfer accounting
    Bucket Bucket      // the bucket this call was actually charged to
    Cost   int         // tokens charged
}
```

`GroupHint` exists only for the first call to an unseen path. Once a response reports
`X-Ratelimit-Group`, the path→group mapping is stored and the hint is ignored.

### Budget

```go
// BucketState is what ESI last told us about a bucket, plus our own clock.
// Limit, Window and Metered are observations. Nothing in code supplies them.
type BucketState struct {
    Limit      int           // X-Ratelimit-Limit tokens
    Window     time.Duration // X-Ratelimit-Limit window
    Metered    bool          // false once a response arrives with no X-Ratelimit-* headers
    Remaining  int           // last observed X-Ratelimit-Remaining
    ObservedAt time.Time     // response that produced Remaining
    GatedUntil time.Time     // zero when open; set from Retry-After on 429
    NextSlot   time.Time     // pacing clock (theoretical arrival time)
    ProbeUntil time.Time     // a discovery request is in flight until this moment
    Spent      int           // tokens live in the ledger
}

// Headroom is what a scheduler asks before publishing work. It is scoped to a
// class: what bulk may spend is not what the bucket holds.
type Headroom struct {
    Bucket     Bucket
    Class      Class
    Available  int           // tokens this class may spend now: its floor plus its claim on the contended pool
    Requests   int           // Available / cost of a 2xx
    ResetAt    time.Time     // when the next tokens return
    GatedUntil time.Time
    Sustained  float64       // req/s the bucket supports long-term
}

// Reservation is a granted slot. Every one is either settled or released.
type Reservation struct {
    ID     string
    Bucket Bucket
    Slot   time.Time
    Cost   int // tokens held pending the actual response
}
```

### Errors

```go
type Kind uint8

const (
    KindGated        Kind = iota // bucket 429'd or out of tokens
    KindBudget                   // caller's deadline cannot cover the slot
    KindQueued                   // bucket healthy, too many waiters ahead
    KindDecelerating             // bucket low, the glide has stretched the interval
    KindErrorLimit               // fleet-wide 420 guard tripped
    KindDowntime                 // TQ observed unavailable; scheduled or not
)

type RateLimitError struct {
    Kind       Kind
    Retryable  bool
    RetryAfter time.Time
    Bucket     Bucket
    Headroom   Headroom
    Reason     string
}
```

`errors.AsType` is used for extraction — `go fix -diff` flags the current `errors.As` form in
`worker/ratelimiter/errors.go`, and the new file starts on the modern shape.

### Client surface

```go
type Client interface {
    // Do acquires a slot, sends the request, settles the ledger, and classifies a 429.
    Do(ctx context.Context, req Request) (*Response, error)

    // Stream is Do without reading the body: the reader is decompressed and the
    // caller closes it, then settles the reservation.
    Stream(ctx context.Context, req Request) (io.ReadCloser, *http.Response, Reservation, error)

    // Headroom reports what one class may spend, so a scheduler can decide what to publish.
    Headroom(ctx context.Context, b Bucket, c Class) (Headroom, error)

    // CanAfford is Headroom with a threshold, for the common scheduler question.
    CanAfford(ctx context.Context, b Bucket, c Class, tokens int) (bool, Headroom, error)
}
```

`Stream` hands the reservation back because the caller settles it once the body is done.

### Configuration

```go
type Config struct {
    BaseURL string
    Redis   *redis.Client
    Mode    Mode          // ModeBlock (worker) or ModeDirect (api)

    BlockSize      int           // slots reserved per round trip in ModeBlock
    WaiterCap      int           // concurrent in-process waiters
    Tolerance      map[Class]time.Duration
    Floors         []ClassFloor  // guaranteed share per class; sums to <= 1.0
    ErrorLimitStop int           // non-2xx/3xx per minute at which we stop

    StaleSoft time.Duration // past advertised expiry, a refresh stops being bulk
    StaleHard time.Duration // past advertised expiry, a refresh is published regardless

    Endpoints []EndpointPolicy   // per-endpoint tuning, first match wins
}
```

Defaults live beside the type as the single source for both services. `ModeBlock` amortises Redis
across a block of slots for sustained demand; `ModeDirect` takes one slot per call, which suits the
api's low-volume interactive traffic and wastes nothing when a block would go unused.

**No bucket limit or window appears in `Config`.** Those come from ESI and only from ESI — see
[Deriving limits](#deriving-limits-from-esi).

### Endpoint policy

Tuning is per endpoint, declared in code, resolved at startup. Nothing here is settable at runtime.

```go
// EndpointPolicy tunes how one ESI endpoint is scheduled inside whatever budget
// ESI reports for its bucket. It never states what that budget is.
type EndpointPolicy struct {
    Pattern           string  // path template, e.g. "/markets/{region_id}/orders/"
    CompatibilityDate string  // required: X-Compatibility-Date this endpoint's decoding targets
    Class             Class   // default class for calls to this endpoint
    Tolerance   time.Duration // wait before yielding; 0 = class default
    MaxShare    float64       // ceiling on this endpoint's share of its bucket; 0 = no ceiling
    MinSpacing  time.Duration // fastest this endpoint will ever be paced, bank or no bank
    GlideFrom   float64       // fill ratio at which deceleration begins; 0 = package default
    Concurrency int           // simultaneous in-flight calls; 0 = unlimited
    Conditional bool          // calls must carry If-None-Match / If-Modified-Since
}

// DefaultEndpointPolicies is the SoT for endpoint tuning. Patterns match on path
// template with {} segments; the first match wins, and an unmatched path takes
// the zero policy (class default, no ceiling, no floor).
var DefaultEndpointPolicies = []EndpointPolicy{ /* … */ }
```

`MaxShare` is what stops one endpoint draining a bucket other endpoints share — a full region
pagination and the industry index refresh can sit in the same group, and the pagination should not be
able to take all of it. `MinSpacing` is the burst ceiling: the fastest this endpoint is ever paced,
even with a full bank. `GlideFrom` sets where deceleration starts — see
[Bursting and deceleration](#bursting-and-deceleration). `Concurrency` bounds a paged walk.

`CompatibilityDate` is required and has no package default, because it decides the response shape —
see [The compatibility date is per endpoint](#the-compatibility-date-is-per-endpoint).

`Conditional` is enforced, not advisory: a call to an endpoint marked conditional that carries neither
validator fails in tests, because a 304 costs 1 token against a 2xx's 2 and that ratio is the largest
single lever available.

Endpoint policy resolves by path template, which the caller knows at compile time. Bucket identity
resolves by response header, which it does not. The two are deliberately separate keys.

## Redis schema

Two keys per bucket, plus one fleet-wide counter and one path map. All TTLs are `2 × window`,
refreshed on write.

| Key | Type | Holds |
|-----|------|-------|
| `esi:b:{group}\|{user}:state` | HASH | `limit`, `window`, `metered`, `remaining`, `observed_at`, `gated_until`, `tat`, `probe_until` |
| `esi:b:{group}\|{user}:ledger` | ZSET | member `{id}:{cost}`, score = unix expiry of that charge |
| `esi:errors:{unix_minute}` | STRING | non-2xx/3xx count for the legacy 420 guard, TTL 120s |
| `esi:downtime` | HASH | fleet-wide availability gate: `gated`, `probe_until`, `backoff`, `last_ok` |
| `esi:path:{path}:group` | STRING | learned `X-Ratelimit-Group` for a path, TTL 24h |

`tat` lives in the state hash so one `HGETALL` serves both the budget check and the clock.

**There is no running-sum key.** Spend is summed from the ledger inside the script. A bucket holds at
most `limit ÷ cost` members — a few hundred — which is trivial to iterate in Lua at these rates, and
it removes the class of bug where a parallel counter drifts from the set it mirrors.

## Script contracts

Two scripts. Both take Redis `TIME` as the clock, so no caller's wall clock enters the decision.

### `reserve`

```
KEYS: state, ledger, errors:{minute}
ARGV: count, cost_each, class, class_floor, contended_claim,
      max_share, min_spacing, probe_ttl, error_limit_stop
```

1. If `gated_until > now`, return gated with `gated_until`.
2. If the error counter is at `error_limit_stop`, return gated to the top of the next minute.
3. **Discovery.** If `limit` is unset, this bucket has never been observed. If `probe_until > now`
   another caller is already probing — return a retry at `probe_until`. Otherwise set
   `probe_until = now + probe_ttl`, grant exactly **one** slot, and return it marked as a probe. The
   settle for that request writes `limit`, `window` and `metered`, or clears `probe_until` on failure
   so the next caller probes.
4. **Unmetered buckets.** If `metered` is false, ESI is not token-metering this route. Skip the ledger
   entirely and pace on `min_spacing` and the error counter alone.
5. Drop ledger members whose score is `<= now`; sum the survivors as `spent`.
6. `available = min(limit - spent, remaining_if_fresh)`, then narrowed to this class: its own
   `class_floor × limit` is always spendable, plus its `contended_claim` on whatever is left above the
   sum of all floors. Ledger members carry their class so a class's own spend is known. When
   `max_share > 0`, this endpoint's live entries are additionally capped at `max_share × limit`.
7. If `available < count × cost_each`, return the earliest ledger expiry that frees enough.
8. Compute the interval from how full the bank is, so a spike spends banked tokens and then
   decelerates — see [Bursting and deceleration](#bursting-and-deceleration). For each slot:
   `slot = max(now, tat)`, then `tat = slot + interval`. The interactive class takes `slot = now` and
   pushes `tat` back.
9. Add one ledger member per slot at the pessimistic cost, scored `slot + window`, tagged with the
   endpoint so `max_share` can be evaluated on the next pass.
10. Write `tat`, set TTLs, return `{granted, slots[], ids[], headroom}`.

### `settle`

```
KEYS: state, ledger, errors:{minute}
ARGV: id, actual_cost, status, observed_at, limit, window, remaining, retry_after
```

1. `ZREM` the reservation. If `actual_cost > 0`, re-add at that cost scored `observed_at + window`.
   A released reservation is `actual_cost = 0` and needs no second script.
2. Update `limit`, `window`, `remaining` only when `observed_at` is newer than the stored value, so a
   slow response cannot overwrite a fresher reading.
3. On `retry_after > 0`, set `gated_until = observed_at + retry_after`.
4. On a non-2xx/3xx status, `INCR` the error counter and set its TTL when it is new.

Because a 429 gate is written to shared state and read by `reserve`, every replica stops within one
block of the first 429 rather than each earning its own.

## Bursting and deceleration

A token bucket exists to be spent. Pacing at the sustained refill rate would leave a full bank
untouched and drag a region pagination out over hours, so the interval is a function of how full the
bank is rather than a constant:

```
fill = available ÷ limit                     -- 1.0 = full bank, 0 = spent
sustained = window × cost ÷ limit            -- the long-run refill interval

if fill >= glide_from:
    interval = min_spacing                    -- burst: as fast as this endpoint is allowed
else:
    interval = min_spacing + (sustained - min_spacing) × (1 - fill ÷ glide_from)
```

So a queue spike against a full bucket runs at `MinSpacing` — the endpoint's own ceiling, not a
global 3/s — draws the bank down, glides progressively slower as it empties, and settles at the
refill rate. Because the window floats, tokens return continuously, so the bank refills under the
tail of a burst and the endpoint speeds back up on its own.

Three things make bursting safe rather than reckless:

- **Class floors** keep every class's guaranteed share unspendable by the others, so a burst in one
  cannot leave another with nothing — in either direction.
- **`MaxShare`** keeps one endpoint from spending a shared bucket's whole bank.
- **The glide itself** means we never hit zero at speed. Slamming into an empty bucket is what earns
  a 429; decelerating into it is what avoids one.

All of this is computed inside `reserve` from shared state, so every replica decelerates on the same
curve at the same time. One replica cannot burst while another throttles.

There is no configured requests-per-second anywhere in this design. The floor is derived from the
observed allowance and the ceiling is `MinSpacing` per endpoint.

### Headroom a burst can actually use

The measured figures say the headroom is large and currently unused. `market-order` allows 6.67 req/s
sustained and we pace at 3; a sampled region pagination spent 356 of 12,000 tokens. So a spike can be
driven well above the present rate and still finish inside a few percent of the window — this is the
concrete case the glide exists to serve.

It also settles a question this design does **not** need to answer. A job larger than its whole bucket
would have to span windows and could not be restarted from the beginning, which would make a resumable
page cursor mandatory. At 356 tokens against 12,000 nothing is close, so no cursor is planned. Stage C
re-measures against the busiest hub rather than the sampled one; only a measurement that changes this
picture would put resumability back on the table.

The scheduler's `estimatedTokensPerRegionRefresh = 1000` is roughly 3× the sampled cost and is
compared against 12,000, so `canAffordRegionRefresh` effectively never defers. Stage E replaces the
constant with the ledger's measured cost, which makes the gate meaningful rather than decorative.

## Deriving limits from ESI

A bucket's allowance is an observation, never a constant. `limit` and `window` are parsed from
`X-Ratelimit-Limit` (`"150/15m"` — both halves), `remaining` from `X-Ratelimit-Remaining`. If CCP
changes an allowance, the next response carries it and `settle` adopts it; nothing in the repo needs
editing and nothing silently keeps spending against a number that is no longer true.

That leaves four states a bucket can be in, and the design has to answer all of them:

| State | How it is reached | Behaviour |
|-------|-------------------|-----------|
| **Undiscovered** | No response has been seen for this bucket | One probe request at a time; everyone else waits on `probe_until` |
| **Metered** | A response carried `X-Ratelimit-*` | Full ledger accounting against the observed limit |
| **Unmetered** | A response carried none — a legacy route | No token accounting is possible; paced by `MinSpacing` and guarded by the fleet-wide error counter |
| **Stale** | The state key aged out after `2 × window` of silence | Returns to undiscovered and re-probes |

The probe is the only place a request is admitted without a known budget, it is limited to one in
flight per bucket across the fleet, and it costs at most the tokens of a single call. That is the
honest cost of not hard-coding a number — and it is bounded, unlike a wrong constant.

Two consequences worth stating plainly. A limit **reduction** by CCP is absorbed within one request,
because `settle` lowers `limit` and the next `reserve` sees less headroom. A limit **increase** is
also absorbed within one request, so we do not spend days under-using a raised allowance. Neither
case needs a deploy.

The one number this project does hard-code is the **token cost table** — 2 / 1 / 5 / 0 by status
class. That is a documented property of the protocol rather than a per-bucket allowance, and it is
verified against a response's own `X-Ratelimit-Used` in tests so a change would surface as a failure
rather than as drift.

## Acquisition

`Do` never calls Redis itself. It asks the dispatcher for a permit and the dispatcher decides:

1. A permit already due for this bucket and class → hand it over.
2. Otherwise compute the queue position and the ETA from the slots the dispatcher holds.
3. ETA within this class's `Tolerance`, and under `WaiterCap` → wait in place on the priority queue.
4. Otherwise return `RateLimitError` with the exact ETA. The worker requeues; the api answers.
5. A gate arriving mid-wait closes a generation channel so parked waiters bail out immediately rather
   than holding a slot for a wait that is no longer worth anything.

Waiters are ordered by `(class, arrival)`, so an interactive request takes the next permit rather than
the fourth. Tolerance inverts by class: interactive waits, because a requeue would add asynq's retry
delay on top; bulk yields early so the worker slot goes to something else.

The permit is never bound to a caller before hand-off, so a caller that walks away costs no slot.
The known trap is the select race — a permit and a timeout both ready, consuming a permit that is then
discarded. Hand-off is a claim the dispatcher retries with the next waiter, not a bare channel receive.

### Elastic and inelastic work

Publish-time gating only applies to work we decide to create. A cron refresh can be deferred; a user
logging in cannot. The two need different treatment and the difference is visible at ingress:

| Path | Trigger | Bucket | Elastic |
|------|---------|--------|---------|
| `cron.regionMarketOrdersRefresh` | internal, `*/15` | `market-order` | Yes — defer at publish |
| `cron.industrySystemsRefresh` | internal, hourly | `industry` | Yes |
| `cron.adjustedPricesRefresh` | internal, hourly | `""` | Yes |
| ESI status check | internal, fronts several tasks | `status` | Yes |
| `PublishUpdateAccountSessionGrants` | **api — a user logs in or opens corporations** | `""` | **No** |

The externally-triggered path is the one that cannot be told to come back later, and today it runs in
the unmetered bucket with no accounting at all. It is also bursty and batched: one login with many
characters is several `/characters/affiliation/` calls.

**Every class gets a floor, not just the inelastic ones.** A one-sided reserve — capacity held back
*from* bulk — lets sustained external demand defer a cron refresh forever, and a market book that is
never refreshed is a silent failure: the scheduler logs a skip each cycle and the data quietly ages.
So the budget is divided by guaranteed minimum share instead:

```go
// ClassFloor is the share of a bucket a class may always spend, whatever
// else is competing. Floors sum to <= 1.0; the remainder is contended.
type ClassFloor struct {
    Class Class
    Floor float64
}
```

A class may always spend up to its floor. Capacity above the sum of the floors is contended and goes
in class order, so a quiet system still lets any class burst into the whole bucket. Bulk cannot be
starved because its floor is not something external work is allowed to take.

| Class | Work | Guaranteed floor | Above the floors | On a long wait |
|-------|------|------------------|------------------|----------------|
| `ClassBulk` | Internal cron refreshes | Always spendable | Last claim | Yields early; also deferred at publish |
| `ClassStandard` | External async (session grants) | Always spendable | Second claim | Waits rather than yields |
| `ClassInteractive` | External sync, a user blocked | Always spendable | First claim | Waits; falls back to 202 |

`Headroom` is therefore **class-scoped** — `Headroom(ctx, bucket, class)`. A scheduler asking whether
it can afford a refresh must be told what *bulk* can afford, not what the bucket holds in total, or it
will defer on capacity that was never available to it and skip on capacity that was.

The system still balances itself above the floors: external arrivals spend contended tokens, fill
drops, the glide slows everything, and the scheduler stops publishing *discretionary* bulk. What
changes is that the recession has a bottom.

### Elasticity is a property of age, not of task type

A floor keeps refreshes progressing, but slowly — and "slowly" is only acceptable while the data is
still worth having. A market book fifteen minutes stale is fine to defer; one two hours stale is not
bulk work any more.

So a scheduled refresh's class rises with its staleness. The scheduler's first question is how old the
data is against the `max-age` ESI advertised for it, and only its second question is what it can
afford:

| Data age vs advertised expiry | Class published at |
|-------------------------------|--------------------|
| Within expiry | Not published at all — nothing to fetch |
| Up to `StaleSoft` past expiry | `ClassBulk` — defer freely |
| Past `StaleSoft` | `ClassStandard` — competes with external work |
| Past `StaleHard` | `ClassInteractive` — published regardless of discretionary headroom |

That makes deferral bounded by construction. Work can be delayed while delay is cheap and stops being
deferrable once it isn't, without anyone having to decide that a queue has "waited long enough".

Consecutive deferrals per cron job and data age against target are both recorded, so a job that is
quietly never running is visible rather than inferred from an absence. Today
`canAffordRegionRefresh` logs a warning per skip and nothing counts them — the region index does not
advance on a skip, so a hub keeps its turn, but all four stall together and nothing says so.

Class travels with the message and defaults from the task `Definition`, the same way
`DefaultPriority` does today — so it is declared once in `shared/nats/tasks.go` rather than hand-set
at each ESI call site, where it would drift. The api's own direct calls declare `ClassInteractive`
explicitly.

### A long wait has a cause, and the cause picks the answer

The glide makes the interval a function of fill, and the ledger holds the timestamp at which every
live token returns. Between them the dispatcher can say not only how long the wait is but **why**, and
when it will end — which the current limiter cannot, because every refusal arrives as an undifferentiated
`wait_until`.

| Kind | Cause | `RetryAfter` |
|------|-------|--------------|
| `KindQueued` | Bucket healthy; waiters ahead | The caller's own slot — the queue drains at burst pace |
| `KindDecelerating` | Fill below `GlideFrom`; the interval is stretching | The ledger expiry at which fill recovers **above** `GlideFrom` |
| `KindGated` | 429 or spent | `gated_until` |
| `KindErrorLimit` | Fleet-wide 420 guard | Top of the next minute |
| `KindDowntime` | TQ observed unavailable | The next probe time, not a clock-based window end |
| `KindBudget` | Caller's deadline cannot cover its slot | The slot it would have had |

`KindDecelerating` is the one that pays for itself. Sending a task back at its next slot returns it to
a bucket that is still low, so it waits again, yields again, and each round trip spends budget on a
replay that makes the fill worse. Returning it at **recovery** — a ZSET range over the ledger, not an
estimate — means it comes back once, into a bucket that can actually serve it.

That distinction also runs backwards to the scheduler. `Headroom` carries fill, so a decelerating
bucket is a signal to stop publishing bulk work *before* anything starts waiting on it. Deferring a
publish costs nothing; deferring a started task costs a worker slot and a requeue.

The yield decision therefore stops being a comparison against a fixed constant. It is expected wait,
which the glide makes computable, against the cost of coming back, which is the retry delay plus the
task prologue plus any work the task would repeat.

## Wire compatibility

**Breaking, migrate-required, and the reason the cutover is one cut.** The `esi:group:*` namespace has
four consumers besides the writer:

| Consumer | Reads |
|----------|-------|
| `shared/core/redis/market_orders.go` | `esi:group:market-order:token_limit`, `:tokens:sum` |
| `core/scheduler/esi/regionMarketOrdersRefresh.go` | both of the above, to gate publishing |
| `core/metrics/esi` | scans `esi:group:*` for `:rate:next_allowed` and `:token_limit` gauges |
| `core/commands/cli/esi_groups.go` | operator surface over the same keys |

The new schema keys on `(group, userID)` and drops `tokens:sum`, so all four move together in
**Stage E**. `shared/core/redis/market_orders.go` is retired: the accessors become `Headroom` on the
shared client, so the key strings exist in one place.

**The hazard to design against:** `canAffordRegionRefresh` fails **open** — an unreadable or missing
limit returns `true`. A key rename alone would not error, it would silently remove the budget cap and
let every cycle publish. Stage E must convert that helper in the same change that renames the keys,
and its test must cover the missing-key path.

### Cutover and rollback

The new keys are a different namespace, so at cutover every bucket is undiscovered and re-probes —
one call each, bounded and expected. The old keys are left to expire by their own TTLs rather than
deleted, so nothing has to be sequenced against them.

Rollback is the deployment tool's image roll, with one caveat to know in advance: reverting to the
previous image leaves the new keys in place and the old code reading old keys that have since
expired. Old code fails **open** in that state — `canAffordRegionRefresh` returns `true` on an
unreadable limit, and `getTokenLimitFromRedis` returning `-1` disables token enforcement — so a
rollback runs unmetered on 3 req/s spacing alone until the old keys repopulate from response headers.
That is survivable at current volumes and is the reason to roll back promptly rather than sit on it.

No HTTP, NATS or persisted-document surface changes in Stages A–E. Stage F adds a 202 outcome to at
least one api endpoint, which is additive for a new endpoint and breaking for an existing one — to be
stated per endpoint when that stage is planned.

## Cross-cutting concerns

### Downtime is observed, not scheduled

The 11:00–11:15 UTC window is CCP's estimate. Real downtime finishes early or runs long, so a
hard-coded window is wrong in both directions — and asymmetrically so:

| Reality | Fixed-window behaviour | Cost |
|---------|------------------------|------|
| Ends early | Keeps blocking until 11:15 | Lost minutes on every refresh behind it |
| Runs long | Resumes at 11:15 into a dead server | Every call 5xx |

The second is the dangerous one, and it collides with the 420 guard. 5xx costs zero tokens, so
nothing in the bucket accounting slows us down, but the legacy error limit counts non-2xx/3xx —
**so hammering a server that is still down would trip a 420 across every ESI route.** A fixed window
converts a normal overrun into a fleet-wide outage of our own making.

So the window becomes a hint and observation becomes the authority. `worker/esi/status.go` already
has what is needed: a `/status/` check with a shared Redis gate on `valid_until` and single-flight so
concurrent callers share one request. That moves into `esiclient` as the downtime authority.

The gate is **fleet-wide**, not per bucket — TQ being down affects everything — and it reuses the
probe primitive already designed for bucket discovery:

1. The nominal window raises suspicion. It does not block; it lowers the appetite for starting new
   bulk work and makes the next failure conclusive rather than ambiguous.
2. The first failure — a status check failure, or 5xx from any call — sets the fleet gate.
3. While gated, exactly one probe is in flight fleet-wide, on exponential backoff. Everything else is
   refused immediately with `KindDowntime` and the next probe time.
4. The **first successful probe clears the gate**, so an early finish resumes at once instead of
   waiting out a window that has already ended.

The same machinery covers unscheduled outages, which the wall-clock predicate cannot see at all
today. `core/scheduler/esi` keeps `DeferPublicationUntilAfterDowntime` — deferring a publish is its
own behaviour — but reads the observed gate rather than holding a second copy of the times, which
also retires the duplicate window in `worker/ratelimiter/redis_client.go`.

#### What happens to the status check

`worker/esi/status.go` is absorbed by the gate rather than moved across. Its role changes from a
**pre-flight each task performs** to a **probe the gate performs**, and most of it stops being needed:

| Today | After |
|-------|-------|
| Four tasks call `CheckServerStatus`, then `HandleStatusCheckResult` | Nothing calls it; a task that cannot run gets `KindDowntime` from acquire |
| Redis `valid_until` gate + process-local `lastCheckTime` + in-flight waiter channels | One fleet gate; `probe_until` already gives single-flight across replicas, not just within a process |
| A check runs on each task's schedule | A probe runs only while the gate is uncertain, on its backoff |
| `StatusResult` with `Available`, `Status`, `ETag`, `Cached`, `Error` | The gate's `last_ok` and `probe_until` |

Two things this fixes rather than merely relocates.

**The circular dependency goes.** `CheckServerStatus` calls `/status/` *through* the rate limiter, so
an exhausted `status` bucket makes the pre-flight return a `RateLimitError` and the task fail — even
when TQ is perfectly healthy. The gate probe is the one call admitted while gated, so the check that
decides whether we may call ESI is no longer subject to the budget it is deciding about.

**The `status` bucket nearly empties.** It is 600/15m — our second smallest — and it exists almost
entirely to answer a boolean for four task types. Probing only on uncertainty removes that standing
cost. The probe keeps its `If-None-Match`, since a 304 costs 1 token against a 2xx's 2.

`ServerStatusResponse` (`players`, `server_version`, `start_time`) is fetched and written to Redis and
**read by nothing** — no caller outside `status.go` touches those fields. The payload and the
`SaveServerStatus` / `GetServerStatus` pair in `shared/core/redis/server_status.go` go with it, unless
we decide to surface player count somewhere, which would be a new feature rather than a port.

With `compatibility_date.go` also going, the `worker/esi` package ceases to exist.

### Request headers and transfer handling belong to the client

`shared/httpclient.ApplyDefaultHeaders` supplies the User-Agent and nothing else, and every ESI call
site retypes the rest: `Accept: application/json` and `Accept-Encoding: gzip` at four sites,
`X-Compatibility-Date` at five, `Content-Type` at one. The client sets all of them — the User-Agent
still through `shared/httpclient`, which stays the owner of that string.

Setting `Accept-Encoding` by hand has a consequence worth naming, because it explains three copies of
the same code: `http.Transport` only decompresses transparently when **it** added the header, so
declaring it manually turns that off and each caller decodes for itself. `refreshSystemIndexes`,
`refreshAdjustedPrices` and `regionMarketOrdersFetch` each build their own `gzip.NewReader`, while
`tunedTransport` already has `DisableCompression: false`.

Simply dropping the header would lose something real: `regionMarketOrdersFetch` wraps the body in a
counting reader *before* decompression to record wire bytes in `TotalBytes`, and transparent
decompression makes that unmeasurable. So the client keeps the explicit encoding and owns both
halves — it counts compressed bytes, decompresses, and hands the caller a plain reader plus the
transfer size on `Response`. One implementation, and the byte accounting survives.

`Response` therefore carries `Bytes int64` (compressed, from the wire) alongside `Body`, and `Stream`
returns an already-decompressed reader.

### The compatibility date is per endpoint

`X-Compatibility-Date` determines the **shape of the response**, so it belongs with the code that
parses that shape. Today one constant — `worker/esi.CompatibilityDate = "2025-12-16"` — is applied at
five call sites, which means bumping it changes every response shape at once and every parser has to
be right on the same day.

It becomes a required field on `EndpointPolicy`. Each endpoint declares the date its decoding was
written against, so moving one endpoint forward is an isolated change with an isolated test, and an
endpoint added without a date fails to build rather than inheriting someone else's.

There is deliberately **no package-level default**. A default is what turns a per-endpoint contract
back into a global one.

### Observability

`core/metrics/esi` already owns the OTel wiring and exports three gauges built by reading the
worker's Redis keys directly. It keeps the registration — that is its job — but reads through the
shared client's snapshot instead of rebuilding key strings, which removes the last cross-service key
coupling. What it should emit under the new model:

| Signal | Why |
|--------|-----|
| Bucket fill (`available ÷ limit`) | The input to the glide; the one number that explains pacing |
| Observed limit and window per bucket | Makes a CCP-side change visible the moment it lands |
| Spend per class | Shows whether floors are doing anything |
| Yields by `Kind` | Separates queue depth from deceleration from gating |
| Consecutive deferrals and data age per cron job | The starvation signal |
| Probes, 429s, error-counter level | Discovery churn and how close the 420 guard is |

### Operator surface

Two verbs exist: `RunEsiRateLimitGroups` dumps group state as JSON, and
`RunResetEsiRateLimitGroups` clears bucket and pacing state **while preserving
`esi:group:{name}:token_limit`**. That preservation is backwards under the new model — the limit is
the observation, so a reset should clear it and let the next call re-probe, keeping the pacing state
if anything. Stage E inverts it.

Worth adding while that surface is being rewritten, all through the existing `eip cli` path rather
than new host commands: per-class headroom in the dump, clearing a gate on a bucket, and forcing
re-discovery of one bucket.

### Shutdown

The dispatcher releases unclaimed reservations on graceful stop rather than letting them lapse. A
crash cannot do this and does not need to — the slots simply pass — but a rolling deploy is frequent
enough that handing the tail of a block back is worth the few lines.

### 5xx and the 420 guard

The legacy error limit counts non-2xx/3xx, which includes 5xx — responses ESI charges zero tokens
for. So a run of ESI 500s trips our guard even though it costs no budget. That is the right outcome
(an ESI outage should make us back off) but it should be recognised as outage backoff, not as
misbehaviour on our side: the log and the metric name it as such, and `KindErrorLimit` carries which
status class drove the counter.

## Testing

Every stage ships its tests. Two conventions this project follows:

- Script and state behaviour is tested against a **real Redis**, not a fake, in `*_live_test.go`
  files consistent with the existing live-test naming in `shared/nats` and `api/v1endpoints`. Lua
  semantics, `TIME`, ZSET expiry ordering and atomicity are the things under test, and a fake
  reimplements exactly the parts that could be wrong.
- Dispatcher behaviour is tested without Redis, against a stubbed state layer, so ordering, floors,
  tolerance, the permit race and gate propagation are exercised deterministically.

`fake.go` ships with Stage B so `worker/tasks/esi` and the api can drop their hand-rolled ESI mocks
onto one shared fake at Stage D and F.

Testing notes stay in this folder until promotion; on promote they go to
[`testing/services/`](../../testing/services/contents.md) as a topic for the shared client, since the
existing worker topic will no longer own this behaviour.

## Phases

Phase 1 is this folder.

### Stage A — Models, keys and scripts

`bucket.go`, `config.go`, `errors.go`, `state.go`, `scripts.go`. No HTTP and no dispatcher. Tests
cover the cost table (including 429 at zero), key construction, endpoint pattern matching and
first-match precedence, both scripts against a real Redis (reserve/settle/release, expiry sweep,
out-of-order settle, gate write and read, error counter roll), and `Headroom` arithmetic.

Downtime gets its own cases, since both failure directions are the point: a gate set inside the
nominal window clears on the first successful probe rather than at 11:15; a gate set outside any
nominal window behaves identically; only one probe is in flight fleet-wide; and refusals while gated
do not touch the error counter, so waiting out an overrun cannot trip the 420 guard.

Class floors get their own cases, because starvation is the failure they exist to prevent: a class at
its floor is still granted while another class is saturating the contended pool; floors summing above
1.0 are rejected at construction; and a scheduler asking `Headroom` for bulk is told what bulk may
spend rather than what the bucket holds.

Wait classification gets its own cases too: a healthy bucket with a deep queue reports `KindQueued`
with the caller's own slot, while a bucket below `GlideFrom` reports `KindDecelerating` with the
ledger expiry at which fill recovers — and a test asserts the second is later than the first, since
returning at the next slot is the failure this replaces.

Discovery and derivation get their own cases, because they are the guard against a CCP-side change:
an undiscovered bucket admits exactly one probe and makes concurrent callers wait; a failed probe
clears `probe_until` for the next caller; a response with no rate-limit headers marks the bucket
unmetered and falls back to spacing; a limit that changes mid-window is adopted on the next request in
both directions; and a stale bucket re-probes rather than reusing a remembered number.

### Stage B — Dispatcher and client

`dispatcher.go`, `client.go`, `fake.go`. Tests cover ordering by class, the waiter cap, tolerance per
class, mid-wait gating, the permit/timeout race, block versus direct mode, and header learning of
`X-Ratelimit-Group`. A flood test drives concurrent callers against a fake ESI server and a real
Redis and asserts that observed spend never exceeds the bucket limit.

### Stage C — Proving it before anything uses it

A harness that replays recorded ESI header sequences (including a 429 with `Retry-After`, a limit
change mid-window, and a 304-heavy pass) and asserts budget behaviour, plus a count of Redis
operations per request to confirm the amortisation.

This stage also confirms, against the busiest hub rather than a sampled one, the two measurements the
tuning rests on: each bucket's allowance and the token cost of a full region pagination. The figures
in [Measured allowances](#measured-allowances) are the current reading; Stage C sets `MinSpacing`,
`GlideFrom` and `MaxShare` from a full pass. Done when the package is complete and green with no
production caller.

### Stage D — Worker cutover

Convert `worker/tasks/esi` and `worker/app.go` to the new client, and delete `worker/ratelimiter`
entirely — package, both implementations, and its tests. `worker/esi` goes too: its status check is
absorbed by the downtime gate and its compatibility constant by the policy table, leaving nothing in
the package. The four `CheckServerStatus` pre-flights and `HandleStatusCheckResult` are removed
rather than rewired, and `shared/core/redis/server_status.go` goes with them. Call sites gain an
`Identity` where authenticated; `Class` comes from the task definition rather than the call site, so
`shared/nats/tasks.go` gains a `DefaultClass` alongside `DefaultPriority`.

`UpdateAccountSessionGrants` is the one externally-triggered ESI task and is declared
`ClassStandard`; the cron refreshes are `ClassBulk`. That split is what gives the floors something to
protect.

The five `X-Compatibility-Date` call sites collapse into the policy table, each row starting at the
current `2025-12-16` so the cutover changes no response shape. `worker/esi.CompatibilityDate` is
deleted rather than left as a default.

### Stage E — Scheduler, metrics and CLI

Move `core/scheduler/esi`, `core/metrics/esi` and `core/commands/cli/esi_groups.go` onto class-scoped
`Headroom` and the new keys; retire `shared/core/redis/market_orders.go`. Replace the fixed
`estimatedTokensPerRegionRefresh = 1000` with measured per-region cost recorded by the ledger.

Add the staleness escalation: the scheduler compares data age against the advertised expiry, raises
the published class past `StaleSoft`, and publishes regardless of discretionary headroom past
`StaleHard`. Record consecutive deferrals and data age per cron job so a starved refresh is visible.

### Stage F — api integration

A `ModeDirect` client in the api's dependencies, `ClassInteractive` on user-facing calls, and the
fallback when a slot is not available in time: enqueue the worker task, answer 202, deliver over the
existing websocket document fan-out.

### Stage G — Budget-driven scheduling

Schedule the next public refresh from the `max-age` ESI advertises rather than a fixed cron cycle,
using the `CacheSeconds` already captured and `NATS.ScheduleAt`. Audit that every public route sends
`If-None-Match` so a repeat pass costs 1 token rather than 2.

## Go modernisation in scope

`go fix -diff` over the packages this project touches reports:

| Path | Suggestion | Handling |
|------|------------|----------|
| `worker/ratelimiter/errors.go` | `errors.AsType` over `errors.As` | New `esiclient/errors.go` starts on the modern form |
| `worker/ratelimiter/limiter.go`, `flood_test.go` | `slices`, `wg.Go` | Moot — deleted in Stage D |
| `shared/core/redis/unavailable.go` | `errors.AsType` ×2 | Land with Stage E, which already edits that package |

`api/helper/sso/jwt.go` also reports `any` over `interface{}`, but it is outside this project's touch
surface and is not being pulled in.

## Done when

- `services/shared/esiclient` is the only ESI HTTP path in the repo.
- Every bucket is keyed on the group ESI reported and the identity the call was made with.
- No bucket allowance is written in code. `grep -rn` for a token limit or window literal outside a
  test fixture returns nothing.
- Every endpoint's scheduling is tunable in one declared table, and changing it is a code change.
- No task is requeued for a wait its class could have absorbed in place.
- A scheduler can ask what it can afford before it publishes, through one API rather than by reading
  another service's keys.
- `worker/ratelimiter` and `shared/core/redis/market_orders.go` no longer exist.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — models, keys and scripts | Not started |
| B — dispatcher and client | Not started |
| C — proving it before anything uses it | Not started |
| D — worker cutover | Not started |
| E — scheduler, metrics and CLI | Not started |
| F — api integration | Not started |
| G — budget-driven scheduling | Not started |

## Open questions

1. **The `"ip"` constant.** Fine while all replicas egress from one address. If the swarm ever spans
   hosts with separate egress, the constant becomes a lie and the ledger over-admits. Worth a
   startup log of the observed egress address so the assumption is visible rather than implied.
2. **Whether more external ESI paths are coming.** Session grants is the only one today. Each new
   api-triggered ESI path is inelastic by nature and competes above the floors, so the floor split
   wants revisiting whenever one is added rather than being set once.
3. **Which endpoints become authenticated.** Everything the worker calls today is a public route, so
   it all shares the IP bucket. Corporation membership from the api is authenticated and gets its own
   per-character bucket. Any further per-character work should be identified before Stage F so the
   contention picture is known rather than discovered.
4. **Floor values, `StaleSoft`/`StaleHard`, and the per-endpoint `MaxShare`.** Placeholders until
   Stage C measures a real window. These are tuning of our own behaviour inside an observed budget,
   so a wrong value costs throughput, never a breach — except the floors, where too small a bulk
   floor is the starvation this section exists to prevent, and wants a value derived from the cost of
   one full refresh cycle rather than picked.
5. **Burst ceiling per endpoint.** `MinSpacing` is the fastest we will drive an endpoint with a full
   bank. It is a politeness and blast-radius choice rather than a limit ESI imposes, so it wants a
   deliberate value per endpoint at Stage C rather than one number copied across the table.
6. **Probe cost on a cold start.** Every bucket needs one discovery request after a deploy that
   clears Redis, or after `2 × window` of silence. With a handful of buckets that is negligible; it
   is listed so it is a known cost rather than a surprise in the first minute of a cold start.
