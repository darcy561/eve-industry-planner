# Document write granularity — plan

Read and followed for this plan: [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md), plus the root masters they defer to, and — for the
surfaces this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
and [`../../backend/technical-rules.md`](../../backend/technical-rules.md).

Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

A change to a document is written, carried and applied as **what changed**, so that two people editing
different parts of one document both keep their edit, and a client can rebuild a document from an
ordered stream of changes rather than from a sequence of whole-document replacements.

## Starting position

`BulkUpsertJobs` writes `"$set": job` — the entire document, every field, on every save. Every other
document write of this kind does the same. That has always been the shape, and on a single-user
account it is invisible: one writer replacing their own document with their own newer copy loses
nothing.

It stops being invisible under two conditions, which arrive together:

**Two writers.** Two members editing different fields of one job both send the whole document, so the
second write overwrites the first's field even though neither touched what the other changed. This is
last-write-wins decided at the writer, and no delivery guarantee corrects it — ordering the two writes
correctly still loses one.

**Delivery that can reorder.** Because each message carries the whole document, a message that
overtakes another loses *everything* in the one it passed rather than a single field. The blast radius
of a reorder is the document.

## What this project inherits

This project exists because [shared-planners](../shared-planners/plan.md) § Stage G found the write
shape while fixing realtime consistency. The items below are **that project's decisions, not this
one's**. They were written here as assumptions to re-verify; **Stages G and H have since landed and
closed**, so each is now a fact this project builds on rather than a bet it is taking.

| Inherited | Where it was decided | What this project now has |
|-----------|----------------------|---------------------------|
| Per-owner delivery ordering | Stage G4 | Landed. A full shard waits for room rather than overtaking what is queued for that owner, so a delta stream cannot be applied out of order |
| The position token on the wire | Stage G2 | Landed. A delivery carries its place in the stream and the client holds one per document, applying only what is beyond it — so a gap is detectable rather than silent. A delete carries a position as readily as an upsert |
| The owner-scoped baseline | Stage G1 | Landed. One loader behind the switch, the reconnect and the background-tab wake, with every load but the newest discarded and the planner recorded on the store. This is what a delta stream is applied *onto* |
| `session_resume` answering from position | Stage G3 | Landed. A resume carries how far the tab applied and is answered by comparing it against what was published, rather than asserting nothing happened. A gap is reloaded through rather than replayed |
| The lock namespaced on the owner key | Stage H2 | Landed. Lock key, waitlist, pulse and viewer set are on the owner, with the owner resolved from the request's planner rather than the JWT — so a lock now holds between two members, which is what Stage D here has to have before it can relax one |
| The change set a field-scoped write sends | [job-document-drafts](../job-document-drafts/plan.md) Stage 3 | **Arrived.** Slices 1 to 4 landed: a job is held as a frozen base plus an ordered log of what the reader changed, and the log's patches name paths into the document. Stage C is no longer blocked on it — see § What arrived, and what it changes for what that leaves |
| A job document whose row collections are keyed | Same, Stage 2 | **Built and wired in, not yet run against live.** Arrays keyed by the id they already carry rather than positional, which is what makes a path into a row stable under insertion and reordering. A converter runs as a required release step and has been proved against a restored copy of live — 42,065 documents, none refused. The gate behind it has also run: the key each collection would use is unique per document, so no row is silently lost to a repeated key. What remains is the SPA and API reading the new shape |

**What that changes for this plan.** Nothing in this project waits on shared-planners any more: Stage
E's dependency there is discharged, and Stage D's premise — that there is a real lock to relax —
holds.

**A different project does gate the rest of this one.** Stages C and E both need
[job-document-drafts](../job-document-drafts/plan.md), whose own plan states the dependency in its
§ What depends on this. That was missing here, which is how Stage C came to be designed twice — see
§ Stage C.

The dependency ran one way and is now spent. Shared planners never waited on this project: its
obligation was to stop losing writes *silently*, which the position token achieved on its own. This
project decides whether the loss can be avoided rather than merely seen.

## What has landed already, ahead of Stage A

The revision counter Stage A was to introduce **already exists and is already counting**, delivered by
the shared-planners cutover rather than by this project. § Open questions recorded the intent to seed
it in that pass; what was built went further than seeding.

How it behaves today — the field, its seeding, the backfill, the increment on every job write, and the
one write path that is already field-scoped — is [overlay.md](./overlay.md) § The revision counter,
which is where current behaviour lives while this project is in flight.

**What this left for Stage A was only the compare.** The counter existed and was accurate; nothing
read it. `BulkUpsertJobs` filtered on `_id` alone, so a write always landed. That is why Stage A was
smaller than this plan originally scoped it — and it has since landed, so a write carrying a revision
is now checked against it.

## The delta is already there

The change stream requests `updateDescription` and `FullDocumentBeforeChange`, and parses
`updatedFields` and `removedFields`. Both are used for one thing: suppressing a schema-maintenance
update so it does not reach a browser as a change.

So the capture exists and the delta is discarded. It would also be useless as things stand — a
`$set: job` marks every field as updated, so `updatedFields` is the whole document under another name.
The delta only becomes meaningful once the write that produced it is field-scoped, which is why the
write shape is the first stage rather than the transport.

`previousDocument` already reaches the SPA on the wire, so a before-image is available where the
collection supports it.

## What a conflicting write is answered with

Three options, and the choice decides how much of this project is needed. They are listed cheapest
first; the cheapest is a real answer, not a fallback.

**A conditional write.** Keep whole-document writes and refuse one whose base version is not current,
answering the client with the current document. Nothing is lost silently, and the client decides what
to do. This needs a version on the document and a compare on the write — no dirty tracking, no delta
transport, no client apply path. The document lock already exists to make the conflict rare, so the
refusal is an edge case rather than a routine outcome.

**Field-scoped writes, whole-document delivery.** The write sets only the paths that changed, so two
members editing different fields both keep their edit. Delivery still carries the whole document, so
the client keeps replacing. This is the smallest change that fixes the *product* problem, and it makes
`updatedFields` meaningful for the first time.

**Field-scoped writes and delta delivery.** As above, and delivery carries the changed paths so a
client applies rather than replaces. This is what makes a client able to rebuild a document from an
ordered stream, and it is the only option that reduces payload size as a side effect.

