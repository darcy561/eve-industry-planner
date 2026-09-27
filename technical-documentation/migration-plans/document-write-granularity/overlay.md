# Document write granularity — behaviour overlay

How the write path behaves **while this project is in flight**. On overlap with live SoT, this file
wins for the surfaces below until the project promotes.

Stages A and B have landed, and the batch-refusal half of Stage D with them. Every write is still a
whole document, as [plan.md](./plan.md) § Starting position describes — what has changed is that a
write can now be *refused* rather than silently overwriting somebody else's, that a refusal reaches
the user instead of disappearing, and that one job another session holds no longer costs the rest of
the batch.

**A write is refused for its revision now**, because the SPA carries one — see § What a write is
checked against. The lock refusals below are live too.

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

**A write that carries one is checked against it** — Stage A below. The SPA carries the revision a job
was delivered at, so a whole-document write is conditional today; § What a write is checked against
says which writes still are not.

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

### What a write is checked against

A job keeps the revision it was delivered at and sends it back inside `_meta`, and a whole-document
write is filtered on it — so two members writing one job now refuse each other rather than one
overwriting the other silently. A job the client holds no stored copy of has no revision to carry and
is written unconditionally, which is what a create is.

**Stage A landed ahead of this, when nothing carried a revision and every write took the
unconditional path.** Stage B then taught the client to recognise a `revision_conflict`, drop the
refused write and tell the reader, which is what made carrying one safe; a landed write also counts
itself locally, so a second edit does not arrive stale against the client's own earlier write.

What is still unconditional is nothing — every write either carries a revision or is a create. What
is still *whole* is every write: the field-scoped path is built on both sides but not wired to the
wire, so a job that changed one field still sends all of them. § Stage C.

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

*Not landed* for jobs. A whole document is still what reaches the endpoint: the payload a flush sends
is the `jobArray` copy of each queued job, whatever the queue knows about it.

What the queue knows has changed. `pendingJobDocumentWrites` maps each job owed a write to the change
log entries behind it, or to `null` where nothing recorded what changed — an ESI refresh, a group
operation, a job a close resized. Closing a job supplies the entries for the job the reader had open;
everything else a close writes was changed outside the editor and is queued whole. Joining a job that
is already owed a whole-document write keeps it whole: a write that cannot say what changed cannot be
narrowed by one that can, or the fields it does not name would stop being written.

### What a write body says

One piece has landed ahead of the rest: what a write body *is*.
[`writeBody.js`](../../../frontend/src/Functions/JobDocuments/writeBody.js) turns a job and the
entries of its edit-draft change log into the two parts a field-scoped write carries.

`document` is a partial job — a field that is present is being written, a field that is absent is
unchanged. Values are read from the job as it now reads rather than from the patches, so a field
changed several times is sent once, at the value it ended on, and a path the job no longer has
anything at is not sent at all.

`removed` is a list of paths naming the rows that went, because a partial document spends absence on
"unchanged" and has none left to say "delete this row". A removal from a **list** is not said this
way: clearing one element by path leaves a hole where the row was, so the list is written whole
instead and `removed` names only a key of a keyed collection.

Both parts are settled against the job as it now reads, so they never name the same ground — which a
stored document refuses. A removal inside a collection the write already carries whole is dropped, as
is a removal of a key the job still has, which is what a retry against a reloaded job produces.

Removing a top-level field throws rather than being written: a job has no optional top-level field,
and one stored without its `build` cannot be read back.

### What a close writes

*Not landed.* A close collects every job it changed besides the edited one — the parent and child
links the reader made, anything the defensive pass repaired, and anything the recalculation resized —
and writes the edited job, its temporary children and all of those, whole and unconditionally,
through `saveJobsViaApi`.

