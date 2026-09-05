# ESI (`services/shared/esiclient`, `services/shared/httpclient`)

Live SoT for outbound HTTP and for every call this stack makes to EVE ESI. Packages:
[`services/shared/httpclient`](../../../services/shared/httpclient),
[`services/shared/esiclient`](../../../services/shared/esiclient).

`esiclient` is the only path to ESI in the repo. Worker tasks and the core scheduler both hold one.
EVE SSO is a separate service reached through [`services/shared/evesso`](../../../services/shared/evesso);
it is not metered by ESI and holds no bucket, and the only thing joining the two is downtime.

Worker task behaviour → [worker.md](../worker/worker.md). Scheduling and cron →
[core/scheduler.md](../core/scheduler.md). Test depth →
[testing/services/shared.md](../../testing/services/shared.md).

## Outbound HTTP

`httpclient` is how a service makes any outbound call. A `Client` is built from a `Config` (base URL,
body cap, User-Agent, transport, `Gate`) and offers `Do`, which reads the whole body, and `Stream`,
which hands back a reader the caller closes. Both return decompressed bytes and report the compressed
count that crossed the wire, so transfer accounting survives gzip.

| Behaviour | Detail |
|-----------|--------|
| Status | Data, not an error. A 404 or 429 comes back as a `Response`; `Response.Err` turns one into a `*StatusError` for callers that want the simple path. An error means no attempt produced a response |
| Conditional requests | `Request.IfNoneMatch` and `IfModifiedSince` go out as headers; `Response.Validators`, `Cache` and `NotModified` come back parsed |
| Retry | `Request.Retry` is per request and its zero value sends once. Defaults repeat 5xx other than 501 and transport failures, and repeat neither 4xx nor 429. A non-idempotent method needs `NonIdempotent`. A stated `Retry-After` is obeyed, capped by `MaxDelay`, and the loop stops rather than sleeping into a deadline |
| Bodies | `Request.Body` takes bytes, `Request.Form` takes `url.Values` and sets the form content type, `Request.Host` overrides the Host header — which setting it through `Header` cannot do, because net/http ignores that |
| Reporting | `Config.OnComplete` receives method, URL, status, wire bytes, duration and error. The client records no metrics and writes no logs itself; `otelhttp` supplies client spans |
| Timeouts | No client-wide timeout, so a long stream is not cut short. `Request.Timeout` bounds one attempt of `Do`; `Stream` leaves the read to the caller's context with the transport bounding the wait for headers |

`NewTransport` is the shared traced transport; `NewUnixTransport` is the same over a socket.

**HTTP/2 where the origin offers it.** ESI and EVE SSO both negotiate h2, and `Response.Proto`
reports what was actually used so a downgrade is visible rather than silent. Cleartext is always
HTTP/1.1 — net/http has no h2c — so the unix socket path is HTTP/1.1 by nature. The h2 layer is
configured rather than left on defaults: ping health checks, because one connection carries every
concurrent request and a dead one stalls all of them; a write timeout for a stalled peer; and larger
flow-control windows, whose defaults can make a large body slower over h2 than over HTTP/1.1.

## What a bucket is

A bucket is what ESI meters, not what we decided to meter. It is keyed on the rate-limit group named
in the response and the identity the call was made with — `applicationID:characterID` when
authenticated, the server's address when not.

**Nothing in code names a group.** The mapping from path to group is learned from `X-Ratelimit-Group`
and cached in Redis under `esi:path:`; a path nothing has called yet takes a placeholder bucket until
the first response says otherwise.

**No allowance is written in code.** `Limit`, `Window` and `Metered` are observations parsed from
`X-Ratelimit-Limit` (`"12000/15m"`), and `BucketState.Known()` is false until a response has
disclosed one. A limit CCP changes is picked up on the next call rather than needing a release.

**An allowance nothing has disclosed affords the work.** `Headroom.Known` separates "no budget" from
"nothing has said yet", and `CanAfford` admits the second. Refusing it deadlocks: the allowance is
only ever learned from a call, so a caller that waits for a budget before calling waits forever.

| Status | Tokens | |
|--------|--------|---|
| 2xx | 2 | |
| 304 | 1 | half price, which is why validators matter |
| 4xx | 5 | |
| 429 | 0 | excluded from the 4xx charge |
| 5xx | 0 | the server's fault is free |