The third is the destination the goal describes. The first is worth taking on its own if the second
and third turn out to be expensive, because it converts silent loss into a visible refusal — which is
the property that actually matters.

## Why the lock is as broad as it is

The document lock is the other half of this problem, and it is broad for a reason this project's own
starting position explains: while a write is a whole document, *any* concurrent write to a related
document is a total loss. A lock narrow enough to be pleasant would be a lock that lets that happen.

Three mechanisms make it broad, and they are separable:

**A group lease stands in for every job in it.** `resolveDocumentLockApiTarget` retargets a per-job
lock call to the group when the job is in a live group, and `JobGroupBypass` on the server lets the
group holder write member jobs whose own locks say otherwise. So one member editing one job in a group
of a hundred takes a lease that covers the hundred.

**A refused batch is refused whole.** `PutJobDocumentsHandler` collects the lock state for every job in
the request and answers 409 if any single one is held elsewhere, writing nothing. That is correct while
writes are whole-document — a partial tree is worse than no tree — and it is what makes the client's
gate a formality rather than the real defence.

**The write set is not known until close time.** `closeActiveJob` collects the parent/child tree
through `getAllRelatedJobs`, recalculates it, and writes all of it, plus the group and the account
document. Nothing can acquire the right locks in advance because nothing knows what they are, so the
only pre-emptive lock available is one broad enough to cover whatever the cascade might reach.

The third is why the first two exist. It also does not go away: a cascade is inherent to how jobs
relate, not an artefact of the lock. What changes is that a per-document version check does not need to
predict the write set — it validates each document as the write arrives, which is the one form of
protection that survives not knowing what will be written.

**So the ordering is the opposite of how it looks.** The lock cannot be relaxed and the version check
added afterwards; the version check is what makes the relaxation safe, and Stage A is where it lands.

## A refused write is not currently an outcome

Three defects sit between here and any relaxation, and none of them needs a shared planner to fire.
They are already reachable on a personal account with two tabs.

**`saveJobsViaApi` resolves the same way whether the write landed or was refused.** `closeActiveJob`
closes the editor and shows its adjustment summary either way. Recorded in
[shared-planners](../shared-planners/plan.md) § D2, parked for this review.

**The client's own gate discards edits silently.** When `canPersistJobClose` is false, `closeActiveJob`
applies the edits to the local store and *clears* the pending writes; `closeGroup` does the same. No
request is made, no error is shown, and the work is gone at the next reload. This is the more serious
of the two, because it fires before any server involvement — a lock the user cannot see costs them work
they cannot recover.

**The retry queue replays what is current, not what was refused.** `pendingJobDocumentWrites` holds
job ids and resolves them against `jobArray` at flush time. On a 409 the ids stay pending, the holder's
own save arrives over the websocket and lands in `jobArray`, and the next flush PUTs that back —
either a pointless re-upload of the holder's document or a clobber of it by one part theirs and part
stale local edit, depending on which side of the race the flush falls. The flush consults no lock gate
of its own.

Fixing these is Stage B here. It is worth landing whatever is decided about the rest of the project,
because today they make the lock's *breadth* the thing protecting users from the lock's *failure
modes* — and that is the wrong thing to be relying on.

## Stages

Named after Phase 1, and deliberately ordered so each is worth landing alone.

### Phase 1 — Project folder and docs

This folder, its `contents.md`, this plan, the overlay scaffold, and the row in the section
[`contents.md`](../contents.md). No code.

### Stage A — A write that checks the revision

The conditional write above. Establishes that a write can be refused, and gives every later stage a
revision to reason about.

**The version half is done** — see § What has landed already. This stage is now only the compare: a
write that carries the revision it read, a filter that matches on it, and an answer for the write that
does not match.

Two things make this the first stage rather than the obvious one. It is what every relaxation in Stage
D rests on, per § Why the lock is as broad as it is. And it is the smallest change that converts silent
loss into something a client is told about, which is the property § What a conflicting write is
answered with identifies as the one that actually matters.

The refusal must be **per document**, not per request. A batch in which one job moved should write the
rest and answer with the one that did not — the current all-or-nothing 409 is a consequence of
whole-document writes, and reproducing it here would carry the defect forward into the mechanism meant
to fix it.

**What the shape has to get right:**

- A revision read back as zero must never become a filter. The consequence for this stage: a write
  whose revision did not decode is an unversioned write, not a conflicting one.
- The conditional filter is an addition to the **filter**, not a change to the update.
  `SetDocumentWithRevision` already solves the write half and must not be reshaped to carry the
  compare.
- A request carrying no revision is an unversioned write and is accepted as today, per § Wire
  compatibility. That is what lets a client be converted after the server.

**A conditional write cannot be batched, and finding that out cost a rewrite.**

The first build put conditional writes in the same unordered `BulkWrite` as the rest and worked out
afterwards which had landed, by reading each document's revision back and testing it against the
revision the write had matched on plus one. Every unit test passed. Against a real Mongo it reported
every refused write as applied.

The reason is that **a refused write and a successful one leave the document at the same revision**.
In both cases exactly one write landed — the client's own, or the writer who got there first. The
counter cannot tell them apart, so nothing read afterwards can.

Nor can the batch's own totals: `BulkWrite` answers in aggregates, and an unconditional write matching
an existing document contributes to `MatchedCount` exactly as a conditional one that landed does. The
totals cannot be split, and with more than one conditional write they cannot say which matched.

So each conditional write is issued as its own `UpdateOne`, whose `MatchedCount` is an unambiguous
answer about that write. The revision is still read for a refused write, but only to say what to
reconcile against — it is no longer what decides whether the write was refused.

**This is why the stage's tests run against a real database.** The defect was invisible to every unit
test, including ones that were mutation-checked: a passing mutation proves the tests match the
assumption, not that the assumption is true. See [overlay.md](./overlay.md) § What proves this works.

### Stage B — A refused write is an outcome the UI handles

The three defects in § A refused write is not currently an outcome: the resolve that cannot distinguish
refusal from success, the client gate that discards edits without telling anyone, and the retry queue
that replays `jobArray` rather than what was refused.

