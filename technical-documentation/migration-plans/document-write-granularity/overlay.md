# Document write granularity — behaviour overlay

How the write path behaves **while this project is in flight**. On overlap with live SoT, this file
wins for the surfaces below until the project promotes.

Stages A and B have landed, and the batch-refusal half of Stage D with them. Every write is still a
whole document, as [plan.md](./plan.md) § Starting position describes — what has changed is that a
write can now be *refused* rather than silently overwriting somebody else's, that a refusal reaches
the user instead of disappearing, and that one job another session holds no longer costs the rest of
the batch.

**In practice nothing is refused yet for a revision**, because the SPA does not send one — see § Why
no production write is conditional yet. The lock refusals below are live today.

One thing this project depends on **has** landed, delivered by
[shared-planners](../shared-planners/plan.md) rather than here, and it is recorded below because a
reader debugging a write will meet it.

## The revision counter

Every scoped document carries `_meta.revision`, an integer counting writes to that document.

- A document is **created** holding `models.InitialDocumentRevision`, so a counter is never absent on
  a row this code wrote. Stored it is never zero.
- Every **existing** document was given one by the release step *give every document a write counter
  at `_meta.revision`*, which renames `_meta.version` where there was one and seeds the rest.
- Every **job write increments** it. `SetDocumentWithRevision` marshals the document, lifts `_meta`
  out and sets it path by path, and leaves the counter to `$inc` — because Mongo refuses a `$set` of
  `_meta` alongside an `$inc` of a path inside it, and because a `$set` of the whole block would reset
  the counter to whatever the caller's struct held, which for a decoded request body is zero.
- A revision decoded as **zero means "no counter was read"**, not "revision zero". Mongo matches a
  missing field on null rather than on zero, so a filter built from a zero matches nothing — it would
  read as a conflict on a document that is perfectly current.

**A write that carries one is checked against it** — Stage A below. Nothing the SPA sends carries one
yet, so in practice every production write still takes the unconditional path; § Why no production
write is conditional yet says what closes that.

`UpdatePlannerSettings` is the one write path that is already field-scoped — it sets only the paths it
was given and `$inc`s the counter. It is Stage C's shape, built for planner settings alone.

## Stage A — A write that checks the revision

**Landed, server side.** The SPA does not yet send a revision or read a refusal, so nothing in the
product behaves differently yet — an unversioned write is accepted exactly as before.

### What a write carries

A job's revision reaches the client inside `_meta` on every delivered document and travels back the
same way. `MetaData.Revision` has a JSON tag, `JobMetaData` inlines `MetaData`, so a client that sends
back the job it was given is already sending the revision — no request shape changed.

### What the write does with it

`BulkUpsertJobs` splits the jobs it is given by whether they carry a revision:

- **A job carrying one is written conditionally**, by `applyConditionalWrites`. `conditionalJobFilter`
  names `_meta.revision` alongside `_id`, so a document somebody has written since does not match and
  is not overwritten.
- **Upsert is off for a conditional write.** The id is deterministic, so an upsert answering a missed
  filter would write the document the filter just refused to match — the conflict silently becoming
  the unconditional overwrite the compare exists to prevent.
- **A job carrying none is written exactly as before**, batched and upserting, by
  `buildJobUnconditionalUpsertModel`. This is what lets a client that does not yet send a revision
  keep working, and it is why the change is additive.
- **The counter is still `$inc`, never `$set`.** The revision changes the filter and nothing else, so
  a client's own copy of the counter can never overwrite the document's history.

### How a refusal is detected

A conditional write is **issued on its own**, not in the batch. `BulkUpsertJobs` splits the jobs it is
given: those carrying no revision go into one unordered `BulkWrite` as before, and each job carrying
one is sent as its own `UpdateOne` whose filter names the revision.

**The write itself is the answer.** `UpdateOne` reports whether its filter matched: matched means the
write landed, no match means the document had moved. Nothing is inferred.

**Why not read the revision back afterwards.** That was the first design and it is wrong, which a live
test against real Mongo caught and no unit test could. A refused write and a successful one leave the
document at the *same* revision — in both cases exactly one write landed, the refused client's or
somebody else's — so the counter cannot tell them apart. Reading it back reported every refused write
as applied, which is silent write loss inside the mechanism built to remove it.

**Why not a batch.** `BulkWrite` answers in totals, and an unconditional write matching an existing
document contributes to `MatchedCount` exactly as a conditional one that landed does. The totals
cannot be split, and they cannot say *which* writes matched when more than one was conditional.

`describeConflict` then reads the current revision, but only for a write already known to have been
refused: what it finds cannot change that answer, only say what to reconcile against and whether the
document still exists.

### What a refused write answers with

