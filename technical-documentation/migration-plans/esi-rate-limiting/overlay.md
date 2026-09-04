# ESI rate limiting — behaviour overlay

How the parts this project touches work **after** each stage lands. Live docs remain the truth
wherever this file has no section. Sections fill in as stages complete — see
[plan.md](./plan.md) § Stage status.

## Outbound HTTP

`services/shared/httpclient` is how a service makes an outbound call.

A `Client` is built from a `Config` (base URL, body cap, User-Agent, transport, `Gate`) and offers
two calls. `Do` reads the whole body; `Stream` hands back a reader the caller closes. Both return
decompressed bytes and report the compressed count that crossed the wire, so transfer accounting
survives gzip.

**Status is data.** A 404 or 429 comes back as a `Response`; `Response.Err` turns one into a
`*StatusError` for callers that want the simple path. An error means no attempt produced a response.

**Conditional requests are first class.** `Request.IfNoneMatch` and `IfModifiedSince` go out as
headers; `Response.Validators` and `Response.Cache` come back parsed, and `NotModified` reports a 304.

**Retries are per request.** `Request.Retry` is a policy, and its zero value sends once. The defaults
repeat 5xx other than 501 and transport failures, and repeat neither 4xx nor 429. A method that is
not idempotent needs `NonIdempotent`. A stated `Retry-After` is obeyed, capped by `MaxDelay`, and the
loop stops rather than sleeping into a deadline that would cancel the next attempt.

**A `Gate` admits every attempt.** `Config.Gate` is consulted before each request and told what it
cost afterwards, retries included, so a repeated call reserves the budget it spends. A gate's refusal
is returned as-is and never retried.

**Bodies in and values out.** `Request.Body` takes bytes and `Request.Form` takes `url.Values`,
which sets the form content type; `Request.Host` overrides the Host header, which setting it through
`Header` cannot do because net/http ignores that. `Response.JSON` decodes a body and reports a
non-2xx status first, and `StreamJSON` walks a JSON array from a reader one element at a time so a
large response is never held whole.

**Every finished attempt is reported.** `Config.OnComplete` receives method, URL, status, wire bytes,
duration and error. The client records no metrics and writes no logs itself; `otelhttp` supplies
client spans.

The client has no timeout of its own, so a long stream is not cut short; `Request.Timeout` bounds one
attempt of `Do`, and `Stream` leaves the read to the caller's context with the transport bounding the
wait for headers.

`NewTransport` is the shared traced transport; `NewUnixTransport` is the same over a socket.

**HTTP/2 where the origin offers it.** ESI and EVE SSO both negotiate h2, and `Response.Proto` reports
what was actually used so a downgrade is visible rather than silent. Cleartext is always HTTP/1.1 —
net/http has no h2c — so the unix socket path is HTTP/1.1 by nature. The h2 layer is configured rather
than left on defaults: ping health checks, because one connection carries every concurrent request and
a dead one stalls all of them; a write timeout for a stalled peer; and larger flow-control windows,
whose defaults can make a large body slower over h2 than over HTTP/1.1.

## Bucket identity and budget

`services/shared/esiclient` is the only path to ESI in the repo.

**A bucket is what ESI meters, not what we decided to meter.** It is keyed on the rate-limit group
named in the response and the identity the call was made with — `applicationID:characterID` when
authenticated, the server's address when not. `BucketFor` builds one; `Key()` is `group|user`.
Nothing in code names a group: the mapping from path to group is learned from
`X-Ratelimit-Group` and cached in Redis under `esi:path:`, and a path nothing has called yet takes a
placeholder bucket until the first response says otherwise.

**No allowance is written in code.** `Limit`, `Window` and `Metered` on `BucketState` are
observations parsed from `X-Ratelimit-Limit` (`"12000/15m"`), and `BucketState.Known()` is false
until a response has disclosed one. A limit CCP changes is picked up on the next call rather than
needing a release.

**A token costs what the protocol says.** `TokenCost` is 2 for any 2xx, 1 for a 304, 5 for a 4xx,
and 0 for a 429 or any 5xx — so a conditional hit is half price, which is why validators matter, and
the server's own fault is free. `CountsTowardErrorLimit` is separate and wider: it counts every
non-2xx/3xx, 5xx included, because the legacy 420 guard counts responses rather than tokens.