`CountsTowardErrorLimit` is separate and wider: it counts every non-2xx/3xx, 5xx included, because
the legacy 420 guard counts responses rather than tokens.

**Spend is a ledger, not a counter.** Each charge is a ZSET member with its own expiry, so the window
floats rather than resetting on a boundary. There is no running-sum key to drift out of step with it.

## Endpoint policy

`DefaultEndpointPolicies` is the source of truth for endpoint tuning — pattern, compatibility date,
class, `MaxShare`, `MinSpacing`, `Concurrency`, `Conditional`. First match wins, so specific patterns
go before general ones. Changing how an endpoint is paced is a code change.

`Config.Validate` rejects a policy with no compatibility date, because the date decides the shape of
the response.

## Acquiring a slot

The `Dispatcher` is the `Gate` the HTTP client consults. It reserves before spending, queues in
process rather than requeuing through Redis, and refuses rather than holding a worker slot open.

**Two classes.** `ClassUserRequested` is work somebody is waiting on; `ClassBackground` is everything
else. Every worker ESI call is background.

**Floors are minimums, not caps.** A class may spend everything the other classes are not still owed,
plus a proportional slice of what remains — so an idle class does not strand budget, and a busy one
cannot starve its neighbour. Hand-off is two-tier: classes below their floor first, ordered by how
far below they are, then everyone else by rank.

**Pacing follows the bucket, not the caller.** The interval is derived from bucket fill: a full bucket
bursts at `MinSpacing` and decelerates towards the sustained rate as fill drops past `GlideFrom`. The
class cap governs admission only — reading fill from a class-capped figure would have a bulk caller
believe an empty bucket was full.

**A refusal says when to come back.** `RateLimitError` carries a `Kind` (`queued`, `decelerating`,
`gated`, `error_limit`, `downtime`, `discovering`) and a `RetryAfter`. A queued refusal reports the
queue's own drain estimate rather than echoing the caller's tolerance.

## Downtime is observed, never scheduled

No clock appears anywhere in the limiter. CCP publish a maintenance window, but it is an estimate
that runs long as often as short, so what gates the fleet is whether calls are being answered.

An outage is concluded from **three failures spanning two sources**, or eight from a lone source. One
endpoint retrying itself into the ground does not gate everything else. One replica probes, backing
off from 2s towards 20s, and any source answering reopens the gate for everyone.

"Source" rather than "bucket" is the unit because EVE SSO is a source without being a bucket. SSO
token work reports through `Observe` — no bucket, no token — and its evidence counts like any other.
A refused grant reports the server as **answering**: being turned away means something was there to
turn you away, and without that rule a batch of expired tokens would read as an outage.

## What it reports

| Metric | |
|--------|---|
| `esi.requests_total`, `esi.tokens_spent_total`, `esi.yields_total`, `esi.probes_total`, `esi.gate_closures_total` | counters |
| `esi.queue_wait_milliseconds`, `esi.request_duration_milliseconds`, `esi.request_wire_bytes` | histograms |
| `esi.queue.waiting`, `esi.queue.slots_held` | per-replica queue depth |
| `core.esi.bucket.token_limit`, `.token_used`, `.token_remaining`, `.fill`, `.seconds_until_open` | bucket state, reported once by core |
| `core.esi.publication_skipped` | refreshes the scheduler decided not to publish, by reason |

Labels are `group` and `scope` — `address` or `character`, never a character id, which would be an
unbounded metric dimension.

**Bucket state is reported once, by core.** A bucket belongs to the fleet and every replica reads the
same figures from Redis, so reporting them per replica would emit identical series a dashboard can
wrongly sum. Queue depth is the only part a replica knows alone, and it is the only part a worker
reports.

## Operating it

`core-service tasks esiRateLimitGroups` prints every bucket the fleet has learned about, plus whether
the servers are answering.

`core-service tasks resetEsiRateLimitGroups` drops the **allowance** and keeps the **ledger**. The
allowance is learned from response headers and relearned free on the next call, so clearing it is how
to recover from a stale one. The ledger records spend inside a window ESI is still counting; clearing
it would let every replica spend the same budget twice and earn a 429. The `metered` flag survives
too — clearing that would stop the limiter consulting the ledger at all, which spends without
accounting just as effectively as an empty one.

With the allowance gone the bucket falls into discovery: one caller probes, the rest wait, and normal
accounting resumes against the ledger that was never lost.
