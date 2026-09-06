# Raw measurements

Every figure here was produced by a command in this repository and is reproducible. Where a number
was quoted from an earlier informal observation and later re-measured, the re-measured figure is the
one recorded and the discrepancy is stated.

## Harness

`testing/ledgerbench` compares three ways of accounting for token spend inside a floating window. It
needs a **throwaway** Redis — never the stack's, which is published on host port 6379:

```bash
docker run -d --rm --name eip-bench-redis -p 6399:6379 redis:8
cd testing && go test ./ledgerbench/ -v -count=1 -timeout 20m
```

The three schemes:

| Scheme | Shape | Read cost grows with |
|--------|-------|----------------------|
| `ledger` | one ZSET member per call, scored by its own expiry | traffic volume |
| `slots` | fixed time slices, one key per slice | nothing (fixed key set) |
| `hash` | one hash per bucket, field `<slot>\|<class>\|<endpoint>`, per-field TTL | traffic *variety* |

`TestBothSchemesAgreeOnWhatHasBeenSpent` passes for all three, so the timings below compare
implementations of the same answer rather than three different answers.

## Read cost against ledger depth

Time to compute "what has this bucket spent", by how many charges are live.

```
  charges        ledger        slots         hash    ledger/hash
  100             209µs        471µs        159µs          1.32x
  840             591µs        495µs        220µs          2.69x
  3000          1.707ms        490µs        209µs          8.18x
  6000          2.797ms        505µs        229µs         12.21x
  12000         6.107ms        811µs        211µs         28.90x
```

The sorted set climbs linearly with traffic; the hash is flat at roughly 210µs. 12,000 charges is not
a stress figure — it is one 12,000-token bucket met entirely by conditional hits, which cost one
token each.

## What the hash scheme actually scales with

```
  endpoints          hash       ledger
  1                 229µs      3.713ms
  5                 692µs      5.444ms
```

The hash is bounded by slots × classes × endpoints, not by call count. Five endpoints in one bucket
roughly triples its read; the same traffic barely moves the sorted set, which was already dominated
by volume.

## Redis encoding and the listpack boundary

`hash-max-listpack-entries` defaults to 512. Below it a hash is a `listpackex`; above it a `hashtable`.

```
  fields   encoding        memory        write         read
  100      listpackex       4453B        603µs        318µs
  300      listpackex      13453B        212µs        373µs
  500      listpackex      22453B        112µs        332µs
  520      hashtable       49770B         93µs        326µs
  1000     hashtable       88170B         86µs        584µs
  1800     hashtable      161162B         89µs        863µs
```

Crossing the boundary **doubles memory** (22KB → 50KB for 4% more fields) and does not hurt reads at
that size. Raising the threshold instead:

```
  threshold                encoding        memory        write         read
  512                      hashtable      161162B        106µs        854µs
  4096                     listpackex      81761B         87µs        852µs
```

Half the memory for the same read time at 1,800 fields. **Not acted on** — it is a global Redis
setting affecting every hash on the instance, and the production field count sits far below it.
Recorded so the option is costed if field counts ever grow.

A correction worth keeping: before measuring, I predicted listpack **write** cost would grow with
field count, because a listpack is a linear structure. It does not — writes are flat or faster at
higher counts across the whole table. The prediction was wrong.

## Behaviour at counts far beyond production

```
  fields   encoding         memory        write         read
  1800     listpackex          79K         95µs        880µs
  5000     hashtable          458K        109µs      1.921ms
  20000    hashtable         1846K         89µs      7.088ms
  50000    hashtable         4505K        102µs     24.249ms
```

Reads degrade linearly past the listpack boundary; writes stay flat throughout. Production sits near
the top of the first row, so there is roughly an order of magnitude of headroom before reads become
interesting.

## Fleet memory across many buckets

```
  buckets  scheme   total memory     per bucket       read one
  50       ledger             9M           194K        1.187ms
  50       hash               0M            10K          236µs
  200      ledger            38M           195K        1.158ms
  200      hash               1M            10K          260µs
  500      ledger            95M           195K        1.391ms
  500      hash               4M            10K          209µs
```

**19× less memory per bucket** (195K → 10K) and a read that stays flat as the fleet grows. At 500
buckets that is 95MB against 4MB.

## The soak regression, measured

`TestBulkKeepsItsFloorAgainstASaturatingClass` drives three replicas at one 200-token bucket for
eight seconds and fails if the origin ever has to refuse anyone.

| Build | Runs | Failures | Rate |
|-------|------|----------|------|
| Slot ledger, before the dispatcher fix | 20 | 2 | 10% |
| Slot ledger, after the dispatcher fix | 20 | 0 | 0% |

Both failures were the same shape:

```
--- FAIL: TestBulkKeepsItsFloorAgainstASaturatingClass (8.00s)
      spend 199/200, refusals 1
  mixed_test.go:133: budget breached under a skewed mix: overspend=0 refusals=1
--- FAIL: TestBulkKeepsItsFloorAgainstASaturatingClass (8.00s)
      spend 199/200, refusals 3
  mixed_test.go:133: budget breached under a skewed mix: overspend=0 refusals=3
```

**These rates are corroboration, not proof.** At a 10% failure rate a clean run of 20 has a ~12%
chance of happening by luck. The evidence that the defect is real and fixed is the mechanism and the
discriminating test below, not the pass rate.

Two figures quoted earlier in this work were informal and are superseded here: the pre-fix rate was
estimated as "one in six to nine" and is measured at 2/20; and an 8-run clean pass on the
sorted-set build was described at the time as strong evidence the regression was new, which it was
not — at a 10% rate, 8 clean runs happen 43% of the time.

## The discriminating test

`TestASettleAfterAReleaseChargesWithoutRefunding` in `services/shared/esiclient/store_test.go` pins
the invariant directly. Run against the defect it reports:

```
--- FAIL: TestASettleAfterAReleaseChargesWithoutRefunding (0.00s)
    store_test.go:1342: Spent = 4, want 6: the settled call was charged and the held one left alone
```

Two tokens of another caller's live hold, silently refunded. That is the whole defect, in
milliseconds, deterministically — which is the argument for the property test in
[plan.md](./plan.md).

## Script surface

`services/shared/esiclient/scripts.go`, 485 lines, of which the Lua is:

| Fragment | Lines |
|----------|-------|
| `reserveScript` | ~253 |
| `availabilityRules` (shared by settle and observe) | ~40 |
| `slotRules` (shared by reserve and settle) | ~38 |
| `settleScript` | ~74 |
| `observeScript` | ~12 |

Against roughly 6,300 lines of Go in the same package. `settleScript` takes 19 positional ARGV.
