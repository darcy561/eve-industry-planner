# Document write granularity — behaviour overlay

How the write path behaves **while this project is in flight**. On overlap with live SoT, this file
wins for the surfaces below until the project promotes.

Every stage, A to F, has landed on this branch; none is deployed. A save sends the fields the reader
changed where the editor recorded them, and the whole job otherwise, each checked against the revision
it was read at. A refused write reaches the user rather than disappearing, and one job another session
holds no longer costs the rest of the batch. A close, a merge, a multi-delete and an archive are each
one change, written whole or not at all. Other tabs receive a delta and apply it onto the job they
hold.

What stands between this and production is the cutover, not code: [plan.md](./plan.md) § Recommended
pickup order.

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

**Landed.** On this branch every write of a stored job carries its revision and a refusal is read,
per § What a write is checked against; production runs neither until Stage C deploys.

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

What is still unconditional is nothing — every write either carries a revision or is a create. A job
whose change log is in hand sends only what changed, per § Stage C.

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

**Landed, not deployed.** A flush sends one envelope per queued job, built by `jobWriteEnvelope`
from the `jobArray` copy and whatever the queue knows about it: field-scoped where the change log and
a revision are both in hand, whole otherwise.

What the queue knows: `pendingJobDocumentWrites` maps each job owed a write to the change
log entries behind it, or to `null` where nothing recorded what changed — an ESI refresh, a group
operation, a job a close resized. Closing a job supplies the entries for the job the reader had open;
everything else a close writes was changed outside the editor and is queued whole. Joining a job that
is already owed a whole-document write keeps it whole: a write that cannot say what changed cannot be
narrowed by one that can, or the fields it does not name would stop being written.

### What a write body says

`writeBody` in [`jobWrite.js`](../../../frontend/src/Functions/Job/sync/jobWrite.js) turns a job and the
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

A close collects every job it changed besides the edited one — the parent and child links the reader
made, anything the defensive pass repaired, and anything the recalculation resized — and queues them
through `saveJobsViaApi` beside the edited job. The edited job is written from its change log, and
every job it changed besides that one whole, but conditional on the revision of the copy it was
written from. A job the client holds no stored
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
`jobWriteEnvelope` in [jobWrite.js](../../../frontend/src/Functions/Job/sync/jobWrite.js), and the write
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

**Landed.** The batch refusal is per document; a close is sent as one change and written whole or not
at all; a refused close keeps the editor open on a review of the reader's changes; and the lock covers
one job — a group's lock covers the group's own document and nothing else, and a job's own lock still
keeps every other session's saves off it. See § The lock covers one job.

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

### The transaction a change is written in

`(*Mongo).InTransaction(ctx, fn)` in `shared/mongo` runs `fn` as one Mongo transaction on its own
session, with snapshot reads and majority writes, and commits what it wrote only when `fn` returns nil.
Whatever `fn` returns is what the caller gets back, so a refusal is the caller's own typed error and
nothing it wrote survives. It is the first use of transactions in the services; the stack's Mongo is a
replica set, which is all they need.

**`fn` can run more than once.** The driver re-runs the whole callback when the server labels an error
transient — a write conflicting with another open transaction is the ordinary case — so `fn` builds
everything it reports from scratch on each run rather than appending to something outside it.

**`Retry` steps aside inside a transaction.** Retrying one operation inside a transaction is wrong: a
transient error there means the transaction must restart, and the driver can only restart it if it
sees the error. So `Retry` runs the operation once and returns its error untouched whenever the context
carries a running transaction, and the writers built on it — the conditional job writes among them —
need no transaction-aware variant.

Live tests against the stack's Mongo show every write committed when `fn` succeeds, a write made before
a refusal undone, writes unseen outside until the commit, `fn` re-run after another transaction held
the document, and `Retry` running once inside a transaction. Removing the `Retry` step-aside, or
swallowing `fn`'s error, fails the cases written for each.

### A save marked as one change

`PUT /api/v1/job-documents` takes `"oneChange": true` beside `jobs` (`models.JobWriteBatch`). An
unmarked batch is written per document exactly as above; a marked one lands whole or not at all.

A marked batch is not held to the 100-job limit an unmarked one is, because a change cannot be split
across requests and stay one change. The 1 MB body limit still bounds it. Measured on dev only, where
a stored job is 3–5 KB, that is room for about 200 whole jobs; a live figure is owed.

| A marked batch meets | It answers |
|----------------------|------------|
| A job another session holds | 409 `lock_held_elsewhere`, `saved` zero, the held jobs named — none of the batch is dropped and written |
| A write the server cannot read or plan | 400, logged as `job_docs_put_change_unwritable` with the ids, nothing written |
| A job read at a revision it is no longer at, or deleted since | 409 `revision_conflict`, `saved` zero, every stale job named |
| A job sent without a revision whose id already exists | the same 409, that job named at its stored revision with `expected` zero |
| Nothing moved | 204, every job written |

`(*Mongo).WriteJobChange` in `shared/mongo` plans every write first — whole documents, changed fields
and creates — and refuses the change if any cannot be planned. It then makes them in order inside one
`InTransaction`. A write carrying a revision is filtered on it as it is anywhere else. A write without
one is a create, filtered on the document having no revision and upserted, so an existing job answers
with a duplicate key rather than being overwritten.

**The first write that does not apply aborts the transaction, and a read after it names the rest.**
Inside the transaction an unmatched filter is not an error, but a duplicate key aborts it on the
server, so the write loop stops at the first refusal rather than trying to collect them. Once the
transaction is gone, one read of every job in the change sets each against the revision it was sent
with and names every one that moved, always including the one that stopped it. That read sits outside
the transaction, so it describes where the jobs stand when the client is told, which is what the
client reconciles against.

A marked batch's `saved` is zero and `savedDocIDs` empty on every refusal, so a client clearing its
queue by `savedDocIDs` keeps every job in it.

Live tests in `shared/mongo` show a whole write, a field write and a create landing together; a
change with two stale jobs and a fresh one writing nothing and naming both; an existing id refusing a
create and the job beside it; a deleted job reported gone; and an unplannable write stopping the
change before it starts. Run without the transaction, the two "writes nothing" cases fail. Live tests
through the handler show the 204, the stale 409 and the held 409 with nothing written, and the 400
for an unreadable write.

### A close is one change

`closeActiveJob` saves through `saveJobsAsOneChange` rather than the shared queue. It sends the edited
job, the jobs it creates and every job it linked, repaired or resized in one request built by
`jobChangeRequestBody`, the body the fixture `testing/fixtures/job-write/body.json` pins as `change`
for both sides.

**Whatever the queue held for those jobs goes with the close.** `takeQueuedJobDocumentWrites` takes the
close's jobs out of the queue and folds what was queued for each into the close's own write, so none of
it can reach the server separately and land half a close. A queued whole-document write stays whole.
Jobs the close does not touch stay queued.