**Independent of the rest of this project.** All three are live on a personal account with two tabs,
and none needs a version, a delta or a planner to reproduce. Landing this early also means Stage A's
refusals arrive somewhere that can already handle them, rather than into a client that reports them as
success.

**What a refusal does to the user's edits is a product decision this stage cannot take alone** — see
§ Open questions. Keeping them and flagging the affected document, discarding them, and blocking the
close are three different applications, and the answer decides what this stage builds.

**Ordering constraint, from Stage A.** The client must learn to recognise a `revision_conflict` 409
**before** anything starts sending a revision. Today the SPA's `Job` class drops the revision when it
rebuilds `_meta`, so every write is unconditional and the conditional path is unreachable — but
`throwNonOkPrivateResponse` recognises a 409 only as a lock conflict, and
`persistJobDocumentsToApi` clears the pending queue only on success. So the first change that carries
a revision into `toDocument` turns a refused write into a silent endless retry of a batch that can
never succeed. Whichever answer the product decision gives, teaching the client to recognise the
refusal comes first.

### Stage C — Field-scoped writes

Dirty tracking through the SPA persist path, and an API that sets only the paths it was given.

**The change set has arrived.** [job-document-drafts](../job-document-drafts/plan.md) Stage 3 slices 1
to 4 have landed: an open job is a frozen base plus an ordered log of what the reader changed, every
way of changing a job is a command, and the editor cannot be changed any other way — a write into the
job on screen throws. Each log entry names its job and carries Immer patches over the **document**
shape, so the paths are the stored document's own. This stage is no longer waiting on that project.

What it is waiting on, and what it has to decide first, is § What arrived, and what it changes below.

#### What arrived, and what it changes

**A removal cannot be said in a partial document.** This stage settled that the client "does not name
Mongo paths. It sends a partial document and the server derives them", where a field's presence is
what says it is being written. A reader unlinking an ESI job, removing an extras cost or deleting a
setup records `{op: "remove", path: [...]}` — and in a partial document an absent key means
*unchanged*, so absence is already spent and nothing in the body says "delete this row".
`SetDocumentWithRevision` already takes an unset map, so the server can delete; the body cannot ask.

**Decided: the body carries a second part naming the rows that went.** The request becomes an
envelope of two parts rather than a bare job:

```json
{ "document": { "build": { "materials": { "34": { "quantity": 100 } } } },
  "removed":  [ ["esi", "industryJobs", "500001"],
                ["build", "materials", "35", "purchasing", "p-1"] ] }
```

`document` is the partial job, unchanged from what this stage settled. `removed` names each row that
went, as the path into the job it sat at. Seven commands produce a removal: unlinking a run, removing
an extras cost, an invention entry, a transaction, a market order with the sales made against it, and
deleting a setup.

**The envelope names the job and the revision; the document holds only what the job contains.** A
partial document says nothing about which job it is — `jobID` appears in it only if the reader changed
it, which no command does — and it cannot carry the revision either, because `_meta` is the server's
and a body may not name it. Both travel beside the document instead:

```json
{ "jobs": [ { "jobID": "job-1", "revision": 4,
              "document": { "build": { "materials": { "34": { "quantity": 100 } } } },
              "removed":  [ ["esi", "industryJobs", "500001"] ] } ] }
```

The alternative — letting the partial document carry `_meta.revision` as the one permitted `_meta`
path — keeps the client's existing shape and spends the structural guarantee that makes `_meta`
unreachable, for one field the envelope can hold plainly.

**The lock gate needs more than the envelope holds, and that is a decision the handler owes.** The
gate asks about each job by id, which the envelope gives it, but it also builds a `JobGroupBypass`
from each job's `includedInGroup` and `groupID` — and a partial document carries those only if the
write changed them, which no command does. A handler reading them off a partial would see every job
as belonging to no group and drop the bypass for the ones that do, which is most of a shared
planner's close.

**Taken: the envelope carries the two fields beside the id.** The gate already trusts what the request
says about a job's group, so this keeps today's behaviour exactly and changes nothing about who is let
past a lease.

The alternative was to have the server read each job's stored group state, which would also stop a
request claiming a membership it does not have. That is the better guarantee, and it is a change to
who is trusted rather than to how a write is shaped — bundling it into this stage would move a trust
boundary inside a migration nobody would think to look in for one. It is recorded in § Open questions
instead.

**A write naming no revision in the envelope carries its whole document.** That is not the same as
being a create. Two writes carry a whole document: a job the writer holds no stored copy of, which
has no revision at all; and a job changed with nothing recording what changed — an ESI refresh, a
group operation, a job a close resized — which has one. The second is still checked against it,
because the revision rides in the document's own `_meta` where `BulkUpsertJobs` has always read it.
Conflating the two would have written every resized job unconditionally, which is exactly what
§ What a close writes decided against.

The envelope's revision therefore marks a write as **field-scoped**, not as a change: only a write
carrying fields has fields to scope. A field-scoped write always names one, and the server refuses one
that does not rather than upserting it — setting some fields into a document that is not there would
store a job made only of those fields.

**The model itself is what a removal path is checked against.** The server walks each path segment by
segment over `models.Job` by reflection: a segment matches a field's json name, and a segment
following a **map** field is that map's key. A path that leaves the model, or that reaches a field
which is not a keyed collection, is refused before any write is built, and the `$unset` path is
derived from bson tags rather than accepted from the body. So `_meta.owner`, `_meta.revision` and a
field the model does not carry are as unreachable as they are through `document` — the authority is
the same struct in both halves, and it cannot fall behind the model because it *is* the model.

**A list is written whole rather than cleared by path.** `parentJobs` and `build.childJobs`'s values
are lists, and `$unset` on a list element leaves a null hole where the row was. The client sees that
from the document it is building against and promotes such a removal to writing the list whole, so
`removed` only ever names a key of a keyed collection — which is exactly the shape the server checks
for.

The three rejected alternatives, and why:

- **A typed mirror of the job's shape**, one Go struct per collection, with removals as key lists at
  the leaves. It was taken first and then reversed, for two reasons found while building it. A node
  cannot be both a key list and an object, so a row removed from a collection and a row removed from
  inside a *sibling* row of that same collection have no shape they can share — `build.materials`
  would have to be a list and an object in one body. Working around that needs a two-field node, and
  then the client has to know which of the job's fields are collections in order to build the nodes:
  a second copy of model knowledge, in another language, that no parity test can span. The mirror
  also owed a parity test of its own, since a new collection on `models.Job` would otherwise be
  silently unremovable.
