# Plan — ESI limiter maintainability

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this project exists

The ESI limiter's token ledger changed shape — from one sorted-set member per call to a slot-aggregated
hash — because the old shape's read cost grew linearly with traffic. The change works and is measured
([measurements.md](./measurements.md)), but it cost a real defect that reached the soak as an
intermittent 429 rather than as a named failure, and it was found by reasoning rather than by a test.

This project does **not** change what the limiter decides. It makes the limiter's invariants testable
and its failures legible, so the next change to the storage model is not another archaeology exercise.

The question that opened it — *could the Lua be Go?* — is answered in [history.md](./history.md)
§ Slice 5: no, not usefully. The scripts stay. What follows is the work that makes them maintainable.

## Goals

1. A change to the ledger's storage model is caught by a fast deterministic test, not by an 8-second
   soak that fails one run in ten.
2. A broken ledger invariant is a named signal on a board, not a silent `HDEL`.
3. One definition of any fact both Go and Lua need.
4. An operator can tell *why* the limiter refused, not just that it did.

## Phase 1 — project docs (gate) — **done**

- [x] Project subfolder under `migration-plans/`
- [x] [contents.md](./contents.md) — owns / does not own / task map
- [x] This plan, with rules acknowledgement
- [x] Row in [`../contents.md`](../contents.md)
- [x] Overlay scaffold — [overlay.md](./overlay.md), carrying the slot-hash behaviour live SoT does
      not describe
- [x] [history.md](./history.md) and [measurements.md](./measurements.md)
- [x] `go fix -diff` on the in-scope packages only — `services/shared/esiclient`,
      `services/core/metrics/esi`, `testing/ledgerbench`, `testing/esi_soak/lib`. All four clean, so
      no modernisation needs to land before this work.

## Stage A — a reference-model property test

**The highest-value item.** The ledger has one invariant worth pinning: *what Redis holds equals what
a plain Go model of outstanding holds plus settled charges says it holds.*

Drive randomised sequences of reserve / settle / release / expiry against both the store and a model,
comparing after each step. The defect this project was born from — a hold reversed twice — is a
two-token discrepancy that such a test reports on the first shrunk case, in milliseconds.

Done when: a seeded failure reproduces deterministically from the reported case, and deliberately
reintroducing the double-reversal makes it fail.

Wire compatibility: none, test-only.

## Stage B — make the broken invariant observable

`charge_slot` deletes a field that reaches zero **or below**. Below zero has exactly one cause: a
charge reversed twice. Report it rather than discarding it — a counter the script increments, surfaced
alongside the existing `unaccounted` gauge.

Done when: the soak's pre-fix behaviour would raise a named counter rather than an intermittent 429.

Wire compatibility: additive — a new gauge, no change to any existing series.

## Stage C — one definition of the field grammar

`<slot>|<class>|<endpoint>` is written in Lua (`slot_field`) and parsed in Go (`fieldClass`). Two
definitions of one format, and the Go parser returns `""` on a miss — so if the separator ever
changed, "is this the sync field?" would answer wrongly and silently.

Give Go the grammar and pass the pieces in, or at minimum round-trip it in a test both sides share.
Note that `slot_size` derives from `window`, which is read *inside* the transaction, so the slot
arithmetic itself cannot simply move to Go — this is about the field format, not the slot maths.

Wire compatibility: **migrate-required if the format changes.** Prefer keeping the current format so
in-flight ledgers survive a deploy; a format change would need ledgers to drain first.

## Stage D — name the binding constraint

Reserve refuses with a `Kind` and a retry time, but not which term bound it: the bucket being empty,
the floor owed to other classes, or the endpoint's `max_share`. Three very different operational
situations that look identical on the board today. One extra field in the script's reply.

Wire compatibility: additive to the reply array; `parseGrant` must tolerate its absence during a
rolling deploy.

## Stage E — structured ARGV

`settleScript` takes 19 positional arguments; two were added during this work. A Go struct that builds
the slice with the index list defined beside it removes the class of bug where `ARGV[18]` means two
different things on either side.

Wire compatibility: none, internal.

## Stage F — real Redis in the test matrix

miniredis does not implement `HEXPIREAT`, which is why the shipped script computes a remaining span
for `HEXPIRE` and carries a comment explaining it. The test double is shaping production code.

Run the `esiclient` store suite against a throwaway Redis alongside miniredis — the pattern already
exists in `testing/ledgerbench`. miniredis stays as the fast inner loop.

Note the constraint: a throwaway server only, never the stack's, which is published on host port 6379.
`ledgerbench` uses 6399.

## Considered and rejected

**Moving the pure arithmetic into Go behind a read/compute/CAS-write split.** Roughly 120 lines are pure
arithmetic — the floors block, the retry sort, the glide maths and the shared slot rules, out of ~420
Lua lines in total — but they consume values that only exist inside the transaction. Lifting
them makes reserve 2+ round trips with an optimistic-retry loop that degrades worst under exactly the
contention the design exists to handle — three replicas on one hot bucket. It would also cost the
single clock: the script reads Redis `TIME`, and a floating window scored by wall-clock expiry does
not degrade gracefully under replica skew.

**A token-lease redesign**, where replicas lease blocks and run all policy locally in Go. This is the
only design that genuinely reduces the Lua to near nothing, and it was costed: class floors become
per-replica rather than fleet-wide, precision at the bucket edge drops by roughly the lease size, and
a crashed replica's lease is unusable until its TTL. Rejected because the fleet-wide floor guarantee
is the thing the design was built around.

**Moving the scripts into `.lua` files with `go:embed`.** Would buy syntax checking and honest line
numbers in runtime errors. Rejected for now because `services/shared/core/documentlock/atomic.go`
builds nine scripts by the same concatenation-with-shared-fragments pattern; converting `esiclient`
alone would give the repo two conventions for one job. This is a repo-wide change or none.

**Raising `hash-max-listpack-entries` from 512 to 4096.** Halves ledger memory at 1,800 fields for the
same read time ([measurements.md](./measurements.md)). Rejected because it is a global Redis setting
affecting every hash on the instance, and production field counts sit far below the boundary. Costed
so it can be revisited if they grow.

## Open items carried in from the previous work

- `Release` semantics under slot accounting were never separately verified. `Release` is `Settle` with
  a zero outcome, so Stage A's model should cover it — but it has not been asserted on its own.
- Live SoT carries a stale sentence placing reconciliation on settle rather than reserve
  ([esi.md](../../backend/shared/esi.md), § metrics). Recorded in [overlay.md](./overlay.md) and to be
  corrected at promotion, not before — this project does not edit live SoT.
- `testing/ledgerbench/doc.go` still describes the sorted-set scheme as *"what
  services/shared/esiclient runs today"*, which stopped being true at the switch. A one-line
  correction, in scope for Stage A since that package is being touched.
- The limiter changes are **uncommitted** in the working tree, and the tree also carries a peer
  session's unrelated work. Nothing here assumes they have landed.

## Done when

Stages A and B are landed and the rest are either landed or explicitly dropped with a reason recorded
here; the overlay has been folded into [backend/shared/esi.md](../../backend/shared/esi.md); and this
folder is deleted per [`../documentation-rules.md`](../documentation-rules.md) § A promoted project
folder is deleted, not archived.
