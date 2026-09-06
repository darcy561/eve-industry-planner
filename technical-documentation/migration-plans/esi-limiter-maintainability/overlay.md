# Behaviour overlay

Live SoT is [backend/shared/esi.md](../../backend/shared/esi.md). Where this file and that one
disagree, **this file is current** until the project promotes. Everything else in that doc still
holds.

## The token ledger is a slot hash, not a sorted set

Live SoT says *"Each charge is a ZSET member with its own expiry"*
([esi.md](../../backend/shared/esi.md), § Spend is a ledger, not a counter). That is no longer what
runs.

A bucket's ledger is **one Redis hash**. Charges are aggregated into fixed slices of the window:

- The window is divided into `SlotsPerWindow` slices (180). A 15-minute window gives 5-second slices;
  a slice is never shorter than one second.
- A charge lands in the field `<slot>|<class>|<endpoint>`, incremented by its cost. However many calls
  land in one slice from one class and endpoint, they cost a single field.
- Each field carries its **own TTL**, set to expire one slice after the slot ends plus a full window,
  so Redis retires charges without anything sweeping them. The expiry is derived from the slot rather
  than from now, so writing into a slot again never extends its life.

What follows from the shape:

**Reads cost what the traffic was varied, not how much of it there was.** A reserve reads the whole
hash — bounded by slots × classes × endpoints in play, not by call count. This is the change's whole
purpose; see [measurements.md](./measurements.md).

**A slot holds no per-reservation identity.** This is the trap. Under the sorted set a reservation was
a distinct member that settle found by id, so settling twice was harmless. A slot counter cannot tell
whose charge is whose, so settle adjusts by delta and the **caller** says which reservation and what
it held. A reversal applied twice, or applied to a bucket that never held the charge, silently takes
tokens belonging to whoever else is in that field.

That is a real defect that shipped and was caught by the soak:
`Dispatcher.Settle` releases a reservation's hold back to the guessed bucket when a response discloses
a different rate-limit group, then settles onto the real one. The reservation's cost must be zeroed at
that point, or the disclosed bucket refunds a charge it never made.

**A field is deleted when it reaches zero or below.** A field going *below* zero can only mean a
charge was reversed twice. Today that is silently discarded. Making it observable is the first item in
[plan.md](./plan.md).

## The reconciled difference is a ledger field, not a separate key

Live SoT is **wrong on where this happens**: [esi.md](../../backend/shared/esi.md) says *"Every
settle holds that difference as a single charge"*. Reconciliation was written into settle first, then
moved into reserve, because doing it on settle meant a second full walk of the ledger on every
response. Correct that sentence at promotion.

The mechanism has also changed with the shape: the difference between what ESI says it has charged this address and what this fleet recorded is held
as **one hash field** under the reserved class marker `esi-sync`, standing in for both class and
endpoint so it counts against the bucket without being attributed to a floor or an endpoint share that
did not spend it. It is replaced on each reserve, never topped up.

`BucketState.Unaccounted` reports its size, exposed as `core.esi.bucket.unaccounted`.

## Retry timing is slot-grained

When a bucket cannot afford a call, the limiter answers with when to come back. That used to be the
exact expiry of the individual charges that would free enough. It is now the **expiry of the slot**
holding them, so a returned time is never earlier than the true one and never later than one slot
width. Tests assert that bound rather than an exact instant.

## Two lifetimes, not one

| Key | TTL |
|-----|-----|
| ledger | `max(window × 2, 60s)` |
| state | `max(window × 8, 600s)` |

The allowance is a learned fact and outlives the charges, so a bucket called once an hour keeps
reporting instead of dropping out of the fleet inventory between calls.

`Store.Forget` drops **only** the allowance fields — `limit`, `window`, `remaining`, `observed_at`. It
must not delete the state hash: that would clear `metered`, and an unmetered bucket does not consult
its ledger at all.

## Gauges

Beyond what live SoT lists, the metrics package exports `core.esi.bucket.reported_remaining` (what
ESI last said) and `core.esi.bucket.unaccounted` (the reconciled difference). Seven of the nine gauge
inputs come from the state key rather than the ledger, which is why the storage change did not
interrupt the board.

## Not yet true anywhere

Nothing in this overlay has promoted. The code is in the working tree and unmerged.
