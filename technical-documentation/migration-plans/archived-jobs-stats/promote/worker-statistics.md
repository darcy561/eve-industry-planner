# Archived job statistics (draft for `backend/worker/statistics.md`)

**Draft, not live SoT.** Promoted into `technical-documentation/backend/worker/statistics.md` when
[archived-jobs-stats](../plan.md) closes, with a row added to
[backend/worker/contents.md](../../../backend/worker/contents.md). Written in the live voice —
current behaviour only — so promotion is a move rather than a rewrite. Provenance:
[overlay.md](../overlay.md) §§ Stage B, Stage J.

---

Live SoT for how an archived job becomes figures a user can read. Code:
[`services/worker/tasks/archivedjobs`](../../../../services/worker/tasks/archivedjobs/),
[`services/shared/statistics`](../../../../services/shared/statistics/). Storage →
[shared/mongo.md](../../../backend/shared/mongo.md).

## What holds the figures

| Collection | Holds | Key |
|------------|-------|-----|
| `statistics_rows` | one archived job reduced to its figures | `{ownerKey}\|{jobID}` |
| `statistics_timeline` | monthly figures per item | owner-led |
| `statistics_totals` | lifetime totals per item | owner-led |
| `statistics_rebuild_queue` | outstanding work, one entry per owner | owner key as `_id` |
| `statistics_reconcile_rota` | when each owner was last reconciled | owner key as `_id` |

Every one of these is keyed on an **owner**, never an account id. The pipeline reads `_meta.owner` off
the documents it reduces and writes it back on the rows it produces; nothing in it branches on the
owner's kind.

## The two kinds of work

A queue entry names an owner and a `work` value. Both are dispatched by cron, and both are idempotent.

| Work | Costs | Runs when |
|------|-------|-----------|
| `delta` | proportional to the jobs that changed | a job is archived or restored |
| `rebuild` | proportional to the whole archive | the archive's shape changed, or a reconcile found drift |

**A delta is the normal path.** Archiving a job writes its statistics row in the archive request
itself, then queues a fold; the fold adds the row's figures to the aggregates and stamps it
`contributedAt`. Restoring takes them back out and revokes the row rather than deleting it, so the
history survives a job that comes back.

Rows are the fold's work list, which is why the row is written by the request rather than by the work
that follows it: a fold whose work list is rows cannot see the job that queued it.

**A rebuild recomputes everything for one owner** from its archived jobs, writes the aggregates, and
prunes buckets and totals that the new keep-list no longer names. It stamps the rows it writes as
already counted, so a fold arriving behind it does not add them twice.

## Ordering

A claim on the queue entry decides who may write. `BumpOwnerClaim` raises it, and a fold that finds the
claim has moved stands down rather than writing over a rebuild that has taken the owner on. The rule is
that a rebuild always wins: it computed from the whole archive, and a delta computed from part of it.

## Dispatch

| Cron | Every | Dispatches |
|------|-------|-----------|
| `cron.dispatchStatisticsRebuilds` | 2 minutes | one task per eligible owner in the queue |
| `cron.dispatchStatisticsReconciles` | 15 minutes | owners whose rota stamp is older than the window |

The dispatcher hands out one task per owner rather than draining the queue in the loop, so a long
queue makes progress across ticks instead of one worker holding it.

**An owner waits up to five minutes before its work is dispatched.** `rebuildDebounce` bounds the
longest wait rather than sliding with each re-queue, so an owner archiving several jobs is folded once.
A drain firing inside that window reports `eligible: 0` against a full queue — that is the debounce, not
a stall. `tasks dispatchStatisticsRebuilds` ignores it, because an operator running it by hand means now.

## Reconciliation

Every owner is reconciled on a rota, oldest stamp first, on a `reconcileWindow` of 24 hours. It rewrites
the aggregates from the rows beneath them and reports what disagreed without acting on it, so drift is
visible before it is corrected.

The owner list comes from `StatisticsOwners`, which groups `statistics_rows` on `_meta.owner`. A row
carrying no owner is skipped rather than counted: rows written before the owner existed are left for an
operator to remove, and an owner must not be invented from their absence.

## Failure

A failed delta fails its task and is retried. Once the retries are exhausted the failure is recorded on
the queue entry — `failures`, `lastError`, `lastFailedAt` — and the task stops rather than looping. That
entry is what tells a user their figures are stale.

Failure is handled by the task rather than by the request, which keeps a broken statistics write from
failing an archive that actually succeeded.

## What the client is told

A realtime message carries a `type` and a `subtype`. When an owner's figures move, the worker publishes
one, and every statistics response reports whether a recalculation is outstanding or has failed. A
client showing stale numbers as current is the failure this exists to prevent.

Archiving still invalidates its own caches at the call site. The notification tells other sessions; it
does not replace the invalidation the acting session already does.

## Operator surface

| Need | Command |
|------|---------|
| Dispatch queued work now | `eip cli dispatchStatisticsRebuilds` |
| Reconcile now | `eip cli dispatchStatisticsReconciles` |
| Queue every owner | `eip cli -- prepareRelease` (its last step) |

## Topic-only detail

Storage shapes, the owner block and index rules → [shared/mongo.md](../../../backend/shared/mongo.md).
The read API → the archive API topic. What a period cost, and how a job's figures are computed → the
same.