- **A removal list of dotted path strings**, validated against a hand-kept list of the model's map
  fields. Close in form to what was taken, and the difference is the whole point: a list someone
  maintains drifts from the model, while reflection over the model cannot. Segments also stay
  separate rather than joined, so a key containing a dot is not ambiguous.
- **A null sentinel** against each removed key. Cheapest on the wire, and it gives `null` a second
  meaning in a document where an empty collection already goes as its empty form and `null` is
  reserved for something genuinely absent. It also needs the raw-JSON walk to carry a third state,
  since a typed decode cannot tell an absent key from an explicit null.

**Promotion to the collection was the first decision here, and is worth recording as rejected.** The
body would have carried the whole collection a removed row sat in, so the row was gone because the
map replaced it — no second part at all. It sends every row of a collection to remove one, and it
makes concurrent removals from one collection destroy each other: last write wins within the map, so
two members unlinking different runs lose one of the two. § Decisions taken, and what still stands
gives members no longer conflicting at all as the reason the lock can become advisory in Stage D, and
promotion holds a class of conflict open against that.

**The client drops an overlap; the server refuses one.** These are different answers to the same
question and both are right for where they sit. The client is building the write against the job in
front of it, so it can see that a removal is already covered by a collection it is sending whole, and
dropping it is a correction rather than a loss. The server is handed paths whose history it cannot
see: an overlap there is either a client that failed to make that correction or one asking for
something it should not, and quietly dropping half of it would lose a removal the reader asked for
with nothing said. So `SetFieldsWithRevision` refuses the write and names both paths. A stored
document would refuse it anyway — and refuse the whole update rather than the offending half — so the
choice is only whether the caller is told which two paths disagreed.

**Both parts are settled against the job as it now reads, not trusted from the log.** A stored
document refuses an update naming the same ground twice — `$set` on `esi.industryJobs` and `$unset`
on `esi.industryJobs.500001` conflict — so a removal inside a collection the write already carries
whole is dropped, and so is a removal of a key the job still has, which is what a stale log against a
reloaded job produces. The same check on the other side drops a written path the job no longer has
anything at.

**A top-level field cannot be removed, and the client refuses to ask.** A job has no optional
top-level field: one stored without its `build` cannot be read back. Rather than let that arrive at
the server as a refused path, the client throws where the command produced it. No command produces
one today; the guard is for the one written later.

**A row the cipher rewrites is written whole, and the server is what knows it.** `character_id` and
`corporation_id` arrive on a linked run, a market order or a transaction and are stored ciphered as
`character_ref` and `corporation_ref`. The field carrying the json name is `bson:"-"` — it has no
stored path of its own — so a present json key whose field has no bson name promotes the write to the
row containing it, which is the unit the cipher rewrites anyway. No pair table is needed: the tag
says it. **This belongs to the server walk, not the client**, which sees neither bson tags nor the
ciphered value; the client's own promotion rule is the list one above, and that is the only one it
owes.

*One field does not follow the rule, and it is the model that is inconsistent.*
`LinkedESIJob.CorporationID` is `bson:"corporation_id,omitempty"` while the same field on
`MarketOrder` and `Transaction` is `bson:"-"`, so a linked run stores the plain corporation id beside
the ciphered `corporation_ref` its own comment says it is converted to. A field-scoped write
reproduces that faithfully — the path is stored, so it is written — which is what a whole-document
write does today. Whether the tag is the defect is § Open questions; this stage does not change it
either way.

**Wire compatibility: breaking, and deliberately so.** The endpoint's body goes from a whole job to
the envelope above, which is the change § Wire compatibility already carries — the API and the SPA
deploy together for this stage, and `BulkUpsertJobs` keeps taking a whole job for the archived-jobs
restore.

**Built on both sides, and shippable on neither alone.**
[`writeBody.js`](../../../frontend/src/Functions/JobDocuments/writeBody.js) turns a job and its log
entries into the two parts. The server walks them through `models.Job` itself — `JobSetPaths` and
`JobUnsetPaths` — and `PutJobDocumentsHandler` reads the envelope batch, splits the whole-document
writes from the field-scoped ones and sends each to its own writer.

What is left is what makes the two halves meet: the SPA's persist payload becoming these envelopes,
a refusal the client can act on rather than retry, a fixture pinning the envelope for both sides, and
a live-database case. [overlay.md](./overlay.md) § Stage C holds the list.

**Close time does more than the log holds, and only part of it is a change.** `closeActiveJob` takes a
working copy and works on it outside any command, but the three things it does are not alike:

- **The reader's parent and child intent.** `parentChildToEdit`, applied by `applyParentChildChanges`.
  A decision, deliberately held outside the log.
- **The defensive pass.** `repairMissingParentChildRelationships` and
  `normaliseParentChildRelationships` check that links are two-sided and possible. They are a
  correctness check that should find nothing, not a rewrite closing intends. Both already return a set
  of ids and add one **only when they changed that job**, so a clean close returns empty sets and
  writes nothing beyond the edited job. A pass that fires is evidence something else wrote a bad link.
- **The recalculation.** With automatic recalculation on, `materialTreeShaker` and
  `recalculateJobForNewTotal` resize related jobs for real — which is what the adjustment summary
  reports to the reader.

So the log is the change set for what the reader did in the editor; the defensive pass contributes a
write only in the rare case it found something wrong; and the recalculation is the genuine cascade.

**Decided: every job a close touches besides the edited one is written whole, and each of those
writes carries a revision.** None of the three passes becomes commands on the jobs it reaches. What
makes this safe is not the width of the write but the condition on it: each of those jobs is written
from whatever copy `jobArray` is holding — the last document delivered for it, untouched since,
because nothing in the edit session touches a related job before close. If that job has moved, the
write is stale by construction and being refused is the right outcome rather than a failure to work
around. Field-scoping it would narrow the window without making the copy any fresher.