**The group and the ESI links follow the jobs.** Adding the close's new jobs to their group, the group's
write and the account's linked ESI data are all made only once the close has landed. A refused close
writes none of them and leaves the group as it was, where it used to add the new jobs to the group
before the save and write the group and the links whatever the save answered.

**A refused close is not retried.** `persistJobChangeToApi` answers `conflict`, `locked` or
`failed`, counts no revision and queues nothing back: a close put back on the queue would later go per
document, outside the change. A transport failure is no exception once the request's own retries are
spent. A failed request warns the reader from `persistJobChangeToApi`; a lock held elsewhere is
warned by `closeActiveJob`, because what a refused change means depends on what sent it; a stale job
is not warned, because the review that follows does the telling. The editor stays open with the reader's changes —
§ The review panel.

Vitest covers the close sending one request with the edited job by what changed and the rest whole,
taking and folding what the queue held, counting every written job, every refusal leaving nothing
counted or queued, and a refused close writing neither the group nor the links. The fixture is read
by both sides, and a live handler test writes a 101-job change.

### A copy arriving under the reader's changes

When a new copy of a job the editor holds arrives, `setBase` in `jobDraftStore.js` no longer replays
the reader's log onto it blind. `reviewChanges` in `jobDraftReview.js` sorts each logged change, oldest
first, into the four outcomes [job-document-drafts](../job-document-drafts/plan.md) § The merge, when
the lock frees defines, judging each later change on top of the earlier ones that still apply:

| Outcome | Test | What the rebase does |
|---------|------|----------------------|
| Applies clean | nothing in the copy moved at any place the change set | re-applies it over the copy |
| Already done | the copy holds the reader's value at every place | drops it |
| Conflicts | the copy set one of those places differently | holds it aside, still shown |
| Gone | a place it set no longer has a parent in the copy | holds it aside, still shown |

A change that builds on a held one — editing a setup the reader added in a change now held — is held
with it and kept or dropped with it.

**The reader's version stays on screen where the two clash.** Held changes sit in a `held` layer, out
of the save but not out of the draft: each carries a `restore`, the change's own places or, where the
copy removed a parent, that parent as the reader had it, and the draft lays those over the copy after
the log. Fields the reader never touched take the copy's values quietly. Nothing the copy changed is
put over the reader's own value until they choose: `keepHeld` puts a conflict back into the log over
the copy, `dropHeld` lets it go and the copy's value shows, and a change to something gone cannot be
kept. Undo reaches a held change like any other step — undoing it lets it go — and redo puts it
back. A question
in `scratch` that no longer applies is dropped, and redo is cleared for a job whose copy changed. A
copy identical to the one held changes nothing.

**This fixed a defect.** The rebase replayed every change with Immer's `applyPatches`, which throws
when a change's target has gone, so a copy that deleted a setup or a row the reader had edited broke
the open editor.

Held changes count as the reader's for `useJobModified`, so leaving an editor holding only held changes
still asks first.

A save never sends past them: `saveOpenJob` opens the review instead of saving while any change of
the open job is held, and answers `kept-open`.

### The review panel

Designed on the planned Edit Job page in the design canvas *Edit Job — reviewing a refused save*, and
built on today's page as `ChangeReviewDialogue` on the `ContentDialogue` shell and `IncomingSaveNotice`
as an `Alert` under the linked-job badge — page-local, since the page is not on the app-shell design
yet. The other member's change is called **the incoming save**; the stored document, **the saved
job**.

- **Mid-edit, a notice, never the dialogue.** When an incoming save holds any of the reader's changes
  aside, a notice under the stage rail says so and offers *Review changes*. The page keeps showing the
  reader's version where the two clash.
- **A refused close opens the dialogue.** Nothing was saved, so the editor stays open, the refused jobs
  are read again so their copies arrive through the same review, and the dialogue lists the reader's
  changes one per row, named as undo names them.
- **Only a conflict asks.** *Keep mine* or *Take the incoming save*, each with its value; *Save again*
  waits until every conflict has an answer. A change that can't be applied says what the incoming save
  removed and is never offered. One that still applies is kept unless unticked. One already saved is
  listed so nothing the reader did disappears unexplained. A change depending on another is decided
  with it.
- **The jobs a close links, repairs or resizes are not rows**: they are worked out again from the saved
  copies when the reader saves again. *Keep editing* closes the dialogue and leaves the notice.

How it runs:

- **The dialogue opens from an app event**, `openChangeReview` in `Events/changeReviewEvents.js`, so
  the close — outside React — can open it. Opened by the reader rather than a refusal, its button is
  *Apply*, which settles their choices and leaves them editing.
- **`reviewOf`** in `jobDraftStore.js` groups the open job's changes: held conflicts with their
  followers and both values at each place, held gone changes, the log as what still applies, and
  `settled`, the changes an incoming save already held, kept only to say so. A value shows when it is a
  single figure; a change to a whole row shows its name alone. A gone change cannot name what was
  removed, so it says the incoming save removed what it was made to.
- **`settleChangeReview`** applies the choices in one step: the conflicts kept go back into the log over
  the incoming save, every other held change of the job goes, the unticked changes leave the log, and
  `settled` empties. *Save again* then runs what the Save button runs — `useSaveAndLeave`, shared with
  it — so a second refusal reopens the review.
- **A refused close keeps the editor open.** `closeActiveJob` answers `kept-open`; before it does,
  `restoreSavedJobs` reads back every job the close touched, which replaces the planner's copies the
  close had already recalculated in place, drops the jobs the server no longer holds and the new jobs
  the close would have created, and hands each copy to the editor through `documentArrived` — the same
  review an incoming save gets. Only a stale job opens the dialogue; a lock held elsewhere or a failed
  request warns and leaves the editor open with the reader's changes. If the saved jobs cannot be read
  back, the reader is told to reload before saving again. Every caller of `saveOpenJob`
  stays on the page on `kept-open`: the Save button, both leave-confirm flows — a hand-over request is
  then answered as declined — and the child-job button.

Vitest covers the grouping and settling over the real draft store, the dialogue and notice over the
real edit session — the notice never opening the review, both choices, an unticked change, *Keep
editing*, and a lost lock disabling *Save again* — the save refusing to send past held changes, a
refused close keeping the editor open and restoring the jobs it touched, and an incoming save that
clashes arriving through the real inbound path and keeping the reader's value.

### Two tabs on one job, end to end

`TestLive_ConflictLoop_…` in `api/v1endpoints/jobdocuments` runs the conflict against the stack: an
editing tab, a member's tab and a bystander, connected through the real websocket service to one
corporation planner. The member's save reaches the editor and the bystander and not the member; the
editor's close, sent as one change at the revision it read, is refused whole with the job named at
its current revision and nothing written; the editor reads the job back and saves again at that
revision, which lands and reaches the member and the bystander and not the editor. The stored job ends
with the editor's name and without the row the member's save removed.

The run writes
[job-conflict-capture.json](../../../testing/fixtures/realtime-messages/job-conflict-capture.json):
the documents before, after the member's save and after the editor's, the bodies sent, the server's
answers, and every frame each tab was sent. Like the delta capture it is committed and rewritten by
the next live run, and nothing in it is written by hand.