What it will write is decided: the edited job from its change log, and every job it changed besides
that one whole, but conditional on the revision of the copy it was written from. A job the client holds no stored
copy of is the exception — there is nothing for a revision to be read from, so it is written as a
create. That is decided per job by whether a stored copy exists, not by the job having arrived as a
new child: the map of children a close adds can also carry a group job that already exists. § Stage C of [plan.md](./plan.md)
carries why. The behaviour a reader sees is unchanged except that a write built on a job that has
since moved is refused instead of overwriting it; the planner already shows a parent and child whose
sizes disagree, so a write that did not land is visible where it matters.

### What the server derives a write from

`models.JobSetPaths` walks the body's raw JSON for presence beside the decoded job for values, and
takes each stored path from the model's bson tags. Presence has to come from the raw JSON because a
decoded zero and an absent field are the same value; the values come from the decoded job so a field
the handler rewrote — a ciphered id, a stamped schema version — is written as it left it. A field
with no stored path of its own promotes the write to the row holding it, whatever else that row
carried.

`models.JobUnsetPaths` resolves each removed row against `models.Job` itself, a segment naming a
field and a segment after a map naming one of its keys. A path that leaves the model is refused, and
so is one that does not end at a key of a keyed collection: a struct field is not a row, and a list
row cleared by path would leave a hole where it was.

### What a field-scoped write becomes

`SetFieldsWithRevision` builds the update a partial write makes, as
`SetDocumentWithRevision` does for a whole one: the fields it was given, `_meta` set field by field,
and the counter left to `$inc` alone — a stored document refuses an update that sets a subdocument
and increments a path inside it.

It refuses any two paths that reach into one another, whichever half named them, and any path into
`_meta`. A stored document refuses such an update whole rather than in part, so the write would be
lost either way; refusing it here is what names the two paths that disagreed. The client makes the
same correction for itself over json names before the model has resolved anything — see
§ Stage C of [plan.md](./plan.md) for why both exist.

**The overlap check orders paths by their segments, not as strings, and that is load-bearing.** Sorted
by segments, anything sorting between a path and a path inside it shares the first as a prefix too, so
an overlap anywhere in the set is an overlap between neighbours — which is what lets the check compare
only each adjacent pair. Plain string order does not have that property, because a row key may hold a
character below `.`: material ids are routinely hyphenated, and `34-old` sorts between `34` and
`34.quantity`, hiding the pair from a neighbours-only comparison.

`BulkUpsertJobFields` applies each write conditionally and never upserts. A write carrying no
revision is refused rather than written: setting some fields into a document that is not there would
store a job made only of those fields. The handler never sends it one, so that refusal is a guard
against a caller building such a write by hand rather than something a request can reach.

### How the handler reads a write

`PutJobDocumentsHandler` takes a batch of envelopes rather than a batch of jobs. A write naming no
job is refused with the whole batch, because a refusal names the documents it refused and a write
with no id is nameable nowhere — dropping it would leave the caller unable to tell which of its
writes never happened. The lock gate then asks about each job by the id, membership and group the
envelope carries, and a held job is dropped from the batch as before.

What survives is decoded under the typed model — a document the model cannot read is named rather
than costing the batch — and put through the entity cipher before any write is planned, because a row
holding an id the cipher rewrites is written whole and is read from the job as it stands.

**The envelope's revision marks a write as field-scoped, not as a change.** A write naming none
carries its whole document, which covers a job with no stored copy and a job changed with nothing
recording what changed; the second is still checked against the revision its own `_meta` carries,
which is where `BulkUpsertJobs` has always read it. So the two go to different writers and both can
be conditional.

Each writer names what it wrote, and the answer carries the union — one refusal is reported per batch
as before, so what wrote cannot be worked out by subtracting what was refused.

A field-scoped write restates `schemaVersion`, because a document only ever written field by field
would otherwise keep claiming the shape it had when something last sent it whole. It states the shape
without running the upgrader over the rest of the document, exactly as a whole-document write does
today — which is harmless while the job upgrader does nothing but clamp, and stops being harmless the
day it migrates fields: `schemamaint` finds work by selecting documents below the current version, so
both write paths would have to route through the upgrader rather than stamp the constant, or a
document either of them touched becomes invisible to that selection.