The decision covers all of them because the write set does: `closeActiveJob` unions
`modifiedLinkedJobIDs`, `repairedJobIDs`, `normalizedJobIDs` and `recalculatedJobIds` into one set and
writes the `jobArray` copy of each. The three passes differ in how often they contribute and in what
a contribution means — a link the reader made is routine, a repair that fires is evidence of a bad
link, a resize is the cascade — but each produces the same kind of write from the same kind of copy,
so each is refused on the same terms.

**A job this close creates is the one case with no revision to carry.** `closeActiveJob` filters the
ids of `tempJobsToAdd` out of that union and appends those jobs to the write directly. A genuinely new
one has no stored document and no `jobArray` entry, so there is no copy for a revision to be read from,
and its write takes `buildJobUnconditionalUpsertModel` — an upsert on the id with no filter on
revision or on the document existing at all.

**What makes that safe is that no document stands at the id, not that no revision was read.** A write
with nothing to compare against cannot be refused as stale, so an id that already held a document
would be overwritten with no conflict reported.

**Which is why the test has to be the stored copy, not the list the job arrived in.**
`temporaryChildJobs` does not hold only new jobs. `planChip` resolves a material through
`findMaterialJobInGroup`, which returns a job the group already runs — a live `jobArray` entry with a
stored document behind it — and promotes that job through `finaliseCreatedChildJobs`, whose own
comment says its list "may include linked group jobs with no new build";
`markChildJobsForAddition` then puts it in the map. (`buildSpeculativeChildJobs` resolves the same
way but records into `speculativeChildJobs`, which a close does not write.) `Job` mints `jobID` from
`crypto.randomUUID()` only when no id
was passed in, and that path passes the existing one. So a member of `tempJobsToAdd` can be a job with
a real revision to check against, and writing everything in that map unconditionally would overwrite
whatever else had changed it — the exact failure Stages A and C exist to close.

**What this stage builds, then:** a write is unconditional when the client holds no stored copy of that
job, and conditional on the revision of that copy otherwise. Which list the job arrived in decides
nothing. A close-created child is the common case of the first, not its definition.

The cost, stated: a refused write leaves that related job as it already stood until something touches
it again. That is recoverable and it is visible — the planner surfaces a parent and child whose sizes
disagree rather than correcting it silently.

**So a revision is not a draft-only concern.** § The revision is further away than this plan says
puts the revision on the draft's base, which is right for the job the reader edited. Every other job
a close writes was never open in the editor and has no draft base, and needs a revision just as much
— an unconditional whole-document write is exactly what this decision refuses. The rule that covers
both: **a write carries the revision of the copy it was built from, wherever that copy is held.** For
the edited job that is the draft's base; for every other job a close writes it is whatever revision
that job was last delivered at.

`Job` rebuilds `_meta` from `lastModified`, `createdAt` and `lastUpdatedBy` at construction, so every
job the client holds loses its revision, not only the one being edited. Keeping it is therefore work
on the class and on whatever hands it a delivered document, not on the draft alone.

**The reshape has to reach live first.** A path-scoped `$set` of `build.materials.<typeID>.quantity`
into a stored document still holding a positional array writes a key that means nothing — the whole
document write is what covers that up today. job-document-drafts Stage 2 is built and has been run
against dev; this stage cannot deploy before its release window against live.

**The revision is further away than this plan says.** § Carrying the revision belongs here says the
`Job` class drops it when it rebuilds `_meta`. It is dropped at construction, so no part of the SPA has
ever held one, and after a rebase the revision to send is the base's current one rather than the one
read when the job opened. The draft's base is where it belongs.

**Two things this stage said are now out of date.** The seam it says does not exist is `actions.run`:
the reducer that rebuilt the whole job on every action is deleted. And "arrays are the sharp edge" is
narrower than it was — the eight row collections are keyed on both sides, and what stays positional is
`parentJobs`, `build.childJobs.<typeID>` and `rawData`, which the commands assign wholesale. Those are
field-scoped but last-write-wins within the field, so two members linking different children of one
material still lose one of them. That is a product judgement to record rather than a path problem.

#### What the code shows today

**What the outbound path actually is.** An earlier draft of this plan said "the persist debounce and
the outbound coalescer"; there is no outbound coalescer. `inboundJobDocumentsCoalesce` handles
websocket *deliveries*. Outbound is the persist debounce plus `pendingJobDocumentWrites`, which holds
**job ids** and resolves them against `jobArray` at flush time.

That id-based queue is the obstacle, and it is the same design behind the retry defect Stage B fixed:
by flush time the edit that caused the write is gone and only the current job object remains, so the
client structurally cannot say what changed without keeping something else.

**Nothing announces a change.** The Edit Job reducer rebuilds the whole job with `new Job(...)` on
every action, the store replaces jobs wholesale, and only three sites assign a field on an instance
directly. There is no existing seam to hang per-field tracking on — which is precisely what
job-document-drafts Stage 3 builds, as a base plus an ordered log of commands rather than as a diff.

**The document is deep.** 191 leaf paths, 122 of them under `build`. Field-scoped here means
*path*-scoped; sending changed top-level keys would leave two members editing different parts of
`build` conflicting exactly as they do now.

**Arrays are the sharp edge, and the other project removes it.** The job holds thirteen arrays, and a
positional path into one — `build.materials.3.quantity` — is wrong the moment a member inserts or
reorders, which two members editing one job is exactly the case for. Every element type already
carries a natural key (`typeID` for materials and skills, `id` for extras costs and broker fees,
`job_id` / `order_id` / `transaction_id` for the ESI-linked rows), and job-document-drafts Stage 2
turns those arrays into row collections keyed by it. A path into a keyed row is stable; a path into
an array position is not.

That reshape is now built and proved against a restored copy of live, and the gate under it has run:
the key each collection would use is unique within a document, so keying loses no row. So by the time
Stage C is unblocked, the paths it sends will be addressing keyed rows rather than positions — which
is the difference between a path that survives another member's insert and one that does not.

#### Decisions taken, and what still stands

These were taken before the dependency above was found, by reading the code rather than the
neighbouring plan. Two survive that discovery and two are superseded.