`changeReview.conflictLoop.replay.test.jsx` plays each tab's side through the real store, edit
session, save path, delivery handler and review dialogue, with only the HTTP calls answered from the
capture:

- **The editor whose delivery went missing** saves; the body it builds equals the one the live server
  refused; it reads the job back, stays open with its own name on screen and the member's removal
  applied, and opens the review; keeping its value and pressing *Save again* sends exactly the body the
  live server accepted, closes the editor and leaves the job at the stored revision. A late delivery of
  the member's save then changes nothing.
- **The editor that was told** keeps its own name, shows the notice without opening the review, and
  once kept saves the accepted body without a refusal.
- **The member's tab and the bystander** apply what they were sent and end equal to what the server
  stored.

Skipping the read-back after a refusal, or dropping the reader's version of a held change, fails it.

Going advisory was weighed and not taken — § The lock covers one job.

A close sent while a debounced save of one of its jobs is still in the air is refused as stale against
this tab's own write: safe, since nothing is written, but the reader is warned about a conflict they
caused.

### The lock covers one job

**Decided: the lock stays, and it covers one job.** Making it advisory — no save consulting it — was
the plan's furthest step. It was not taken: a job's own lock still refuses another session's save,
which is the one-writer rule [job-document-drafts](../job-document-drafts/plan.md) § The lock is the
isolation, and it stays is built on, and the fallback this plan's risk note names. What went is the
breadth.

**A group's lock covers its own document.** Holding it no longer reaches a member job:

- The save gates stopped exempting a group's holder. `CollectLockHeldElsewhereRejects` lost its
  `JobGroupBypass`, and the jobs PUT and DELETE and the archived-jobs PUT name every job another
  session holds, whoever holds its group. The job DELETE's read of each job's group, made only to feed
  the exemption, went with it.
- Granting, handing over or force-releasing a group's lock, a group lock passing to its waitlist head
  on expiry, and a group save adding members no longer release the member jobs' locks. `cascade.go`,
  `cascade_pipeline.go`, the `document_lock_group_cascade` event and its two `reason` tags are gone, and
  so is the lock package's Mongo dependency, which only the cascade used.
- `BulkUpsertGroups` stopped reading each group before writing it to work out which members were new —
  that diff fed only the membership cascade — and is one retried bulk write.
  [job-groups](../job-groups/plan.md) planned to delete that diff; it is gone already.
- The write envelope lost `includedInGroup` and `groupID`, which existed only to tell the gate which
  group's holder to exempt. They were unreleased, so the envelope changes in the same cutover as
  Stage C; both sides ship together, and a body still carrying them is refused as unreadable.

**The SPA asks for the job's own lock.** `resolveDocumentLockApiTarget`, which turned a request for a
grouped job's lock into one for its group's, is gone, as is the patch that marked every member job
editable when a group's lock was granted and the handling of the cascade event. The Edit Job page holds
the job's lock always, and the group's as well when it was opened from the group, because a close
still writes the group's document; the header shows both. `canPersistJobClose` and `canEditActiveJob`
ask about the job's lock alone, so a job saves whoever holds its group. A group page's member card is
locked when another session holds that job, as a planner card already was. Leaving the page — save,
close, delete, archive, opening another job — releases or hands over the job's lock wherever the page
was opened from; it used to skip that inside a group, when the group's lock stood in for the job's.

**The group page's own saves of member jobs** are refused for any job another session holds, and kept
queued until it is free, as any per-document lock refusal is — § A held job no longer costs the batch.

Live tests show a group's holder refused a member job held elsewhere, and a group's lock granted with
a real group document and NATS leaving that job's lock with its holder. Vitest covers the save gates
asking the job alone, the Edit Job page taking both locks, and a member card locked by its job.

**Reasons moved out of the lock package's comments** when it came under the comment rule: a waitlist
pulse key has one builder, the prefix the Lua scripts concatenate a session id onto, so a Go writer
and a Lua reader cannot address different keys and leave a waiter looking dead; and queueing a waiter
removes their bare session id as well as their entry, because a session queued before the account rode
along is the same waiter. Why an account planner's lock key is the bare account id is in
[shared-planners](../shared-planners/plan.md).

The live document-lock topics under `backend/api/document-lock/` still describe the group lease and
its cascade; this section wins until promotion.

## Stage E — Delta delivery and client apply

*Landed end to end: a save is followed from the endpoint to what each client applies.*

The change stream already captures `updatedFields` and `removedFields` and uses them only to suppress
a schema-maintenance update. They are not yet meaningful: a `$set` of the whole job marks every field
as updated, so the delta is the document under another name until Stage C lands.

### Slice 1 — a stored delta in the client's names

`models.JobJSONChanges` turns Mongo's flat `updatedFields` into one `{path, value}` per stored path, in
the names a client reads and in the order of the stored paths, and `models.JobJSONRemoved` does the
same for the paths a write cleared. Each value is converted to the client's names on the way, so a row
set whole arrives as the row a client reads. Both walk the
model's own tags, so the mapping has one source: `fieldsNamedBy` indexes a struct's fields by the name
one tag gives them, built once per type and tag, and both directions of the walk read it.

A field the client is never sent is dropped rather than renamed — `protected`, and `_meta.owner`, which
the full document still carries. A stored `*_ref` is the exception and keeps its stored name, because
`restoreEntityIDs` downstream is what turns it into the `corporation_id` or `character_id` the client
reads, and that field is stored nowhere else. `EntityRefIDKey` in `models` is now the one place that
rule is written; the websocket service reads it rather than holding its own copy. Both spellings exist
because a ref is named to match the id it stands in for, and those differ by area: a job body mirrors
ESI's `corporation_id`, while `_meta` uses our own `accountID`.

A path that cannot be resolved — a positional step into a list, a stored name the model does not carry,
a ref standing at the end of a path — is answered as an error, and the watcher's answer to that error is
to drop the delta and send the full document. The ref case is refused rather than translated because
`restoreEntityIDs` rewrites a ref only as a map key inside a value; one set or cleared on its own would
reach the browser as ciphertext.

### Slice 2 — the derivation is proved over both transports

`client_shape_parity_test.go` exists because a client reads the same document two ways — an API
response and a `doc.update` push — and both have to name an entity id identically. It now builds one
job and compares the same two rows over both: the whole document as the changestream copies it out of
Mongo, and a delta built from the driver's own types and run through `JobJSONChanges`, rebuilt into the nested
document the comparison reads. A ref dropped
rather than kept fails the delta half and leaves the document half passing, which is what makes the
second case worth its place.

**The row's key is compared as well as its fields.** The whole document carries a row's key straight
through the marshaller, but a delta rebuilds it by splitting a stored path, so a key dropped or
mistaken is a failure only the delta can have. Comparing the fields inside one row would not see it —
both fixture collections hold a single row, so a row under the wrong key still matches field for
field. The two transports are asserted to key the rows the same way before any field is read.