HTTP 409 carrying `error: "revision_conflict"`, the collection, `saved`, and a `rejected[]` naming
each refused job with `docID`, `expected`, `current` and `gone`.

The two refusals this endpoint can answer share an envelope — `error`, `collection`, `saved`,
`rejected[]` — and name the document the same way, `docID`, as the changestream and the lock events
do. The rows differ beneath that because they carry different facts: a lock names who holds it and
until when, a revision conflict names what the document moved to and whether it still exists.

The envelope is read once, by `parseRefusalBody` in `Functions/Endpoints/refusalBody.js`: it parses,
refuses a body whose `error` names a different refusal, and maps the rows through a callback each
caller supplies. The two `Respond*JSON` helpers on the server stay separate for the same reason the
rows do — what they carry is not the same fact.

**The refusal is per document, and the rest of the batch still writes.** A batch in which one job
moved writes the others and answers with the one that did not — `saved` is what stops the 409 being
read as nothing happened. This is distinct from the lock gate's all-or-nothing 409, which still
answers `lock_held_elsewhere` and still writes nothing; the two conflict kinds are separate shapes
because a lock says somebody is *holding* the document and a revision conflict says somebody has
already *written* it.

The archived-jobs restore path writes unconditionally: a restored job is rebuilt from the archive
rather than edited, so it carries no revision to be conditional on.

### Why no production write is conditional yet

The SPA's `Job` class rebuilds `_meta` from `lastModified`, `createdAt` and `lastUpdatedBy` when it
constructs a job, so the revision the server delivered is dropped before `toDocument` runs. Every
write the SPA sends today therefore carries no revision and takes the unconditional path.

**This is what made Stage A safe to land ahead of its client half.** Stage B has since taught the
client to recognise a `revision_conflict`, drop the refused write and warn — so the ordering
constraint it carried is discharged, and the first write to carry a revision meets a client that can
answer it. Making one is Stage C's work.

## Stage B — A refused write is an outcome the UI handles

**Landed.** A refused write warns the user and stops being retried. All three defects are closed.

### The wire shape is stated once

The 409 body lives in [`testing/fixtures/write-conflict/body.json`](../../../testing/fixtures/write-conflict/body.json),
read by a Go test and a vitest test. A field renamed on one side alone turns the other side red,
because a drift here is silent in production: the client stops recognising the refusal, falls through
to a generic error, and the write is retried forever.

`gone` is present on every row rather than omitted for a stale one — this codebase encodes with
`encoding/json/v2`, which writes a false bool rather than dropping it.

### Recognising a refusal

`revisionConflict.js` owns the shape: `API_ERROR_REVISION_CONFLICT` is the body's `error` value,
`CLIENT_ERROR_REVISION_CONFLICT` the `Error.code` a caller branches on, and
`parseRevisionConflictBody` reads the refused rows. `throwNonOkPrivateResponse` recognises it beside
the lock conflict it already handled, and attaches the parsed rows to the thrown error so a caller
that clears a queue knows which documents to clear.

A lock conflict and a revision conflict are both a 409 carrying `rejected`, and they are told apart
on `error`. Answering one as the other would be a real defect: a lock conflict means the write is
blocked and can still succeed later, so its queue is kept.

**A recognised conflict now survives a chunked batch.** `throwIfAnySettledFailed` rewrapped the first
failure in a plain `Error`, dropping `code` — so a conflict in any batch of more than one chunk
reached the caller as an anonymous failure. It now rethrows an error that carries a code as it
stands, which the lock path needed too.

### What a refusal does

- **The queued write is dropped.** `pendingJobDocumentWrites` holds job ids and resolves them against
  `jobArray` at flush time, so keeping them re-sends whatever the array holds against a document the
  server has already refused. That write cannot start succeeding, so retrying it is an endless loop
  the user is never told about.
- **The user is warned**, with the message naming whether the jobs were changed elsewhere or removed
  — there is nothing to reconcile against when the document is gone.
- **The warning is raised once, by the flush.** Every job write in the SPA funnels through this
  queue, so the message is raised where they meet rather than copied into each caller.

### What a caller learns

`persistJobDocumentsToApi` answers `"saved" | "locked" | "conflict" | "failed"`, and
`flushPendingJobDocumentsSave` and `saveJobsViaApi` pass it through. A flush with nothing queued
answers `"saved"`: the caller's writes are not outstanding either way.

`closeActiveJob` uses it to stop claiming success: the adjustment summary reports what was saved, so
it is suppressed for every outcome that is not a write landing — `conflict`, `locked` and `failed`
alike, because none of them saved anything. An unrecognised answer is treated as saved, so a caller
that resolves nothing is not reported as an error.

### The client's own gate