~~**Dirty tracking is a diff against a baseline, taken at flush time.**~~ **Superseded.** A diff was
the right answer to "nothing announces a change", but job-document-drafts Stage 3 makes something
announce it: the ordered log of commands *is* the change set, and it is better than a diff on two
counts. It knows what the player meant rather than what two snapshots happen to differ by, and it
distinguishes a change from a what-if, which a diff cannot. This stage consumes that log rather than
building a parallel mechanism beside it.

**Jobs only.** Groups, settings and the archive stay whole-document, as § Open questions leaves them.
`UpdatePlannerSettings` is the worked example of the write shape.

**The write endpoint's body is replaced outright**, not widened to accept both shapes. One body, no
dual-path code and no cleanup slice owed. The cost is accepted deliberately: the API and the SPA
become a single atomic deploy for this change, and rolling back one half alone breaks job saving.

`BulkUpsertJobs` still accepts a whole job, because the archived-jobs restore rebuilds a job from its
archived copy and has no baseline to diff against. That is a second in-process caller with a genuine
need, not a compatibility wrapper for the endpoint.

**The client does not name Mongo paths. It sends a partial document and the server derives them.**

This is a security decision, and the reasoning is worth keeping because the cheaper design looks
equivalent and is not.

*What protects a job document today.* The client sends a whole job, and the server does not trust its
`_meta`: the owner is overwritten from `RequestPlannerOwner`, which refuses a planner the account
holds no membership row for; `lastUpdatedBy` comes from the authenticated account; the revision is
`$inc`'d and `MetaSetByPath` drops any copy the client sent; and `_id` is composed server-side by
`OwnerScopedDocumentID`. The client can say what a job *contains* and never where the write *lands*.
That guarantee is structural — the body decodes into a typed `models.Job`, so a field that is not on
the struct cannot be expressed at all.

*What naming paths would cost.* A body carrying dotted paths makes `_meta.owner` expressible, which
would move a document to another planner and step around the membership check; `_meta.revision`,
which would defeat the conditional write Stage A just built; and arbitrary unknown paths, which would
let a client accrete fields onto stored documents. None of those is reachable today. Accepting paths
converts a structural guarantee into an enforced one, and enforcement has bugs where structure does
not.

*What is built instead.* The body is Job-shaped with only the changed fields present. The server
decodes it into the typed model as it does today and derives the Mongo paths from which fields were
present, so the struct still bounds what is expressible and there is no path validator to get wrong.
**This decision survives the dependency above**: it constrains what the *body* may express, whoever
produced it, and the change log supplies the changed fields rather than changing what may be said.

The cost is real and is accepted: presence has to be tracked — an absent field and a field set to a
zero value are different writes. Measured rather than assumed: a plain field cannot carry presence
under `encoding/json/v2` (`{"a":0}` and `{}` both decode to zero), but unmarshalling the same body
into `map[string]jsontext.Value` records exactly which keys arrived and recurses into nested objects,
and `RejectUnknownMembers(true)` refuses a member the model does not carry. So the walk is the raw
JSON for presence, the typed decode for values, and the **bson** tags for the path.

Two model facts the walk has to respect, found by reading the tags rather than assuming they agree:
`_meta.owner` is `json:"-"`, so it cannot appear in a body at all — the structural guarantee is the
model's own. And `character_id` is stored as `character_ref` after the entity cipher, so a path
follows the bson name; deriving it from the JSON name would write a field no reader looks at.

**Carrying the revision belongs here.** The SPA's `Job` class rebuilds `_meta` from `lastModified`,
`createdAt` and `lastUpdatedBy`, so the revision the server delivered is dropped before `toDocument`
runs and every write takes Stage A's unconditional path. A client that tracks what changed has to
carry the revision it read for the conditional write to mean anything, so the two arrive together —
which is also the point at which Stages A and B start doing real work for real users.

This is also what makes two members editing different fields of one job stop conflicting at all, rather
than merely conflicting visibly — which is what allows Stage D's lock to be advisory rather than
merely narrower.

### Stage D — The lock stops being broad

With a version check on every write, the lock no longer has to predict a cascade or stand in for one.
Three removals, in the order they become safe:

**The group lease stops covering member jobs.** `resolveDocumentLockApiTarget`'s silent retarget and
the server's `JobGroupBypass` both go. A group holds a lock on its *own* document — membership, name,
ordering — and member jobs hold their own. Whether that boundary is exactly right is an open question
below.

**The batch refusal becomes per document.** Already owed by Stage A; this is where the client stops
treating a 409 as a wall and starts reconciling the documents that actually moved.

**The lock becomes advisory.** It gates nothing server-side and exists to show who is editing what, to
offer handover, and to let a member avoid a collision before spending effort on one. The Redis
machinery — waitlist, handoff probe, viewer presence, contested versus solo lease — is kept as it
stands; what changes is that no write path consults it.

Three current hazards become harmless at that point, which is most of the argument for going this far:
the 24-hour solo lease (`SoloHolderLockTTL`) that can hold a document for a day after a tab crashes,
the absence of any websocket-disconnect release path, and enforcement disappearing silently whenever
Redis is unreachable — every gate is conditional on `h.locks.Redis != nil`. Under an advisory lock each
of those degrades to a misleading label rather than a blocked or unprotected document.

**The cascade releases go with it.** `cascade.go` and `cascade_pipeline.go` exist to force-release
per-job locks when a group lease moves, which is only necessary while a group lease covers member jobs.
The `document_lock_group_cascade` event and its client handling go the same way.

**Risk, recorded because it decides whether this stage was right.** An advisory lock is only as good as
members' willingness to respect it. If it is routinely ignored, the result is frequent conflict prompts
and a product that feels worse than a hard lock even though strictly less work is lost. The fallback is
a lock that still enforces on the single document a member has open — no cascade, no group blanket —
which is far looser than today and preserves the escape hatch. Build toward advisory; do not make
returning to enforcing expensive.

### Stage E — Delta delivery and client apply

`updatedFields` / `removedFields` on the wire, and a client that applies onto the document it holds.

**No longer blocked.** The ordering position and the baseline it is applied onto both landed with
shared-planners Stage G, per § What this project inherits. What remains is this project's own
ordering: a delta is only meaningful once Stage C makes the write field-scoped, because until then
`updatedFields` is the whole document under another name.

## Wire compatibility