The delta's values are read through `eipmongo.AsDocumentM`, because the driver hands a nested document
back as either `bson.M` or `bson.D` and a change event's values are whatever it gives. `models` has a
narrower reader of its own for the same shapes and cannot use that one: `shared/mongo` imports
`shared/models`, so the dependency only runs the one way.

Three things were corrected while the file was open. Its envelope named the collection
`user_job_documents`, which was its name before the rename. Its comments were removed rather than
shortened, because the rule allows none in a test at all and the helper names carry what they do. And
one of those comments recorded why the served copy rebuilds its row maps rather than sharing them — a
struct copy copies the map header alone, so decrypting the copy would write restored ids into the rows
the test still has to marshal as stored, leaving it comparing two views of one decrypted job. That is
the reason, recorded here because it cannot live beside the code.

### Slice 3 — the watcher publishes a delta beside the document

A job document's update now carries `changed`, `removed`, `revision` and `appliesTo` on the NATS
message and, through `ClientPayload`, to a browser. Every other collection and every other operation is
untouched: the branch tests for the job documents collection and an `update`, and an `insert`, a
`replace` or a `delete` has no `updateDescription` to read.

`updateDescription` is parsed once at the top of `processChangeEvent` and handed to
`isSchemaMaintenanceOnlyUpdate`, which used to parse it itself. That check now matters to more than
itself: a schema-maintenance write does not increment the revision, so one reaching a client as a delta
would name a revision that had not moved and read as a gap. It is suppressed before the delta is
considered.

**The revision is the one the update itself wrote.** An `$inc` reports `_meta.revision` in
`updatedFields` as the value the write produced, and that is what the delta names; `appliesTo` is one
below it because a job write increments by exactly one. The looked-up `fullDocument` is **not** read for
it: `updateLookup` returns the document as it is when the event is read, which can already be a later
write's, and a delta naming that later revision would carry fields from an earlier one — the client
would then drop the delivery that did carry them as already applied. An update that writes no revision
carries no delta.

**A delta is stated or it is not; it is never partial.** `jobDeltaFor` answers false — and the message
carries the whole document alone, as it does today — when the update writes no revision, when the
revision is below the one a document is seeded with, when Mongo reports `truncatedArrays`, when a
cleared path is not a string, when **any** path in the update cannot be read
into the client's names, or when nothing survives the drop of what a client is never sent. The case
that makes this a rule rather than a tidiness is an unreadable changed path beside a readable cleared
one: answering true there would deliver a delta that silently omitted the field, and a client applying
it would hold a document that no longer matches the store. Nothing is ever returned as an error to the
event, so a change the delta cannot describe still reaches its clients whole.

The log line a published event writes says whether one was carried.

**What `appliesTo` rests on, and where that is not enforced.** It is one below the revision because a
job write increments by exactly one — true of every ordinary write path, and not true of every writer.
`schemamaint` writes a job document through `UpsertStructsPreservingMetaBulk`, which stamps
`_meta.lastModified` and never increments the counter; today that write only ever changes
`schemaVersion`, so the maintenance suppression swallows it before a delta is considered. Nothing in
code holds it there. If the job upgrader is ever given a second field to change, that write escapes the
suppression — mixed allowed and disallowed fields — while still not moving the revision. It is safe by
construction rather than by care: an update that writes no `_meta.revision` carries no delta, so it
reaches every client as the whole document it always did.

The release step that seeds the counter is the other edge. A document that never held one is `$set` to
the first revision, which states a delta applying onto revision zero — a state that never existed
rather than one a client could have held. It is not suppressed, because a rename and a seed are not
maintenance fields; a client holding the job without a revision reads it as a gap and reads the job
again, which is the right answer. The step has already run against live data, so it is reachable only against a
restored copy from before the counter, and nothing about it breaks the never-fail contract.

The message struct's field comments were removed rather than extended while it was open, because the
rule allows no trailing comment on a declaration. Two of them said something worth keeping: the source
session id is stable across a client's reconnects, where the client id is per tab, and the owner key is
what the websocket service routes a message on.

### Slice 4 — what proves the delta, on both sides

Three pieces, each in the structure this repo already keeps that kind of proof in.

**One envelope, pinned for both languages.**
[job-delta.json](../../../testing/fixtures/realtime-messages/job-delta.json) states the stored change
Mongo reports and the delta it becomes. The Go side builds the second from the first with the real
code. The SPA side does **not** re-state the field names — that would be a second copy of something
already agreed — it checks every path the delta names against
[job-schema.json](../../../testing/fixtures/model-parity/job-schema.json), the list both languages
already hold of what a job carries. So a name this fixture invents, a changed path that stops at
something a job holds other fields under rather than at a value, a cleared row the model has no place
for, and a field the server keeps to itself leaking into a delta all fail on the SPA side — neither
`protected` nor `_meta.owner` is in that list, so one check answers naming parity and the drop rule
together.

**What the schema check cannot catch** is a name swapped for a real sibling's — `jobCount` for
`runCount` — because both resolve. That is a defect in the model rather than in the wire, and the
places it shows are the job parity test and the Go corpus test, which compare values rather than
membership. Recorded because the check reads stronger than it is. It sits
beside [kinds.json](../../../testing/fixtures/realtime-messages/kinds.json), which pins the message
vocabulary the same way.

An earlier draft of the SPA half asserted the fixture's own values back at itself — that `appliesTo` is
one below `revision`, that a row carries the field the fixture says it carries. Those read as coverage
and were worth nothing: no SPA code computed them, so only the fixture could have contradicted the
fixture. A second draft kept one of the same shape, checking that two names the server keeps to itself
are absent from the schema without ever looking at the delta. Checking against the schema, and checking
the delta rather than the list, is what makes the second side real while the apply path does not exist.

**A live test, through a real change stream, and it has been run.** `live_job_delta_test.go` writes fields into a real job
document, with a real `$inc` and a real `$unset`, and reads what the running core publishes: the
each changed path in the client's names with its value, the cleared row as a path, the revision pair, and the
whole document still beside them. Its second case proves the maintenance suppression by writing a
schema bump and then a marker, and failing if the bump reached a subscriber — collecting what was
published rather than filtering for the marker, because filtering would pass whether or not the bump
was sent. Both need `EIP_MONGO_PARITY_LIVE=1` and the stack's NATS, and skip without them.

**Three things only running them could find**, all now fixed and all of which had been keeping the
three older `Live_Publish` tests red as well:

- **The watcher was watching the wrong database.** Core watches `eve_industry_planner`; these tests
  write in `eve_industry_planner_test`, which `mongolive` refuses to move off — rightly, since they
  delete what they think they created. Nothing was watching where they wrote. The test now starts a
  watcher over its own database, which is also why the objection in `live_publish_test.go` no longer
  holds: core never watches that database, so a message about it can only be the test's own. That
  comment has been corrected rather than left standing.
- **A cold-started watcher publishes nothing until its change stream opens**, which took 93 seconds in
  core's own logs. A test that writes immediately writes into silence. Each now probes until one comes
  back.