A signed-in editor that cannot persist — `canPersistJobClose` false — has its edits applied to the
store and its queued writes cleared, so the work is on screen and will not survive a reload. It now
says so, matching the warning already shown for a job deleted while it was open. `closeGroup` carried
the same defect for the group lock and now warns the same way. A signed-out editor is unaffected:
local-only editing is the intended behaviour there, not a refusal.

## Stage C — Field-scoped writes

*Not landed* for jobs. The persist debounce and the outbound coalescer both carry whole documents.

Owed here: how the SPA tracks what changed through the persist debounce and the outbound coalescer,
and what the write endpoint accepts.

## Stage D — The lock stops being broad

**Part landed: the batch refusal is per document.** The rest of the stage — the group lease and the
lock becoming advisory — has not been taken, and deliberately so: see § Why the rest of Stage D is
not safe yet.

### A held job no longer costs the batch

`PUT /api/v1/job-documents` drops the jobs another session holds and writes the rest, where it used
to answer 409 and write nothing. One member editing one job used to cost every other job in the same
save, which on a shared planner is most of a close.

`dropHeldJobs` does the filtering, and the handler answers by what survived:

- **Some jobs written, some held** — 409 carrying `saved` and every held document, through
  `RespondPartialLockHeldElsewhereJSON`. Still 409, because the request did not do everything it was
  asked; `saved` is what stops a client reading that as nothing happened.
- **Every job held** — the whole-batch refusal as before, `saved` zero. There was no write to make.

`saved` is the same field a revision conflict answers with, so a client meeting either has documents
it must stop claiming it saved.

**A lock conflict is answered before a revision conflict.** One batch can produce both and a response
carries one. A held job was never written and its edits are still owed; a revision conflict's document
has moved on and the client reloads it either way. Answering the conflict first would leave the held
jobs unnamed, and the client clears whatever a refusal did not name — so it would discard work nothing
wrote. Unreachable today, because no write is conditional; it arms the moment Stage C carries the
revision.

### The client keeps only what is still owed

`parseLockHeldElsewhereBody` reads the held documents off the body, and they travel on the thrown
error as a revision conflict's rows do. `persistJobDocumentsToApi` then clears the queued ids that
wrote and keeps the held ones.

**A conflict naming no document keeps the whole queue.** It cannot be told apart from one naming every
document, and clearing on an empty list would discard edits nothing wrote.

### Why the rest of Stage D is not safe yet

[plan.md](./plan.md) § Why the lock is as broad as it is argues the relaxation rests on a version
check: *"the version check is what makes the relaxation safe."* The check is built and inert. The
SPA's `Job` class still drops `_meta.revision`, so every write arrives with no revision and takes the
unconditional path — which makes the document lock the only thing today preventing two members
overwriting each other.

So the group lease still stands in for every job in it, and every write path still consults the lock.
Relaxing either now would remove the only protection operating rather than trade it for another.

Owed here, once conditional writes are live: what the group lock covers once it stops covering member
jobs, what a write path does with the lock after it stops gating, and which of the lock's Redis
machinery survives.

## Stage E — Delta delivery and client apply

*Not landed.*

The change stream already captures `updatedFields` and `removedFields` and uses them only to suppress
a schema-maintenance update. They are not yet meaningful: a `$set` of the whole job marks every field
as updated, so the delta is the document under another name until Stage C lands.

Owed here: what a delta message carries, how a client applies it onto the document it holds, and what
happens when a client detects a gap.

## What proves this works

Unit tests cover the shapes — the filter a conditional write carries, the `$inc` that is never a
`$set`, which refusal a batch answers with, and the SPA's parsing, queue and outcome branches.

**They are not what proves the write works.** The first conditional write passed every unit test and
was broken against a real database: it decided whether a write had landed by reading the revision
back, which cannot distinguish a refused write from a successful one. Only a live test found it.

So the behaviour this project exists for is proved against real Mongo, under
`EIP_MONGO_PARITY_LIVE=1` via [`scripts/testing/live-mongo.sh`](../../../scripts/testing/live-mongo.sh):

| What it proves | Where |
|---|---|
| Two writers, one document: the stale write is refused and the first is kept | `services/shared/mongo/live_conditional_write_test.go` |
| A batch in which one job moved writes the others | same |
| A write against a deleted document is reported gone, and does not recreate it | same |
| The same, over the handlers: a 409 carrying `error`, `saved` and the refused rows | `services/api/v1endpoints/jobdocuments/live_revision_conflict_test.go` |
| A mixed batch answers `saved: 1` and names only the stale job | same |
| An unversioned write is still accepted, so a client that sends no revision keeps working | same |

**Still only unit-tested:** the Redis lock gate dropping held jobs. `testing/redislive` exists and no
test in this project uses it, so nothing proves a lock really held by another session causes the
handler to drop that job and write the rest. That is the largest remaining gap, and it belongs with
Stage D's remaining work rather than ahead of it.