| Surface | Change |
|---------|--------|
| Job write endpoint | **breaking** at Stage C — an envelope of a partial document and a list of removed row paths replaces a body of a whole document, with no dual-shape period. API and SPA deploy together for this change; neither half rolls back alone |
| Document revision field | **already landed**, ahead of this project. `_meta.revision` is on every stored document and every job write increments it. Nothing here adds it |
| Job write request body | additive at Stage A — a body may carry the revision it read. Absent means unversioned, and an unversioned write is accepted as it is today, which is what lets the server be converted before the client |
| Job write response | **breaking** at Stage A — a per-document result replaces a whole-batch 409. The 409 shape stays available for a client that has not moved, but a mixed outcome has no representation in it |
| Realtime document payload | additive at Stage E — a message carrying changed fields beside the full document lets a client choose; removing the full document is the breaking half and is separable |
| Document lock enforcement | **breaking** at Stage D — write paths stop consulting the lock. Not a wire shape, but every client that treated a 409 as the only refusal has to handle a version conflict instead, which is why Stage B precedes it |
| `document_lock_group_cascade` | **removed** at Stage D along with the group lease over member jobs. No client behaviour depends on it once per-job locks are not force-released by a group |
| Document lock HTTP and websocket surfaces | unchanged. The lock keeps its endpoints and events at Stage D; what changes is that no write path consults the answer |
| Stored documents | no migration. A field-scoped write produces the same document a whole-document write does |

## Done when

- Two people editing different fields of one document both keep their edit.
- A write that cannot be applied safely is refused and answered, never silently overwritten.
- No edit is discarded without the user being told, on any path — including the client's own gate.
- A client can apply an ordered stream of changes onto a document it holds and arrive at the same
  document a fresh read would give it.
- No write path sets fields it was not asked to change.
- Editing a job in a group somebody else is reorganising works, and a close whose sibling moved saves
  the rest.

## Open questions

- **Whether the lock gate should trust what a request says about a job's group.** It builds its
  `JobGroupBypass` from the `includedInGroup` and `groupID` the request carries, so a request naming a
  group it does not belong to is let past that group's lease. Reading each job's stored group state
  instead costs a query per batch and closes it. Long-standing rather than introduced here — this
  stage carries the two fields in the envelope precisely so it changes nothing about it.
- **Whether a linked run should store a plain corporation id.** `LinkedESIJob.CorporationID` is
  `bson:"corporation_id,omitempty"` where the same field on `MarketOrder` and `Transaction` is
  `bson:"-"`, so that one row stores the plain id beside the ciphered `corporation_ref` its own
  comment says it is converted to. Found while writing the server walk's rule for ciphered rows, which
  reads the tags rather than a pair table. This stage reproduces whatever the tag says and changes
  nothing; if the tag is the defect, correcting it is a model change with stored documents behind it
  and belongs to whoever owns the cipher, not here.
- **Which documents.** Jobs are the case that motivates this. Whether groups, settings and the
  archive follow, or stay whole-document because they have one writer, is not answered here.
- ~~**Where the counter lives.**~~ **Settled, and built.** `_meta.revision` is a
  per-document counter, incremented by every write. It was taken now rather than at Stage A because
  [shared-planners](../shared-planners/plan.md) § Every owner-scoped document id carries its owner
  rewrites every one of these documents in the cutover window, and seeding a field costs nothing in a
  pass that is already rewriting the row — where doing it later means a second walk or a long tail of
  uncounted documents the conditional write must special-case forever. It is named for what it counts
  rather than `version`, which every model already carries as the shape of the document, and a document
  is created holding it so that "absent" is never a state the conditional write has to answer for.

  A counter rather than Stage G's position token because they answer different questions: the token is
  per-owner and says *did I miss anything*, the counter is per-document and says *is this still the
  document I read*. A conditional write needs the second.

  This is no longer provisional: it has landed, and Stage A takes it as given rather than choosing it.
  See § What has landed already.
- ~~**What the client does with a refusal.**~~ **Settled.** A refused write tells the user and stops
  retrying.

  **The user is told with a warning snackbar**, matching the path already in `closeActiveJob` for a
  job deleted while it was open — same situation, same signal, no new UI.

  **The queued write is dropped.** The pending ids are cleared so the stale batch stops re-sending,
  and re-saving is the user's choice against a fresh document.

  **Re-read-reapply-retry was considered and rejected for now.** While writes are whole-document, a
  client that reapplies its edits onto the current document and writes again overwrites whatever the
  other writer changed — the exact loss this project exists to remove, arrived at by a different
  route. It becomes safe once Stage C makes the write field-scoped, and is worth revisiting there.

  Reading the code settled the shape of the question as well as the answer: the edits are applied to
  the local store either way, so they are never *lost from the screen* — what a refusal costs is the
  next reload, and what it needs is a signal rather than a rescue.
- **What the group lock covers once it stops covering member jobs.** Structure alone — membership,
  name, ordering — is the reading Stage D is written against. Whether reordering a group while another
  member edits a job in it is a conflict at all is the question underneath, and it is a product
  judgement rather than a mechanical one.
- **Whether the account document needs a gate.** It is written by every close, carries linked ESI
  orders, industry jobs and transactions, and has no lock check on any write path today. It is
  account-scoped rather than planner-held, so it may be correct that it stays ungated — but that is
  currently unexamined rather than decided, and this project is where it surfaces.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — a write that checks the revision | **Landed, server side, and proved against a real database.** A job carrying a revision is written conditionally on it as its own `UpdateOne`, whose match is the answer; a job carrying none is batched and upserted as before, so the change is additive. The refusal is answered per document as a 409 `revision_conflict` carrying `saved` and `rejected[]`. The first build batched the conditional writes and inferred the outcome from a later read, which passed every unit test and reported every refused write as applied — see § Stage A. **Landed is not the same as operating: nothing sends a revision yet**, so every production write still takes the unconditional path and no write is refused for a stale base. A project depending on this needs the client half — Stage C here — not Stage A. See [overlay.md](./overlay.md) § Stage A |