- **The seed's `insert` was being taken for the `update` under test**, because the wait matched on the
  document id alone.

### Slice 5 — one save, several tabs

`live_full_loop_test.go` seeds sessions against the stack's own session store — the saver's tab,
another tab of the same account, a second member of the planner, and a tab of the same account working
in a different planner — connects each as a real websocket client, makes **one save through the real
endpoint**, and asserts what each received: the delta reached the other member and the saver's other
tab, and did not reach the tab that made the save. That last assertion is the one nothing else covers,
and it is behaviour rather than plumbing: echo suppression is keyed on the websocket client id the save
carried. Real Mongo, real change stream, real NATS, the stack's own websocket service, real browser
connections. It has passed for an account, a corporation and an alliance planner.

**A connection receives nothing until it says which planner it is working in.** It sends
`{"type": "active_planner", "owner": "<handle>"}`, and that subscription is *replaced* rather than
widened — one planner at a time, chosen by the client, so two tabs of one account can be in different
planners. Every kind of planner travels the same path from there, which is why the test runs one loop
over a list of owners rather than one test per kind.

**The run carries the stack's `ENTITY_ID_KEY`**, because a corporation or alliance handle is an entity
ref, and one minted with any other key is refused as naming an owner outside the connection's grants —
`ws_active_planner_not_granted` in the stack's log. The account is joined to each corporation and
alliance before the loop runs, because a planner the account is not a member of is not one it can save
in.

**A tab working in another planner is asserted to be told nothing, except for an account-owned
planner.** The account's own key survives an `active_planner` switch — deliberately, because it carries
settings and the watchlist — and a personal planner's jobs are owned by `account:<id>`, so they ride it
too. The test logs that instead of asserting it, and the behaviour belongs to
[shared-planners](../shared-planners/plan.md) § Stage G, item G6.

**Every client is proved live before the save.** A probe is written into each planner until every
client working in it has been told, and `wsclient.Quiet` fails on a closed connection — so the tabs
asserted to hear nothing are proved to be listening, rather than passing because they had quietly gone
away.

**`testing/wsclient` drains its socket from a goroutine**, and that is not incidental: a gorilla
connection whose read hits a deadline is unusable for every read after it, so polling with a deadline
killed the first client silently and the stack's own logs showed a thousand deliveries arriving at a
client that could no longer read any of them. Reading continuously and matching against what has
arrived is the shape a test client has to take. [ws_soak](../../../testing/ws_soak/lib/) builds its
connection URL through the same package.

### Slice 6 — the client applies a delta onto what it holds

`Functions/Job/sync/jobDelta.js` is the whole rule, as pure functions over plain data:
`deltaFromMessage` reads a delivery's delta or answers none, `deltaVerdict` says whether it applies,
repeats one already applied, or proves a delivery was missed, and `applyJobDelta` sets each change's value whole at its
path, clears each removed path, and answers a new document rather than changing the one it was given —
copying each level on the way down, so what the store still holds is never touched.

**The revision a client holds is the one on the document it holds.** `_meta.revision` is already on
every stored job and already survives `jobFromDocument` and `toDocument`, so nothing new stores it and
nothing has to be kept in step.

**The coalescer folds rather than keeps the last.** It held one document per job for its 80ms window
and replaced it on each delivery, which is right for whole documents and loses every delta but the
final one. It now queues the deltas in arrival order beside the document and folds them at flush:
skipping what the client already has, applying each in turn, and — the moment one does not join up —
abandoning the fold for that job and **reading it again**, which is something this app already knows
how to do. A document rebuilt from a stream with a hole in it is not the
document the server holds, so a re-read is the only honest answer.

**A job the client does not hold yet, and a delivery carrying no delta, both take the whole document**,
which is what makes the server half additive: nothing about this changes what a client does with a
message that has no delta in it.

**A whole document in the window is the base for the deltas after it.** A window that sees a delivery
with no delta and then one with a delta folds the second onto the first, not onto what the store held
before the window, which the first has already moved past.

**A job with writes this client has not yet had acknowledged takes the whole document.** Folding onto
the held job would fold onto local edits the server has not seen, and that document would claim a
revision it does not match.

The receiving edge does the reading. `documentMessage.js` converts the message into that one internal
shape and hands it on, rather than passing the wire's fields down for the coalescer to interpret.

**The re-read reads and does not write.** `requestJobDocumentsByIdsFromApi` is the store-free half of
this app's job fetch, and it is what a gap asks — `fetchJobDocumentByIdFromApi` beside it writes what it
read into `jobArray` unconditionally, which would put a stale answer in the store before anything could
judge it and leave the guard below inert.

**A re-read is made once per job while one is in flight, and read again if the job gaps meanwhile.**
Two gapped deliveries in a row would otherwise ask for the same job twice, and the slower answer would
land last and undo what the faster one and the deltas after it had already got right. A gap arriving
while the read is out is remembered, and the job is read once more when the first read settles, because
the first answer can predate the write that gapped.

**A re-read's answer is dropped if the client has moved on**: logged out or torn down since it asked,
switched planner, no longer holding the job because it was deleted meanwhile, or already holding the
revision the read returned or a later one. A read that fails
is swallowed and the job stays where it was: the next delivery for it gaps again and asks again, so
nothing is stuck, but nothing tells the reader either — which is the accepted limit here rather than an
oversight.

### Slice 7 — the replay, and the loop closed

The live loop test writes what each connected client was **actually sent** to
[job-delta-capture.json](../../../testing/fixtures/realtime-messages/job-delta-capture.json), keyed by
planner kind, beside the document the server held before the save and after it. The runner mounts that
folder into the test container for the purpose; without `EIP_CAPTURE_DIR` the test records nothing and
behaves as before.

`documentMessage.replay.test.js` reads it back and drives every recorded frame through
`applyDocumentMessage` — the real receiving edge, the real coalescer, the real apply — starting from
the `before` document, and asserts what it ends holding **equals** what the server stored. For an
account, a corporation and an alliance planner.

**It proves the delta and not the document beside it.** Breaking `applyJobDelta` so it drops what the
delta changed fails all three cases, even though every frame still carries the whole document. The
re-read is mocked to throw, so a gap cannot rescue the assertion either: if the fold does not join up,
the test fails rather than quietly reloading its way to the right answer.

**Both halves of a delta are replayed.** The save clears a row as well as changing a field, so the
capture carries a real `removed` path and making that branch a no-op fails all three cases too. The
save was a rename alone at first, which left `removeAt` — a whole branch of the apply — unexercised by
the loop while looking covered.

**Nothing in the capture is written by hand**, which is the whole point — a frame somebody typed would
put the invented input back in the middle of the one journey this exists to prove. It is committed so
the SPA suite runs without a stack, and rewritten by the next live run.

**A capture is only trustworthy after a whole run.** The writer merges per planner kind rather than
replacing the file, so a filtered `-test.run` refreshes one kind and leaves the others as an older run
left them. The replay guards the shape of that rather than the freshness: it asserts all three kinds
are present, and that each carries both a changed field and a cleared row, so a capture that shrank
fails instead of quietly replaying less.

