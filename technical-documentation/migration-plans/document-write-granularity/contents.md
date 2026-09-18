# Document write granularity

## Owns

How a change to a stored document is written, carried and applied — whether as the whole document or
as the fields that changed.

- The **write shape**: `BulkUpsertJobs` and its siblings setting an entire document on every save,
  and what replaces it.
- What the **client tracks** so it can say what changed: dirty fields through the persist debounce and
  the outbound coalescer.
- What **delivery carries**: `updatedFields` / `removedFields` from the change stream, which are
  already captured and currently discarded.
- How a **client applies** a change onto the document it holds rather than replacing it.
- Whether two writers editing **different fields** of one document can both keep their edit, and what
  a conflicting write is answered with.
- How **broad** the document lock has to be — the group lease standing in for every job in it, the
  all-or-nothing batch refusal, and whether the lock gates writes at all or becomes advisory.
- Whether a **refused write reaches the user** — the resolve that cannot tell refusal from success, the
  client gate that discards edits silently, and the retry queue that replays current state.

## Does not own

- The ordering token, the owner-scoped baseline, and what `session_resume` may assert →
  [shared-planners/plan.md](../shared-planners/plan.md) § Stage G. That project found this problem and
  owns making write loss *visible*; this project decides whether the loss can be avoided.
- Per-owner delivery ordering and the shard FIFOs → same stage. This project assumes ordering is
  solved and does not re-solve it.
- Statistics deltas, which are already field-scoped `$inc` / `$set` operations →
  [archived-jobs-stats/contents.md](../archived-jobs-stats/contents.md). Those are a different write
  path that this project does not change.
- What the document lock is **namespaced by** — the Redis key, the waitlist, the viewer set and the
  fan-out subject moving onto the owner key so a lock exists between two members at all →
  [shared-planners/plan.md](../shared-planners/plan.md) § Stage H. That project makes the lock work;
  this one decides how wide it needs to be, and Stage D here assumes Stage H has landed.
- The document lock's mechanics as they stand — acquire, waitlist, handoff, viewer presence, lease
  modes → live SoT under [backend/](../../backend/contents.md). Stage D keeps all of it and changes
  only whether a write path consults the answer.
- Live SPA and backend behaviour, promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand why whole-document writes are a problem | [plan.md](./plan.md) § Goal, § Starting position |
| See what shared planners settled that this project depends on | [plan.md](./plan.md) § What this project inherits |
| Know what the change stream already captures | [plan.md](./plan.md) § The delta is already there |
| See the options for a conflicting write | [plan.md](./plan.md) § What a conflicting write is answered with |
| Understand why the lock covers a whole group and a whole batch | [plan.md](./plan.md) § Why the lock is as broad as it is |
| Find the ways a refused write currently reaches nobody | [plan.md](./plan.md) § A refused write is not currently an outcome |
| Know what has to land before the lock can be relaxed | [plan.md](./plan.md) § Stage A, § Stage B, § Stage D |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| See the stages and their order | [plan.md](./plan.md) § Stages |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