| B — a refused write is an outcome the UI handles | **Landed.** All three defects closed: the client recognises a `revision_conflict` beside the lock conflict it already handled, drops the refused write from the pending queue rather than replaying it forever, and warns the user; `persistJobDocumentsToApi` answers an outcome that `saveJobsViaApi` passes through, so `closeActiveJob` stops reporting a refused write as saved; and the client's own gate warns instead of discarding edits silently — in `closeGroup` as well as `closeActiveJob`, which carried the same defect for the group lock. Stage A's ordering constraint is discharged. See [overlay.md](./overlay.md) § Stage B |
| C — field-scoped writes | **Landed, and proved end to end. Not deployed.** A save sends one envelope per job — the id and group beside the document — and where the editor recorded what the reader changed, that document carries only those fields and names the rows that went. Where nothing recorded it, the whole document goes, checked against the revision its own `_meta` carries. The endpoint plans the stored update from the job model's own bson tags, refuses a body naming `_meta`, and writes the row whole where a ciphered id has no stored path. A write the server cannot read is dropped from the queue and said out loud rather than retried for as long as the tab stays open. The envelope is pinned for both sides by [job-write/body.json](../../../testing/fixtures/job-write/body.json), and driven through the real handler into real Mongo, where only the named field, the named row and the revision move. **It cuts over with [job-document-drafts](../job-document-drafts/plan.md) Stage 2**, whose `prepareRelease` step reshapes the documents in the same cutover: a path-scoped write into an un-reshaped document writes a key that means nothing, so the two go together rather than one waiting on the other. See [overlay.md](./overlay.md) § Stage C |
| D — the lock stops being broad | **Part landed: the batch refusal is per document.** A held job is dropped from the batch and the rest written, answered as a 409 carrying `saved` and every held document; the client keeps only the held ids queued. The other two removals are **not safe yet** — they rest on conditional writes, and no write is conditional until the SPA carries the revision, which is Stage C. Relaxing the lock now would remove the only protection operating. See [overlay.md](./overlay.md) § Stage D |
| E — delta delivery and client apply | Not started, and behind Stage C here, because a delta is meaningless until the write that produces it is field-scoped. Its shared-planners dependency is discharged. Applying a delta outside an open editor also wants [job-document-drafts](../job-document-drafts/plan.md) Stage 5, which makes `jobArray` plain |

## Recommended pickup order

**Stages A and B have landed, and Stage D's batch refusal with them.** A stale write is refused per
document and answered with what the client must reconcile against; the client recognises that
refusal, drops it rather than retrying forever, and tells the user; and a job another session holds no
longer costs the rest of the batch. What was silent write loss is a visible refusal end to end.

**Stage C is built, and what remains for it is the cutover, not code.** A save sends what changed,
checked against the revision it was read at, proved against a real database through the real handler.

It cuts over **with** [job-document-drafts](../job-document-drafts/plan.md) Stage 2 rather than after
it: a path-scoped write into an un-reshaped document writes a key that means nothing, so the reshape
has to be in the same cutover, not in an earlier release this one waits for. The reshape is a
`prepareRelease` step, so the data is converted as the stack comes back up on the new code — there is
no period in which one side is deployed and the other is not, and so nothing here needs to stay
backwards compatible while the other half catches up.

The same is true of anything else breaking this endpoint in the same cutover. Two projects each
changing its wire shape is not a thing to sequence; they go together.

**Stage E is what to pick up next, and both halves are now unblocked.** The open editor half rests on
[job-document-drafts](../job-document-drafts/plan.md) Stage 3: an open job is a base plus a log, which
is already something a delta applies onto. The other half — a delta reaching a job nobody is editing —
waited on that project's Stage 5, and Stage 5 has landed: `jobArray` holds plain job documents, so a
delta has something plain to land on and `Classes/job.js` no longer stands between the two.

**Stage C does not need that project's slice 5.** Slice 5 converts the panels to read from the draft,
which narrows re-rendering; the log is complete without it, because every change already goes through
a command and the job on screen cannot be changed any other way.

**Stage D's remaining removals are still blocked, and no longer for the reason first written here.**
The relaxation rests on a version check, and that check is no longer inert: the SPA carries the
revision a job was delivered at and a whole-document write is filtered on it, so two members writing
one job already refuse each other.

What the check does not cover is what the lock covers. A refusal protects a document; the lock
protects a close, which writes the edited job and every job it linked, repaired or resized, a batch
at a time rather than atomically. A member whose neighbouring job moved learns so by refusal and is
told — but the close has already half-landed. Relaxing the lock would trade a protection against
reaching that state for one that only reports it afterwards.

**Stage E was always behind Stage C**, because a delta is meaningless until the write producing it is
field-scoped.

**What remains in [job-document-drafts](../job-document-drafts/plan.md)** is its Stage 2 reaching the
live release window, and its own slice 5 and Stages 4 and 5. None of those gate building Stage C
here; the window gates deploying it.

**[job-groups](../job-groups/plan.md) waits on this project, and half its wait is over.** Its
dependency table names Stage A — landed — and Stage D's removal of the group lease over member jobs,
which is not, and which § Stage D explains cannot be taken until conditional writes are live. So that
project stays blocked, on the second of the two rather than both. Its own plan still reads as though
both are outstanding; the dependency is stated there rather than here, which is the same one-way
linking that let Stage C be designed twice.

**What this project supplies to others, and the caveat on it.** Stage A gives a document version and
a write that refuses a stale base. Both are built and proved against a real database, and **neither
is operating**: the SPA's `Job` class rebuilds `_meta` from three named fields, so `toDocument`
structurally cannot carry a revision and every production write takes the unconditional path.

A project that wants a stale write to be *refused* rather than reported is waiting on the client half,
which is Stage C here. Saying Stage A has landed without that caveat reads as protection that does not
exist, which is the error to avoid in either direction: the mechanism is live, the behaviour is not.

**The revision is further from the client than this said.** `Job` drops it at construction rather than
when `toDocument` rebuilds `_meta`, so no part of the SPA has ever held one. The draft's base is where
it belongs now, and after a document arrives mid-edit the revision to send is that base's current one.

**One gap is owed rather than blocked.** The Redis lock gate has no live test: nothing proves a lock
genuinely held by another session makes the handler drop that job and write the rest. `testing/redislive`
exists and this project does not use it. It belongs with Stage D's remaining work — see
[overlay.md](./overlay.md) § What proves this works.