**The live test encodes what it sends with the repo's codec.** Its request helper used
`encoding/json`, which writes a nil list as `null`, so the job it seeded was stored with `null` where
the SPA — and `jsoncodec` — send `[]`. The account run delivers that seed's insert to a tab as a whole
document, and the replay caught the difference against the API's read. Nothing a real client sends
stores that shape; the helper now encodes through `jsoncodec`.

**What it does not prove.** That the revision moves when a delta does not name `_meta` — these real
deltas all carry `_meta.revision` in their changed fields, so the explicit set is unobservable here and
is pinned by `jobDelta.test.js` instead.

### Slice 8 — what the coverage review found

A review of this stage's test coverage found four defects the tests had been passing over, all fixed:

- **Changes were merged rather than set.** The delta was a nested partial document, which cannot say the
  level Mongo set a value at, so an emptied collection, a row written whole and a whole-document write
  all left the client holding a document the server did not. It is now a list of paths set whole —
  [plan.md](./plan.md) § Whose vocabulary travels on the wire records the reversal.
- **The revision was read from the looked-up document**, which can be newer than the event. It is now
  read from the update, per § Slice 3.
- **A gap during a re-read was lost.** It is now remembered and the job read again, per § Slice 6.
- **A re-read's answer landed after teardown, a planner switch, or the job's deletion.** It is now
  dropped, per § Slice 6.

The watcher gained unit tests over a fake NATS for what it publishes, and `wsclient.Quiet` now fails on a
closed connection, because a closed socket's silence proves nothing. The loop test probes every client —
including the one on another planner — for a live subscription before the save, for the same reason.
Each guard was checked by breaking it and watching its test fail.

Everything else in this stage is settled in [plan.md](./plan.md) § Stage E — a delta is each path the
update set with its value and the removed row paths, the client sets each value whole onto the base it
already holds, and a gap is proved by the pair of `_meta.revision` values a delta moves between and
answered by reading the job again. All of it is built; §§ Slice 1 to Slice 8 say what each part does.

## Stage F — Every multi-job write is one change

### Removals inside a change

A batch marked `oneChange` may carry `deletes` beside `jobs`: each names a job and the revision it was
read at (`models.JobDeleteBody`). `JobWriteBatch.Validate` refuses removals on an unmarked batch, a
removal without a revision, and a job both written and removed; a change that only removes is allowed.
The fixture `testing/fixtures/job-write/body.json` pins the shape for both sides as
`changeWithDeletes`.

| A removal meets | The change answers |
|-----------------|--------------------|
| A job another session holds | 409 `lock_held_elsewhere`, nothing written — the lock gate checks written and removed ids together (`JobWriteBatch.JobIDs`) |
| A job edited since it was read | 409 `revision_conflict`, nothing written or removed, the job named at its current revision |
| A job already gone | the same 409, the job named `gone` |
| Nothing moved | 204, every write made and every removal gone |

`WriteJobChange` takes a `JobChange` — whole writes, field writes and `models.JobDeleteBody` removals — and makes the
removals after the writes inside the same transaction. Each removal stamps `_meta` with the session and
client, filtered on the revision it was read at, then deletes the document, as
`DeleteManyAfterStampingMeta` does outside a change; an unmatched stamp refuses the change, and
`staleInChange` names it with the writes.

Live tests in `shared/mongo` show a write and a removal landing together, a removal of an edited job
refusing the write beside it, and a removal of a gone job reported gone. Through the handler: a change
removing a job lands, a removal of an edited job or a held job refuses the whole change, and removals
outside `oneChange` are a 400. Dropping removed ids from the lock gate fails the held case.

### A merge is one change

`mergeJobs` no longer works from the planner's copies or sends two requests:

1. **The reader's queue is flushed**, so their own pending edits are on the server first.
2. **The selection and every job it links to are read back** (`requestJobDocumentsByIdsFromApi`), so
   links and revisions are current rather than what this tab happened to load. A selected job that no
   longer exists is dropped; a link to a job that no longer exists is left off the replacement.
3. **A job another session holds stops the merge before anything is sent**, and the merge panel names
   it (`jobsOpenElsewhere`).
4. **What the replaced jobs recorded is confirmed.** Purchases, extra costs, invention entries and
   linked industry jobs, market orders and transactions are discarded with the jobs; where any exist,
   the merge panel lists them per job and the merge waits for the reader (`confirmMergeDiscards`).
5. **The replacement, every relinked parent and child, and the removal of the replaced jobs at the
   revisions read go as one change** through `saveJobsAsOneChange(jobs, changes, removed)`.
6. **Only once it lands** are the replaced jobs taken off the planner, the groups recomputed, the
   replaced jobs' ESI links removed from the account and the account saved, and the selection cleared
   (`onMerged`).

**A refused merge writes nothing and keeps the selection.** `restoreSavedJobs` puts back every job the
merge read and takes the replacement out, then the merge panel lists what moved —
`whatMovedSinceRead` judges each job read against the planner's restored copy and the lock state:
edited, removed, or open for editing elsewhere, naming no member — and offers **Merge again**, which
runs the merge afresh from the current jobs. It is disabled while any job is open elsewhere.

The panel is `MergeJobsDialogue`, mounted beside the app's other app-wide dialogues and opened by
`mergeJobsEvents` in two modes, confirm and refused.

Applying a group template to the active group saves the jobs it built before merging them, as it
already did for a new group: a merge reads its jobs back from the server, and unsaved jobs would read
as gone.

Vitest covers the change sent with removals at the revisions read, the read-back used over the
planner's copies, a dead link dropped, a held job stopping the merge, the confirmation asked and
declined, the ESI links removed and saved on landing, a refused merge restoring and naming what moved,
merge again re-reading, and a signed-out merge staying local; the panel in both modes; and the template
saving before it merges.

### A change that removes jobs, followed through delivery

`live_full_loop_test.go` follows a change carrying a write and a removal through the real endpoint, a
real change stream and the stack's websocket service, in an account's, a corporation's and an
alliance's planner: the other tabs are sent the update and the delete, and the tab that made the
change is sent neither. The removal's `_meta` stamp carries the session and client so the delete is
not echoed back; with neither stamped, the case fails. `testing/wsclient` matches a delete frame with
`DocumentDeleteFor` beside `DocumentUpdateFor`.

### Multi-delete is one change

`deleteMultipleJobs` works as a merge does: it sends the reader's queue, reads the selection and every
job it links to back from the server, stops before sending anything when one is open elsewhere, and
sends the unlinked parents and children with the removals at the revisions read as one change
(`saveJobsAsOneChange(jobs, undefined, removed)`). Only once it lands are the jobs taken off the
planner, the groups put into the planner and queued, and the deleted jobs' ESI links released and the
account saved. A refused delete puts back every job it read and warns, naming each job that moved —
`nothingChangedMessage` over what moved, in the same words as the merge panel. It answers
whether the jobs are gone, and the Edit Job delete button and the two side-menu deletes act only on
`true`.

