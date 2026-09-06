# What was done, and why

This records the work that led to this project existing. The ESI client itself — the HTTP client, the
SSO consolidation, the scheduler changes — closed as its own project and promoted to
[backend/shared/esi.md](../../backend/shared/esi.md). What follows is the work done *after* that
promotion, none of which is in live SoT yet.

## The starting symptom

Exporting the limiter's bucket metrics to Grafana showed **large gaps**: a bucket would report for a
while and then vanish from the board, then reappear. Nothing was wrong with the exporter. The gauges
were built from `Store.Buckets`, which enumerated buckets from Redis, and a bucket disappeared from
Redis the moment its last charge aged out.

## Slice 1 — separating the two lifetimes

The bucket's state key and its ledger were dying together on one TTL. They should not: a ledger holds
live charges and is genuinely finished when the last one expires, but an **allowance is a learned
fact**, not a running total. A bucket called once an hour was losing its allowance between calls and
dropping out of the fleet inventory entirely.

Split into two TTLs:

| Key | TTL | Reason |
|-----|-----|--------|
| ledger | `max(window × 2, 60s)` | dies once every charge has aged out |
| state | `max(window × 8, 600s)` | two hours at a 15m window — past the hourly refreshes, short enough that a bucket nothing calls stops being reported |

That closed the gaps. Two defects surfaced while doing it:

- **`Store.Forget` deleted the whole state hash**, which cleared `metered` along with the allowance.
  With `metered` gone the limiter stopped consulting the surviving ledger and spent freely. It now
  `HDEL`s only the allowance fields (`limit`, `window`, `remaining`, `observed_at`).
- **Region refresh deadlocked after a deploy.** ETags survived the deploy but the allowance did not,
  so `available: 0` was read as "no budget" rather than "nobody has said yet". `Headroom` gained a
  `Known` flag and `CanAfford` now admits an undisclosed allowance. Found by reading live logs, not
  by a test.

## Slice 2 — telling the truth about spend

The board could now show a bucket continuously, but `token_used` was only ever *our* spend. ESI counts
what it charged the **address**, which is more: another caller behind the same address, or a ledger
that started empty after a deploy.

Reserve now reconciles on every read. The difference between what `X-Ratelimit-Remaining` implies and
what the ledger holds is written as a single charge under a reserved class marker, so it counts
against the bucket without being attributed to a floor or an endpoint share that did not spend it. It
is replaced rather than topped up — accumulating it would compound the same gap every call.

A first attempt exposed this as a **drift** gauge. Once the cold-start seeding landed, drift was
always near zero by construction — a degenerate metric that could only ever confirm itself. Replaced
with `unaccounted`, which reports the size of that reconciled difference and is a real signal: a
spike after a deploy is a cold ledger catching up.

Reconciliation was first written into settle, which added a **second full walk of the ledger** on
every response — double the read cost. Moved into reserve, where the totals it needs have just been
walked anyway.

## Slice 3 — why the sorted set had to go

Pressed on whether the extra work cost anything, the honest answer was that nobody had measured it. So
`testing/ledgerbench` was built to measure rather than argue, against a throwaway Redis.

The finding: **the sorted-set ledger's read cost grows linearly with traffic** because it holds one
member per call. At 12,000 charges — one ordinary 12,000-token bucket met by conditional hits — a
single reserve costs 6.1ms of Redis time, and every replica pays it on every call. Full numbers in
[measurements.md](./measurements.md).

Three schemes were compared. The winner puts charges into fixed slices of the window, one hash field
per `<slot>|<class>|<endpoint>`, each field carrying its own TTL so Redis expires them. Read cost is
then bounded by traffic *variety* rather than traffic *volume*: flat at ~210µs regardless of depth,
and 19× less memory per bucket.

One measurement had to be thrown away and redone. The first benchmark flattered the hash scheme by a
factor of 78, because it wrote all its charges into one or two slots — the fill was compressed into
almost no fields. Adding `Prefill`, which spreads charges across the window the way real traffic
does, brought it back to the honest figures above.

## Slice 4 — the switch, and the bug it caught

Six blockers surfaced during the cutover, each mechanical: `const` cannot hold a `strconv.Itoa` call
so the scripts became `var`; miniredis does not implement `HEXPIREAT` so the script computes a
remaining span for `HEXPIRE`; the `now()` local was not visible inside the shared slot fragment so
the time is passed in; sync detection needed a field-grammar parser on the Go side; a test still read
the ledger as a sorted set; and retry assertions needed a slot-width tolerance.

Then the soak failed, intermittently, at `spend 199/200, refusals 1`.

**The defect was in Go, not Lua.** `Dispatcher.Settle` handles a response that names a rate-limit
group the call was not reserved against: it releases the hold back to the guessed bucket, repoints
the reservation, and settles onto the real one — still carrying the reservation's cost. Under the
sorted set that second reversal was `ZREM` of a member that was not there, a silent no-op. Under slot
counters it is an unconditional `HINCRBY -cost` against the disclosed bucket, refunding tokens
**another caller was still holding**. The fleet then believed it had budget it did not, and the origin
issued its 429 at the brim.

The fix is one line: the hold is zeroed when a reservation moves buckets. Every cold start on a fresh
path takes that route, and with three replicas holding separate group caches over one Redis, two
landing in the same slot is what made it intermittent.

Two process notes worth carrying forward, both mistakes:

- I diagnosed this by reverting to `HEAD` and observing 8 clean runs, and called that strong evidence
  the regression was new. At the measured 10% failure rate, 8 clean runs happen 43% of the time. The
  diagnosis was right, but that reasoning did not establish it — finding the mechanism did.
- `charge_slot` silently `HDEL`s a field that goes negative. A negative field has exactly one cause:
  a charge reversed twice. The system had the evidence and threw it away, which is why the first item
  in [plan.md](./plan.md) is to make it observable.

## Slice 5 — the question that opened this project

With the switch done, the standing question was whether the Redis Lua is still earning its place, or
whether it could be Go. Classifying every block of the three scripts showed roughly 120 of ~420 Lua
lines are pure arithmetic — but nearly all of it consumes values that only exist inside the
transaction (`limit` and `window` from the state hash, `spent_by_class` from the ledger fold). Lifting
it into Go does not move a computation out; it splits one round trip into two and reopens the race
the script exists to close, on the hottest key in the system.

The scripts stay. The maintainability work they need is in [plan.md](./plan.md).