**Spend is a ledger, not a counter.** Each charge is a ZSET member with its own expiry, so the
window floats rather than resetting on a boundary. There is no running-sum key to drift out of step
with it.

**Endpoint tuning is a declared table.** `DefaultEndpointPolicies` is the source of truth — pattern,
compatibility date, class, `MaxShare`, `MinSpacing`, `Concurrency`, `Conditional`. First match wins,
so specific patterns go before general ones. Changing how an endpoint is paced is a code change, and
`Config.Validate` rejects a policy with no compatibility date, because the date decides the shape of
the response.

## Acquiring a slot

The `Dispatcher` is the `Gate` the HTTP client consults. It reserves before spending, queues in
process rather than requeuing through Redis, and refuses rather than holding a worker slot open.

**Two classes.** `ClassUserRequested` is work somebody is waiting on; `ClassBackground` is
everything else. Every worker ESI call is background.

**Floors are minimums, not caps.** A class may spend everything the other classes are not still owed,
plus a proportional slice of what remains — so an idle class does not strand budget, and a busy one
cannot starve its neighbour. Hand-off is two-tier: classes below their floor go first, ordered by
how far below they are, then everyone else by rank.

**Pacing follows the bucket, not the caller.** `interval` is derived from bucket fill: a full bucket
bursts at `MinSpacing` and decelerates towards the sustained rate as fill drops past `GlideFrom`.
The class cap governs admission only — reading fill from a class-capped figure would have a bulk
caller believe an empty bucket was full.

**A refusal says when to come back.** `RateLimitError` carries a `Kind` (`queued`, `decelerating`,
`gated`, `error_limit`, `downtime`, `discovering`) and a `RetryAfter`. A queued refusal reports the
queue's own drain estimate rather than echoing the caller's tolerance.

**Downtime is observed, never scheduled.** No clock appears anywhere in the limiter. Failures across
**two sources** — or eight from a lone source — conclude an outage; one endpoint retrying itself into
the ground does not gate the fleet. One replica probes, backing off from 2s towards 20s, and any
source answering reopens the gate for everyone. "Source" rather than "bucket" is the unit because
SSO is a source without being a bucket.

## Worker ESI calls

Worker tasks take `deps.ESI` (an `esiclient.API`) and make one call, all as `ClassBackground`.

- **Adjusted prices** — `GET /markets/prices/`, streamed, each row stored as it decodes.
- **Industry systems** — `GET /industry/systems/`, streamed, cost indices flattened to named fields.
  An activity ESI adds that nothing maps is ignored rather than failing the pass.
- **Region market orders** — `GET /markets/{region_id}/orders/`, paginated, each page cached
  unfiltered so the cache stays valid for any station in the region; callers filter inside `onOrder`.
- **Character affiliations** — `POST /characters/affiliation/`, batched at ESI's limit of 1000. A
  batch that fails is counted and skipped rather than abandoning the rest, because a partial answer
  still narrows what a session may see; a rate-limit refusal is the exception and stops the pass. A
  5xx is retried, since it costs no tokens and may well succeed.

**No pre-flight status call.** Availability comes from the call the task was making anyway — an
unavailable server is a downtime refusal from the request itself.

**No gzip handling, no hand-rolled array walks, no compatibility date at the call site.** The
transport decompresses, `StreamJSON` decodes one element at a time, and the endpoint policy carries
the date.

**SSO token rotation observes downtime without holding a bucket.** Rotation goes to
`login.eveonline.com`, which an outage stops like everything else, but it is not metered by ESI. The
task reads `Availability` before rotating and reports the result through `Observe`, spending no token
and reserving no slot.

**asynq treats a refusal as flow control.** `IsFailure` is false for a rate-limit error, the retry
delay comes from `RetryIn()`, and both that and the exponential fallback are spread by a
task-derived offset so replicas that failed together do not return together.

## Scheduler affordability and ESI metrics

The scheduler asks the limiter what it knows through `contract.Dependencies.ESI`. It makes no ESI
requests of its own.

**Publication waits on the observed gate.** `DeferPublicationUntilAfterDowntime` reads
`Availability` and books the run for the limiter's `NextProbe`. Because that probe interval widens
while an outage lasts, a long maintenance produces fewer deferrals rather than one per cron tick.
One schedule id per job, so a later deferral replaces the earlier one.