Merge and delete share their whole frame from `Functions/Job/changes/jobChange.js`:
`readJobsForAChange` sends the queue, reads the jobs back and reports which are open elsewhere, saying
so when they cannot be read; `sendChangeFromRead` sends the change and, when it is refused, puts back
what was read, takes out what it created and answers what moved. `nothingChangedMessage` is the one
wording for a change that touched nothing — merge's refusals, delete's, both archives', a close
refused by a lock — naming the jobs that moved where they are known and the server's reason where
not. The working copies a change is built on are `workingJobs` and `workingGroups` in
`workingCopies.js`, which moving jobs on the planner and mass build use too. Releasing the ESI links
of jobs that left the planner, and warning when the account could not be saved, is
`releaseEsiLinksOf`, beside them in `jobChange.js`, shared by merge, delete and both archives.

### An archive is a move

`PUT /api/v1/archived-jobs` writes the archived copies and removes the live jobs in one transaction
(`(*Mongo).ArchiveJobs`), each removal stamped and checked against the revision the archived job's
`_meta` carries, exactly as a removal inside a change is. A job edited since it was read refuses the
whole batch with a 409 `revision_conflict` naming it, and nothing is archived or removed; a job sent
without a revision is a 400. Statistics rows and the rebuild queue follow once the move has landed,
best-effort as before. The 100-job cap is gone, as for a change: a batch split across requests would
not be one move, and the 1 MB body limit still bounds it. `ArchiveJobs` takes the jobs themselves and
derives each archived copy and each removal from them; it shares `inJobChange` and `applyInChange`
with `WriteJobChange`, so the transaction, the abort at the first stale step and the read of what
moved are written once. Every removal and `DeleteManyAfterStampingMeta` stamp `_meta` through
`MetaStamp`.

`saveArchivedJobs` sends one request and answers the same outcomes a save does — `saved`, `locked`,
`conflict` or `failed` — and `archiveJobsOnServer` in `jobChange.js` says why when nothing moved. The
Edit Job archive button takes the job's queued write out before it asks, so a debounced save cannot
race the move, and puts it back if the archive is refused; it releases the job's ESI links and leaves
the page only once the archive landed, where it used to release them before asking. A group archive sends the reader's queue, archives
the planner's current copies of the jobs not shown on the planner, refuses up front while another
member has the group open, and removes the group only after the jobs moved — a group that could not be
removed then is said, and the jobs stay archived. A refused archive changes nothing locally.

`DELETE /api/v1/job-documents` is removed: every removal now rides a change or an archive.

### One lock gate for every write handler

The job-documents, archive, group write and group delete handlers each carried the same lock check:
session required, `CollectLockHeldElsewhereRejects`, the two error answers and the debug step. It is
now `helper.GateDocumentLocks`, which answers the request itself when the check cannot be made, and
`helper.RefuseHeldDocuments`, which answers 409 naming what is held; each handler keeps its own choice
of dropping held writes or refusing the request. Their log codes are derived from the endpoint name.

**A change that only removes jobs was refused.** The job-documents handler answered "held elsewhere"
whenever no write was left after the lock check, so a change carrying only removals — deleting a job
with no parents or children — was refused on every stack with Redis, holding nothing. It now answers
that only when the lock dropped every write. `live_one_change_test.go` covers a removal-only change
with the lock gate on; with the old condition, it fails.

`api.jobs.deleted_total` was never incremented; a landed change now counts its removals there, and
`api.jobs.saved_total` counts only its writes.

### Test helpers for this work are shared

The live Go tests seed, read and check the absence of jobs through `testing/mongolive` —
`SeedJobs`, `ReadJob` and `RequireJobAbsent`, each taking the store's own `Docs` so the same helper
reads the live and the archived collection — in place of the copies each package's tests carried.
The SPA's merge, delete, read-for-a-change and group-archive tests share
`frontend/src/tests/jobPlannerHarness.js`: a planner store over a real job array, a stand-in for the
server's jobs answering reads by id, and a document held open elsewhere.

### What the sweep found beside it

**Restore was losing jobs.** It wrote the archived copy back with `BulkUpsertJobs`, whose whole-document
write is conditional on the revision `_meta` carries — and an archived copy carries one, so the write
was refused as gone, the refusal was ignored, and the archive copy was then deleted. A restored job now
goes back through `WriteJobChange` as a create — its revision cleared, refused when a job with that id
is already on the planner — and a refused write stops the restore before the archive copy is touched.
`live_restore_test.go` caught it, and now also proves a restore over a live job leaves both copies.

**Restore could not see who holds an ESI id.** `esiHoldersFor` searched the stored paths ESI rows had
before they moved to `esi.industryJobs`, `esi.marketOrders` and `esi.transactions`, so it found no
holder and a restored job could reclaim an id another job held. It now looks each id up by its row key.

Live tests in `shared/mongo` show an archive moving the job, a job edited since it was read archiving
nothing (run without the transaction, it fails), and a job without a revision named. Through the
handler, an archive leaves the planner and a stale batch archives nothing. The cross-client suite
deletes through `deleteMultipleJobs` itself, and its fixture keeps the jobs written so the read-back
answers them and a removal inside a change is delivered as a delete. Vitest covers multi-delete
(one change, the read-back over the planner's copies, a held job, a refusal putting back what was
read, groups and ESI links only once landed, signed out), the group archive and the archive button.

### A save a lock refused is said and put back

