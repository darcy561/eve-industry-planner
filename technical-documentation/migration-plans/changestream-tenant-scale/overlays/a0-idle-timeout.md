# A-0 — Changestream idle timeout (baseline correctness)

**Status:** landed (code + live tests). **Not live SoT** — promotes into
[backend/core/core.md](../../../backend/core/core.md) § Changestream → JetStream with the rest of
this project.

## What changed

The core changestream watcher now runs on its own Mongo client that carries **no client-wide
operation timeout**, and each stream sets **`MaxAwaitTime` = 30s**.

| Surface | Before | After |
|---------|--------|-------|
| Watcher client | Shared `ConnectPrimary` handle (`SetTimeout` 10s) | `ConnectWatch` handle, no operation timeout |
| Stream options | `FullDocument`, `FullDocumentBeforeChange` | Adds `SetMaxAwaitTime(30s)` |
| Client lifetime | Process-wide | Created on gain-primary, disconnected on lose-primary |
| Idle cursor | Died every ~10s; loop rebuilt and replayed `StartAfter` | Survives; server returns an empty batch each await |

## Why

`SetTimeout` is the driver's client-side operation timeout (CSOT): one deadline covering server
selection, connection checkout, the wire round-trip, and retries. It applies to every operation on
the client, `changeStream.Next` included.

A change stream is an awaitable cursor whose normal state is blocking until an event arrives, so
on an idle database the budget drained, the driver computed a `0 ms` server-side timeout, declined
to send `getMore`, and the cursor died. All four collection groups rebuilt on a ~15s cycle,
always logging `events_processed: 0`. Network RTT to Mongo was healthy throughout (~570µs), so
this was a self-inflicted deadline rather than a connectivity fault.

`MaxAwaitTime` is the correct knob for a tailing cursor: it bounds how long the **server** holds a
single `getMore` before returning an empty batch. Expiry leaves the cursor valid, so it is routine
rather than an error, and real events are still delivered immediately because the server is
already blocked waiting.

## Why a separate client

The driver exposes no supported way to clear a client-level timeout for one operation:
`csot.WithTimeout` is internal, and a context deadline only **pre-empts** the client timeout
rather than removing it. Per-call deadlines were considered and rejected — they move the ceiling
without changing that expiry destroys the cursor.

`ConnectWatch` shares all connection settings with `ConnectPrimary` via `applyBaseOpts` and
differs only in omitting `SetTimeout` and in how its pool is sized. Existing callers are
unchanged: the timeout remains correct for request/response work in api, worker, websocket,
ws-router, and capacity-controller, none of which open a production `Watch`. Cost is one extra
connection pool that exists only while this node holds primary.

## Pool sizing

Each awaiting stream holds a connection for the whole `MaxAwaitTime`, so the pool must cover
every group at once plus other work on the same client — notably the 30s connection-monitor
ping. `ConnectWatch` therefore takes the stream count from the caller and sizes the pool as
`streams + watchPoolSpare` (4); `under_primary.go` passes `len(CollectionGroups())`. Deriving it
from the group registry means Phase C's corp/alliance groups widen the pool automatically rather
than silently starving it.

Undersizing does not surface in the change streams themselves — they hold their connections
happily — but starves everything else on that client, so the ping loop logs pool-checkout
timeouts and stops being a usable health signal.

## Effect on the plan baseline

Phase A lag and hot-tenant metrics can now be gathered against a cursor that is not being torn
down on a timer, so the numbers describe tenant behaviour rather than the defect. Each rebuild
also replayed `StartAfter`, which is the window where events can be missed or duplicated — the
property Phase B's done-when depends on.

`MaxAwaitTime` doubles as the interval at which an idle group loop regains control, which is the
seam Phase B needs to service per-tenant queues when no events are arriving. Treat 30s as a plan
input, not an incidental constant.

## Verification

Live tests under the existing `EIP_MONGO_PARITY_LIVE=1` gate, run against stack Mongo on
`eip-core`:

- `TestLive_Watch_survivesIdleAndDeliversAfter` — idle 45s (3× the old ceiling) without the
  cursor dying, then an insert is delivered and its resume token advances.
- `TestLive_Watch_idleCancelIsPrompt` — cancelling mid-await returns from `Next` well inside one
  await cycle, so lose-primary teardown is not held up.
- `TestLive_Watch_allGroupsAwaitLeavesPoolRoom` — every `CollectionGroups()` stream awaits at
  once and a `Ping` on the same client still succeeds. Verified to fail with a pool-checkout
  timeout when the pool is undersized.

A throwaway probe on the old `ConnectPrimary` client confirmed the failure it fixes: `Next`
returned false with a deadline-exceeded error while idle.

## Follow-up left open

An idle `MaxAwaitTime` expiry still returns from `Next`, so the loop closes and rebuilds the
stream rather than continuing on the same cursor. That is far cheaper at 30s than at 10s, but a
tighter loop that only rebuilds on a real error would remove resume-token replay from the idle
path entirely. Deferred to Phase B, which restructures this loop for per-tenant queues.

## Touched

- `services/shared/mongo/connect.go` — `applyBaseOpts`, `watchClientFromURL`, `ConnectWatch`
- `services/core/changestream/watcher.go` — `changeStreamMaxAwaitTime`, stream options
- `services/core/changestream/under_primary.go` — watch client lifetime under primary
- `services/core/changestream/live_idle_test.go` — live idle coverage