**How stale a hub may get is one number.** `regionSweepInterval` decides both freshness and cost: a
full four-hub pass is 837 pages and about 1,674 tokens against an allowance of 12,000 per fifteen
minutes. Because hubs come due individually, adding one costs more tokens rather than quietly making
every other hub staler.

**Affordability is measured, not estimated.** A region pagination is costed from what the last pass
actually walked: one ETag is stored per page, so `len(etags) × SuccessCost` is the figure, and
`CanAfford` answers against the bucket the work will land in — named from the region being
published, because a bucket's group is learned per exact path.

**An allowance nothing has disclosed affords the work.** `Headroom.Known` separates "no budget" from
"nothing has said yet", and `CanAfford` admits the second. Refusing it deadlocks: the allowance is
only ever learned from a call, so a caller that waits for a budget before calling waits forever.
A region nothing has fetched is published for the same reason — the first pass is what establishes
its page count. Downtime still refuses either way.

**Bucket gauges come from the shared store, and only once.** `core/metrics/esi` reports limit,
used, remaining, fill and seconds-until-open per bucket, labelled `group` and `scope` — `address`
or `character`, never a character id, which would be an unbounded metric dimension. Core can report
these while no worker is running, because the state is the fleet's rather than any one process's.

A worker reports **queue depth only** — `esi.queue.waiting` and `esi.queue.slots_held`, registered
from its own dispatcher. That division is the point: every replica reads the same bucket figures
from Redis, so reporting them per replica emits identical series that a dashboard can wrongly sum,
while queue depth is the only part a replica knows alone.

**The CLI reset forgets allowances and keeps the ledger.** The allowance is learned from response
headers and relearned free on the next call, so clearing it is how an operator recovers from a stale
one. The ledger records spend inside a window ESI is still counting; clearing it would let every
replica spend the same budget twice and earn a 429.

## api ESI calls

The api makes none. Its only outbound HTTP is EVE SSO — the token endpoint through
`shared/evesso`, and JWKS, both in `shared/evesso` — plus a feedback webhook. SSO is not metered by
ESI, so it holds no bucket and spends no token.

## Refresh cadence

A public refresh runs when ESI says its data stopped being current, not on a fixed cycle.

Each refresh records `now + max-age` under its dataset (`rediscore.SaveNextRefresh`), and the
scheduler reads that before publishing. **A 304 records a freshness too** — a 304 is ESI restating
how long the answer stays good, and honouring it is what stops the next tick paying a token to be
told the same thing.

Two shapes, because the jobs differ:

- **Adjusted prices and industry systems** each refresh one dataset, so a run inside the window is
  deferred to the moment it expires.
- **Region market orders** sweep rather than take turns. Each tick publishes every hub whose book
  has gone stale, oldest first, so a budget too tight for all of them spends what it has on the
  oldest. A hub is due once `regionSweepInterval` has passed since its last pass, and never inside
  ESI's own max-age — a call in that window is answered 304 and still costs a token.

  Nothing in the sweep spaces the hubs out, but they separate on their own. The dispatcher walks one
  book at a time, so passes finish seconds apart, and a hub whose interval elapses just after a tick
  waits for the next one. Within a few hours each hub owns a tick of its own and stays there. This is
  a consequence of walk duration against tick granularity rather than a rule, so it is held by a
  test; books small enough to walk inside one tick would stay clustered at one burst per interval.

The cron schedule is the backstop: it fires when nothing has recorded a freshness, and recovers the
cycle if a deferral is lost. A missing `max-age` leaves the previous answer in place rather than
guessing.

Every GET endpoint policy carries `Conditional: true` and every GET call site sends `If-None-Match`,
so a repeat pass costs 1 token instead of 2. `POST /characters/affiliation/` is not conditional,
because a POST is issued no validator.

## Missing live SoT to draft here

The shared client is SoT for the worker and core, so its live topic belongs under
[`backend/shared/`](../../backend/shared/contents.md) on promote. That topic does not exist yet, so
the sections above are the draft: **Outbound HTTP**, **Bucket identity and budget** and **Acquiring
a slot** describe `shared/httpclient` and `shared/esiclient` and should move there together. **Worker
ESI calls**, **Scheduler affordability and ESI metrics** and **Refresh cadence** describe callers and
belong with their own services' topics.

The api section records an absence rather than behaviour, and does not need a live home.