The shared save queue (`persistJobDocumentsToApi`, behind `saveJobsViaApi` and the debounced save)
answered `locked` with the held writes left queued and nothing said, so the screen showed a save that
had not happened, and the writes went out later only when something else flushed — after the holder
had moved the job, so they failed as stale. Now a lock refusal counts what wrote, drops the held writes
from the queue, puts those jobs back as the server holds them (`restoreSavedJobs`, which rebases an
open editor's changes the way an incoming save does) and warns, naming them. The server always names the
held jobs; a refusal naming none leaves the queue as it was rather than guess, since a just-created job
in it would read back as gone. While the page is hidden, as on the way out, the held writes are dropped
without fetching the saved copies. This covers every caller of the queue at once —
the price entry dialogue, mass build, drag and drop, templates, `closeGroup` and the rest — rather
than each answering for itself. `restoreSavedJobs` lives in its own module, which the queue, a close,
a merge and a delete all use.

### Restore is gated on each job

Restore checked a grouped job only against its group's lock, on the reasoning that the group stood for
its archived members. Under the per-job lock it does not: every restored job is now checked against its
own lock as well, after the groups the restore writes.

### What the recheck of Stage F changed

**A change is written in bulk.** `WriteJobChange` makes its writes as one ordered bulk write and its
removals through `deleteManyAfterStampingMeta` with a filter naming each job at its revision, inside
the transaction; the archive's copies are one bulk upsert. A count short of what was asked aborts, and
`staleInChange` names what moved after the abort. A refusal that finds nothing moved is an error rather
than a landed change, and a batch naming one job twice is refused before it is planned.
`WriteJobChange` answers its writes and removals as separate counts.

**One lock gate.** `documentlock.FirstHeldElsewhere` checks sets of documents in order and answers
the first collection holding one another session has open; `helper.GateDocumentLocks` and restore's
gate both call it. Ids come from `models.JobIDsOf` and `models.GroupIDsOf`.

**ESI rows by one table.** Restore's kinds of ESI row — where they sit, which account key holds them,
how a job's ids are read and a row dropped — are one table, and the holder lookup resolves each kind's
path once and queries ids in batches of 500.

**On the SPA:**

- `readJobsIntoPlanner` reads jobs by id onto the planner, dropping those the server no longer holds
  when asked; the read before a change, putting jobs back after a refusal and releasing a removed
  group's jobs all use it. The three job-document fetchers nothing called are gone.
- `saveLinkedEsiChange` applies any change to the account's linked ESI records and warns when the
  account could not be saved; releasing a removed job's links and a close's links both use it, so a
  close no longer drops that failure silently. `lockNotHeldMessage` is the one wording for an edit made
  without the lock, for a job and a group.
- `saveJobsAsOneChange` no longer writes the planner before sending; it counts the revision on the
  jobs it was handed once the change lands, and the caller puts them on the planner once.
- A refused change answers its outcome beside what moved, so a refusal naming no job still says why; a
  merge refused by another member always shows the merge panel. The read before a change stops when
  the reader's own queued saves failed.
- The merge panel's confirmation is settled in `mergeJobsEvents`, a replaced or abandoned question
  answering no, so the dialogue holds no effect of its own. The archive button cannot be pressed again
  while an archive is in flight. Archive refusals warn at the severity merge and delete use.
- Working copies of groups go through `workingGroups` in merge and in recording archived jobs, and the
  value-at-path setters live in `Helper/documentValues.js` beside the reader.

**Left as found, for a decision elsewhere:** `setups.js` carries a multi-blueprint run split that no
production path calls and that `frontend/esi-collections/blueprints.md` still describes.

## Where this work lives

| What | Home |
|------|------|
| Building, sending and refusing a multi-job change; its wording; the ESI release and the archive step | `frontend/src/Functions/Job/changes/jobChange.js` |
| Merge, with the records it discards | `Functions/Job/changes/mergeJobs.js` |
| Multi-delete | `Functions/Job/changes/deleteMultipleJobs.js` |
| Working copies of planner jobs and groups, also used by moving jobs and mass build | `Functions/Job/changes/workingCopies.js` |
| The queue's sender, and putting refused jobs back as saved | `Functions/Job/sync/persistJobDocumentsToApi.js` |
| Reading a value at a path and comparing plain values | `Functions/Helper/documentValues.js` |
| The change review panel, the incoming-save notice and their replay test | `Components/Edit Job/Change Review/` |
| Saving the open job, and the hook that saves and leaves | `Components/Edit Job/Edit Job Hooks/saveOpenJob.js` |
| The merge panel | `Components/Dialogues/Merge Jobs/` |
| The archive move | `services/shared/mongo/jobs_archive_change.go`, sharing the change loop in `jobs_put_change.go` and the retired root keys in `jobs_put.go` |

The job's own code lives under one `frontend/src/Functions/Job/`, grouped by subject; the subject
folders are lowercase like `MarketData/prices` and `Reprocessing/engine`:

| Folder | Holds |
|--------|-------|
| `Job/` | `jobDocument.js`, the job model |
| `Job/sync/` | Saving and receiving: the save queue and its sender, the write envelope and body (`jobWrite.js`), revision conflicts, inbound documents and deltas |
| `Job/setups/` | `setups.js` — splitting a total across setups, the setup context, correcting a setup's figures — and applying a setup change and recalculating for a new total |
| `Job/building/` | Building jobs (`buildJob.js`, with the recipe lookup), adding them to the planner, the next materials tree, mass build and importing a fit |
| `Job/editing/` | Closing the open job, with the summary of what a close changed; the edit session's end, with putting a job back; step navigation |
| `Job/changes/` | Multi-job changes and the working copies they are built on |
| `Job/figures/` | What a build costs and returns, its comparison against the archive, and the material sourcing row |

`Functions/JobPlanner/` keeps only the planner view: moving jobs between stages, and `plannerLists.js`
for the accordion's filters and stage sort. `Functions/JobDocuments/` and `Functions/Job Build/` are
gone. Single-function files were folded into the module that owns their subject — the recipe lookup
into `buildJob.js`, the close summary into `closeActiveJob.js`, putting a job back into
`editSessionLifetime.js`, the write body into `jobWrite.js`, the setup helpers and setup correction into
`setups.js`, the two planner list helpers into `plannerLists.js` — and `workingCopyOfJob`, the
forwarding wrapper [spa-module-homes](../spa-module-homes/plan.md) named, is inlined at its two
callers. Each test sits beside its module and takes its name, with a suffix where its mocks differ from
the module's other test (`setups.figures.test.js`, `closeActiveJob.summary.test.js`); two tests filed
elsewhere — `Classes/closeAdjustmentSummary.test.js` and `tests/recalculateJobSetupContext.test.js` —
moved beside what they cover.

**Owed at promotion:** five live docs still name the old paths —
`frontend/esi-collections/blueprints.md`, `frontend/static-data/recipes.md`,
`frontend/industry-facilities/bonuses.md`, `frontend/pricing/defaults.md` and
`testing/frontend/esi-collections.md`.

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
| Two writers, one document: the stale write is refused and the first is kept | `services/shared/mongo/live_jobs_conditional_write_test.go` |
| A batch in which one job moved writes the others | same |
| A write against a deleted document is reported gone, and does not recreate it | same |
| The same, over the handlers: a 409 carrying `error`, `saved` and the refused rows | `services/api/v1endpoints/jobdocuments/live_revision_conflict_test.go` |
| A mixed batch answers `saved: 1` and names only the stale job | same |
| An unversioned write is still accepted, so a client that sends no revision keeps working | same |
| A field-scoped write changes only what it names, and leaves `createdAt` and the rows beside it alone | `services/shared/mongo/live_jobs_field_write_test.go` |
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

**The lock gate is proved against the stack's Redis.** `live_lock_gate_test.go` takes each lock
through the document lock service's own `Acquire` — the Lua path a browser's request takes — and puts
a batch through the real handler. A job another session holds is dropped and named with its holder
while the rest of the batch is written; a batch held throughout writes nothing; the holder's own write
is not held back; and the holder of a group is refused a member job another session holds, while
taking a group's lock leaves that job's lock with its holder. Breaking the gate or the requester it
compares against fails the case written for it.

It uses the stack's Redis rather than `testing/redislive`, as the full loop does for its sessions:
`redislive` refuses the stack's port because its tests delete keys by prefix, and the runner already
carries the stack's Redis credentials. A lock here sits under the scratch planner's own key and is
deleted when its test ends, so nothing a live session holds is touched.