The SPA sends these envelopes: `getPendingJobDocumentWritesPayload` builds one per queued job through
[jobWriteEnvelope.js](../../../frontend/src/Functions/JobDocuments/jobWriteEnvelope.js), and the write
paths that record no log — a merge relinking parents, a delete cutting children loose — go through
`wholeJobWrites` beside it. A write the server cannot read is dropped from the queue and said out
loud, rather than retried for as long as the tab stays open.

The envelope is pinned for both sides by
[job-write/body.json](../../../testing/fixtures/job-write/body.json), the way
[write-conflict/body.json](../../../testing/fixtures/write-conflict/body.json) pins the refusal. It
states the reader's copy of a job, the log behind an edit, the envelope those two build, and the
stored paths that envelope reaches. The SPA test builds the envelope from the job and the log and
compares; the Go tests decode it, plan the stored update from it, and drive it through the real
handler. What the job's own fields are called is pinned separately, by
[model-parity/job-schema.json](../../../testing/fixtures/model-parity/job-schema.json); this file
pins what wraps them.

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
check: *"the version check is what makes the relaxation safe."* That check is no longer inert — the
SPA carries the revision and a whole-document write is filtered on it, so two members writing one job
already refuse each other.

What it does not yet cover is why the lock still stands. A refusal protects a *document*, and the
lock protects a *close*: a close writes the job the reader edited and every job it linked, repaired or
resized, and those writes are made one batch at a time rather than atomically. A member whose
neighbouring job moved under them learns so by refusal, and the reader is told — but the close has
already half-landed. The lock is what stops two members reaching that state, and nothing in the
revision check replaces it.

So the group lease still stands in for every job in it, and every write path still consults the lock.

Owed here, once conditional writes are live: what the group lock covers once it stops covering member
jobs, what a write path does with the lock after it stops gating, and which of the lock's Redis
machinery survives.

## Stage E — Delta delivery and client apply

*Not landed.*

The change stream already captures `updatedFields` and `removedFields` and uses them only to suppress
a schema-maintenance update. They are not yet meaningful: a `$set` of the whole job marks every field
as updated, so the delta is the document under another name until Stage C lands.

All three of those are now settled in [plan.md](./plan.md) § Stage E — the envelope is the Stage C write
envelope travelling the other way, the client applies a merge onto the base it already holds, and a gap
is proved by the pair of `_meta.revision` values a delta moves between and answered by reloading the
document. Nothing of it runs yet, so this section stays empty of current behaviour until it does.

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
| A field-scoped write changes only what it names, and leaves `createdAt` and the rows beside it alone | `services/shared/mongo/live_field_write_test.go` |
| A stale field-scoped write is refused, and the landed one kept | same |
| The envelope the SPA builds, driven through the real handler: only the named field, the named row and the revision move | `services/api/v1endpoints/jobdocuments/live_field_write_test.go` |
| The same envelope sent twice is refused the second time | same |

The `createdAt` row is there because the first version of that test passed against a deliberately
broken write: it seeded a job whose creation time was already the zero time, so clobbering it changed
nothing. A live test is only worth its name once the mutation it is meant to catch fails it.

The cross-client suite under `EIP_WS_E2E=1` proves the SPA's own transports against a Go fixture
rather than the real handler, and that fixture delivers back the document a write carried. A
field-scoped write carries only the fields it changed, while the real watcher looks the whole stored
document up (`SetFullDocument(options.UpdateLookup)`), so a live test driving a field-scoped save
through the fixture would see a job missing everything the write did not touch. Every write that
suite makes today is whole-document, which is why it holds.

**Still only unit-tested:** the Redis lock gate dropping held jobs. `testing/redislive` exists and no
test in this project uses it, so nothing proves a lock really held by another session causes the
handler to drop that job and write the rest. That is the largest remaining gap, and it belongs with
Stage D's remaining work rather than ahead of it.
