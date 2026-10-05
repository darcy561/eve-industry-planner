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
**before** anything starts sending a revision. When this was written the SPA's `Job` class dropped the
revision when it rebuilt `_meta`, so every write was unconditional — but
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
[`writeBody.js`](../../../frontend/src/Functions/Job/sync/jobWrite.js) turns a job and its log
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

Every job the client holds carries its revision: `jobFromDocument` keeps the delivered `_meta.revision`
on the plain document `jobArray` holds, so a job a close writes without having been open still has
one to send.

**The reshape has to reach live first.** A path-scoped `$set` of `build.materials.<typeID>.quantity`
into a stored document still holding a positional array writes a key that means nothing — the whole
document write is what covers that up today. job-document-drafts Stage 2 is built and has been run
against dev; this stage cannot deploy before its release window against live.

**The revision to send for an open job is its base's.** After a rebase that is the base's current one
rather than the one read when the job opened.

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

**Carrying the revision belongs here.** A client that tracks what changed has to carry the revision it
read for the conditional write to mean anything, so the two arrive together — which is also the point
at which Stages A and B start doing real work for real users.

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

~~**The lock becomes advisory.**~~ **Weighed and not taken** — a job's own lock still refuses another
session's save; see [overlay.md](./overlay.md) § The lock covers one job. What was proposed: it gates nothing server-side and exists to show who is editing what, to
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

**Decided: a close lands whole or not at all.** A close writes the job the reader edited and every job
it linked, repaired or resized. If the revisions the client holds show any of them is stale, nothing is
written — the close is refused whole rather than writing the jobs that pass and reporting the rest. This
is what replaces the lock's protection of a close; the per-document refusal ordinary saves get is
unchanged.

What that needs, as it stands today:

- **A close is not one unit on the wire.** Its jobs join the shared save queue and flush with whatever
  else is pending, so a request can carry a close's jobs beside an unrelated edit, and the group change
  and the ESI links it makes go as separate requests after it. A close has to travel as its own request,
  marked as one change.
- **The server writes a batch one document at a time.** `BulkUpsertJobs` and `BulkUpsertJobFields` each
  apply conditional writes per document. A close marked as one change runs every one of its writes —
  whole, field-scoped and creates — inside one Mongo transaction, aborting on the first revision
  conflict, a create whose id already exists, or a lock refusal, and answering with every stale job and
  nothing saved. The stack's Mongo is a replica set, so transactions are available; nothing in the
  services uses one yet, so this is the first.

  The alternative — read every revision, then write — leaves a window for another member's save to land
  between the check and the write, which is the state this rule exists to prevent.
- **Realtime delivery is unaffected.** A transaction's writes reach the change stream as one event per
  document, each with its own revision pair, so Stage E applies them as it applies any update.

**What the one change covers is the jobs, and it is shaped to [job-groups](../job-groups/plan.md).**
That project makes membership the job's own fact — `job.groupID`, already on every job — and cuts the
group document to authored fields, with `outputTypeIDs` refreshed at group close and stale only
cosmetically. Under it, a close's membership change is already inside the job writes the transaction
covers. So the group document is not put in the transaction: until job-groups lands, the group write a
close makes today follows the jobs and is skipped when they are refused, and job-groups then deletes
the membership half of it rather than finding it built into a transaction. The account's ESI links
follow the same rule — written only once the close has landed, never after a refusal. The
one-change write is the mechanism job-groups' § Creation is one request needs too, and should be built
so that request can use it.

**A refused close keeps the editor open and shows what changed.** Today a refused close still ends the
edit session, writes the ESI links and the group, and drops the reader's edits with a warning. Instead
the editor stays open with its log intact, and a review panel sets each of the reader's commands
against the job as it now stands, in the four outcomes
[job-document-drafts](../job-document-drafts/plan.md) § The merge, when the lock frees already
defines: applies clean, already done, conflicts — the reader chooses between their value and the one
now stored — and unapplicable, where the target is gone. The reader keeps or drops each, and closing
again recalculates the linked, repaired and resized jobs from the current documents rather than
reviewing them, because those are derived by the close and were never the reader's edits.

That panel is the merge review the drafts project designed for a draft whose lock frees, so it is built
once and serves both. The rebase it stands on is built — the editor's log already re-applies over a
new base — but nothing yet detects a collision, so the per-command comparison is new work.

**Risk, recorded because it decides whether this stage was right.** An advisory lock is only as good as
members' willingness to respect it. If it is routinely ignored, the result is frequent conflict prompts
and a product that feels worse than a hard lock even though strictly less work is lost. The fallback is
a lock that still enforces on the single document a member has open — no cascade, no group blanket —
which is far looser than today and preserves the escape hatch. Build toward advisory; do not make
returning to enforcing expensive.

### Stage E — Delta delivery and client apply

A delivery carries what changed, and a client applies it onto the document it holds rather than
replacing that document.

**No longer blocked.** The ordering position and the baseline it is applied onto both landed with
shared-planners Stage G, per § What this project inherits. What remains is this project's own
ordering: a delta is only meaningful once Stage C makes the write field-scoped, because until then
`updatedFields` is the whole document under another name.

**What this stage is for, and what it is not.** Two members editing different fields of one job and
both keeping their edit is **Stage C**, which is built. This stage buys three narrower things: a
client that applies rather than replaces, an open editor whose base moves by the fields that changed,
and the § Done when line about rebuilding a document from an ordered stream. It is worth scheduling on
that last line, not as the fix for the product problem — that fix has already landed.

**The payload saving is not in this stage.** A message carrying changed fields *beside* the full
document is additive and costs more bytes, not fewer. The saving arrives when the full document is
removed, which § Wire compatibility keeps as a separate breaking half. Anyone scheduling this stage for
payload size is scheduling the wrong half.

#### What is already in place

- **The capture.** The change stream asks for `updateDescription` and reads `updatedFields` and
  `removedFields` in `isSchemaMaintenanceOnlyUpdate`, to suppress a maintenance write. The delta is
  parsed and discarded — § The delta is already there.
- **The client's seam, and it is the right one.** `editSession.documentArrived` calls
  `setBase(draft, jobID, document)` and the reader's own log re-applies above it, so an open editor
  already follows the document. A delta becomes a different call on that same seam. Outside the editor
  `updateOrAddJobsToJobArray` replaces the row, and `jobArray` holds plain documents since
  [job-document-drafts](../job-document-drafts/plan.md) Stage 5.
- **Arrival order for one document.** `outboundDocPartitionKey` groups by owner and
  `enqueueOutboundDocUpdate` hands each message to that owner's shard FIFO, waiting for room rather
  than going around the queue. Two changes to one job travel one queue in stream order.

#### Whose vocabulary travels on the wire

`updatedFields` arrives from Mongo as a **flat map of dotted stored paths**, and the browser does not
receive a stored document verbatim: `outgoinglogic.ClientPayload` runs `restoreEntityIDs`, which
**recurses through nested maps** rewriting every `*_ref` key into its `*_id`. It does not see a dotted
path at all. So the shape of the delta on the wire is a decision, not a given. Three answers:

| Option | Cost |
|--------|------|
| **Dotted stored paths, the client translates** | A second copy of the model's field mapping, in JavaScript. Two copies of one fact — refused on § One source of truth |
| **Each path the update set, translated by the server, with its value** | One reflection walk over the model's tags, the mirror of `models.JobSetPaths` |
| **A nested partial document and the removed row paths** | The Stage C write envelope, travelling the other way |

**The second is taken — after the third was built and had to be reversed.** Mongo reports every changed
path together with the **whole** value set at it, and a value set at a path *replaces* what was there.
Folding those paths into one nested document throws away the one fact a client needs to apply them: the
level each value was set at. A client can then only merge, and merging is wrong in three ordinary cases —
a collection emptied to `{}` merges as a no-op and keeps every row, a row written whole keeps fields the
new row dropped, and a whole-document write keeps every row it removed. In each, the client ends a
revision ahead holding a document the server does not. A coverage review found it; nothing had tested
a value set above a leaf.

So `changed` is a list of `{path, value}` in the client's names, one entry per path Mongo reported, and a
client **sets each value whole at its path**. The two costs once held against this did not survive
building it. The SPA already speaks paths — `removed` is paths, and the write log's patches name paths —
so it is not a vocabulary nothing else uses. And `restoreEntityIDs` needs no dotted branch: a ref only
ever reaches a client inside a value, as a map key the existing walk rewrites; **a ref set or cleared on
its own** would reach the browser as ciphertext, so the delta refuses it and the whole document carries
that change instead.

It shares `removed` with the write envelope and no longer shares the rest, and that is correct rather
than a loss: a write says which fields a reader touched, which a partial document says well; a delivery
says the level Mongo set each value at, which a partial document cannot say at all.

What the server has to do is the one genuinely new piece of code: translating each stored path to the
json names the client reads, converting the stored names inside each value the same way, and **dropping
what a browser must not learn** — `protected`, and every other field tagged `json:"-"` that is not a
ref.

**The translation is nearly the identity function, and the exceptions are the whole of the work.** The
`json` and `bson` tags on `models.Job` are the same string for every ordinary field, so most of a stored
path is already the path the client reads. Three classes are not:

| Class | What the reconstruction does with it |
|-------|-------------------------------------|
| Stored and sent, same name — almost every field | passes through |
| Stored, not sent — `protected`, and the `*_ref` fields tagged `json:"-"` | a ref is **rewritten into the client field it stands for**, which `restoreEntityIDs` already does; anything else is dropped |
| Sent, not stored — `MarketOrder` and `Transaction`'s `corporation_id` and `character_id`, and `LinkedESIJob`'s `character_id`, all tagged `bson:"-"` | never appears in `updatedFields` at all, because nothing stores it. It reaches the client only as the product of its ref moving |

So the ref rewrite is not a convenience here — it is the only way the third class can move, and a delta
that dropped refs instead of rewriting them would silently stop delivering those fields.
`LinkedESIJob.CorporationID` is the one row that stores the plain id beside the ref, which § Open
questions already holds as a question for whoever owns the cipher; this stage reproduces whatever the
tag says, as Stage C does.

#### A dropped message, not a reordered one, is what breaks a delta

The risk is not that 3 arrives before 2 — the owner's FIFO prevents that for one document. It is that
a message never arrives at all. `services/websocket/server/outbound.go` drops a message when that
recipient's send buffer is full, and a reconnect can miss one. While delivery is whole-document this is
invisible, because the next delivery repairs it. **With a delta, those fields are gone and nothing
notices.**

`position` cannot detect it. It is `md.Sequence.Stream` — the **global** JetStream sequence, shared by
every document on the stream — so one job's positions are legitimately 11, then 47, then 93 as other
documents move between them. The client holds one per document and asks only
`position <= getPosition(docKey)`, which recognises a redelivery and nothing else. A delta with a hole
in front of it applies cleanly and leaves the document quietly wrong.

#### The revision is what proves contiguity

`_meta.revision` is `$inc`-ed by exactly one on every job write, per document. So a delta carries **two
revisions**: the one it produces, and the one it applies onto. The client holds the revision of the
document it has, and the rule is three lines:

| The delta applies onto | What the client does |
|---|---|
| the revision it holds | set each change at its path |
| a **later** revision than it holds | a message was lost — reload that document |
| an **earlier** one | already applied; drop, as a redelivery is dropped today |

**Reload rather than buffer.** Buffering a delta in case the missing one is still in flight would only
help if arrival order were not guaranteed, and for one document it is. A mismatch therefore means a
genuine loss, and reloading through it is what this project already does with a gap —
[shared-planners](../shared-planners/plan.md) § Stage G3 answers a resume by comparing positions and
reloads rather than replaying.

**Two counters, two jobs.** The position orders deliveries and recognises a redelivery; the revision
proves nothing was missed for one document. § Open questions had this the other way round and is
corrected there.

**The revision is the one the update itself wrote**, read from `_meta.revision` in `updatedFields` —
never from the document Mongo looks up after the event, which can already be a later write's. Taken from
the lookup, a delta could name a revision whose fields it did not carry, and the next delivery would be
dropped as already applied. An update that does not write the revision at all — a release step that
`$set`s a field without incrementing, say — therefore carries no delta, and the whole document travels
as it always has.

#### The coalescer has to fold rather than keep the last

The inbound coalescer holds 80ms of deliveries in a `Map` keyed by job id and used to keep only the last
upsert — correct for whole documents, lossy for deltas. It folds a window's deltas in order instead, and
the revision chain is what makes that safe: apply while the revisions run consecutively, and read the job
again where they do not.

#### What it costs the change listener, which is less than it looks

**The delta itself costs no query.** `updatedFields` and `removedFields` come out of the oplog entry
and are already in the change event. The revision comes with them: `$inc` on `_meta.revision` reports
the field in `updatedFields` with its resulting value, so a delta states the revision it produced
without asking Mongo anything.

**Nothing about the stream's setup moves.** `updateDescription` is delivered on every `update` without
being asked for, and `MatchPipelineForCollections` is a `$match` on `ns.coll` that projects nothing
away. No option, no pipeline change, no reason to touch resume tokens, the per-group streams or the
primary-only guard. The reconstruction is one branch in the `switch collection` that already decides
what `previousDocument` carries, under `CollectionJobDocuments` alone; every other collection takes the
path it takes today. `insert`, `replace` and `delete` carry no `updateDescription`, so they carry no
delta and the client replaces as it does now.

**`isSchemaMaintenanceOnlyUpdate` becomes load-bearing.** It already parses the same
`updateDescription` to suppress a maintenance-only write, and those writes do not increment the
revision. A maintenance write reaching a client as a delta would therefore carry a revision that had
not moved and read as a gap, costing a reload for nothing. The suppression is why the contiguity rule
above holds, rather than a coincidence beside it. It also means the parse is wanted twice in one
function, so it is lifted above the check and passed down rather than done again.

**The reconstruction may never fail the event.** A path the walker cannot resolve must drop the delta
and publish the full document exactly as today, rather than returning an error. A failed
`processChangeEvent` is logged and the loop continues, so the stream survives — but **that event's
message is lost outright**: the next event's token save moves the resume point past it and nothing
redelivers it. So a malformed path would cost a change its whole delivery, not merely its delta. Best
effort, or nothing.

#### What the breaking half actually removes, and what it costs

The saving is not the payload. `SetFullDocument(options.UpdateLookup)` makes Mongo run a **post-image
lookup per update event**, and that is what fills the full document. Dropping the full document drops
that query, which is worth more than the bytes.

It is not a payload edit, though. Three things read the full document on every update:

| Read from the document today | What the breaking half needs |
|---|---|
| The owner, for routing — `ownerFromDocument` | `OwnerFromDocumentID` already answers it and already runs, but only when the operation is a `delete` with no preimage. It has to run for every operation type. Load-bearing: a wrong owner delivers a planner's document to the wrong subscribers or to nobody |
| `sourceClientID` / `sourceSessionID`, which stop the change echoing to the client that caused it | Already solved. `ApplyMetaSessionClient` sets each only when the caller passes a non-empty value and both are `omitempty`, so a write from a caller sending no websocket client id — the header is optional — stores no `clientID`. `ShouldSuppressRecipient` is written for that: with no client id it falls back to suppressing the whole session, so the author is still not told what it just did, at the cost of the author's other tabs. The lock gate makes the session id non-empty wherever Redis-backed locking is configured |
| `accountID` | Read from the document root for groups and from `_meta` otherwise |

**And the stream is shared.** `job_documents` is in the `planner` group with `jobs`, `job_groups` and
`planner_settings`, which is one `Watch` and one set of options — so the lookup cannot be dropped for
jobs alone unless all four are delta-delivered, which is § Open questions' *which documents*, or
`job_documents` is given a group of its own. `CollectionGroups()` says the second is a one-line change:
a collection in a group of its own is isolated from the others. Accounts are already on a separate
stream, so nothing there is affected either way.

#### The message shape, and where the derivation is proved

Both shapes gain the same four fields — `changed`, `removed`, `revision`, `appliesTo` — and both
additively.

`changed` is a list rather than a document because of what it has to say — § Whose vocabulary travels on
the wire has why — so it no longer mirrors the write envelope's partial `document`, and only `removed`
is shared between the two directions.

- **The NATS message** (`ChangeStreamMessage`) is cross-process and JetStream-persisted, so a rolling
  deploy pairs an old producer with a new consumer and the reverse. Safe in both directions: the
  fields are `omitempty` / `omitzero` and nothing requires them.
- **The client frame** gains them for free. `ClientPayload` strips only `routingOnlyFields` and copies
  the rest, and the SPA reads each field defensively, so the server half ships without a client change.
- **The family vocabulary does not move.** This stays the `document` family with the same `collection`
  and `operationType`, so [realtime-messages/kinds.json](../../../testing/fixtures/realtime-messages/kinds.json)
  and the Go and vitest tests reading it are untouched.

**The proof belongs in a test that already exists.**
`services/websocket/server/outgoinglogic/client_shape_parity_test.go` was written to assert that a name
derived from a stored bson key lands on the model's json tag, because a client reads the same document
over two transports and both must name an entity id identically. That is exactly what this
reconstruction depends on. It is extended to drive the delta through the same assertion rather than
only the full document — otherwise the one load-bearing assumption is proved for the old shape and not
the new one. It runs without Mongo, so it is also the earliest signal that a model field has been added
whose ref rewrite does not land on its tag.

#### Where it starts

Four slices, and the first three need no database.

1. **`models.JobJSONChanges` and `models.JobJSONRemoved`. Landed**, beside `JobSetPaths` in
   `services/shared/models/job_write.go`, wired to nothing. The field index is built once per type and
   tag and read by both directions, which collapsed the embedded-struct recursion the two lookups each
   had, and `bsonName` with it. `EntityRefIDKey` moved here from the websocket service so the
   ref-suffix rule has one implementation — [overlay.md](./overlay.md) § Slice 1 says what it answers
   for.
2. **Extend the parity test** to the delta, per § The message shape. **Landed** — one job now goes
   down both transports and the same two rows are compared, the whole document against the API
   response and a delta against it, so the ref rewrite is proved for the new shape as well as the
   old.
3. **Wire it into the watcher. Landed** — the parse lifted above the suppression check and passed to
   it, one branch for job documents on an update, the four message fields, and a delta that answers
   false rather than failing the event. [overlay.md](./overlay.md) § Slice 3 says what decides whether
   one is carried.
4. **The proof across both sides. Written; the live half cannot run without the stack.** Three pieces,
   in the structures this repo already has for each —
   [overlay.md](./overlay.md) § Slice 4 says what each one is for and what is still not covered.
   [overlay.md](./overlay.md) § What proves this works is explicit that a unit test does not stand in
   for the live one.

That is the whole server half, additive and consumed by nothing.

5. **The loop, as far as delivery reaches. Landed and passing against a stack** — tabs on one planner and a tab in another, one real save through the real endpoint, and
   the delta reaching the tabs that did not make it while the one that did is told nothing. Every
   planner kind travels the same path, so the loop runs over a list of owners; the run carries the
   stack's `ENTITY_ID_KEY` and has passed for an account, a corporation and an alliance planner —
   [overlay.md](./overlay.md) § Slice 5.
6. **The client's apply path. Landed** — the delta read at the receiving edge, the verdict taken
   against the revision the held document already carries, the coalescer folding a window's deltas in
   order, and a gap answered by reading the job again.
   [overlay.md](./overlay.md) § Slice 6 says what each part does.
7. **The replay that closes the loop. Landed and passing on a capture from the path envelope** — the
   live test records what each connected client was
   actually sent, and a vitest test drives those frames through the SPA's own handlers and asserts the
   applied document is the one the server stored, for all three planner kinds.
   [overlay.md](./overlay.md) § Slice 7 says how the capture is made and what it is not.

**`go fix` in this stage's scope:** `./shared/models/...` and `./websocket/server/outgoinglogic/...`
report one suggestion, in `job_test.go`, which merges two statements into a composite literal. It is
not a modernisation and the file is not in this stage's touch surface, so it is left. Named here so a
later scan coming back non-empty is not mistaken for new debt.

#### The loop a change has to survive, and the test that follows it

Every leg of a save already has tests, and **each one builds the message it works on**. That is exactly
how a shape drifts in the middle while every test stays green — the failure this project was started
by. So the coverage that decides whether this stage is finished is one test following **one** change
the whole way:

| Leg | What it has to show |
|-----|---------------------|
| The save | The envelope the SPA builds, sent through the real endpoint, against a real database |
| The write | Only the named fields and rows move, and the revision moves by one |
| The notification | The change stream produces the delta, and the delta is what is published |
| **Who receives it** | Another member of the planner receives it; another tab of the saver receives it; the tab that made the save does not |
| **How it is applied** | Each client that received it ends holding the document a fresh read would give |

The last two rows are the point: the live loop test covers who receives it, and the replay of what it
records covers how it is applied. A fixture both sides read
proves the shape they agree on; it does not prove a change survives the journey, and §§ Slice 4's own
limits say so.

**The seam, because no runner spans both languages.** The live Go test drives the real save and
**records the frames each connected client actually received**; a vitest test replays those recorded
frames through the real SPA handlers and asserts the store ends up holding what the server stored.
Regenerating the capture is what keeps the halves honest — a hand-written frame would put the invented
input back in the middle.

**What it is built from**, all of which exists: [`testing/mongolive`](../../../testing/mongolive/) for a
real database, the live handler tests under
[`services/api/v1endpoints/jobdocuments/`](../../../services/api/v1endpoints/jobdocuments/) for a real
save, and a real websocket client — [`testing/ws_soak/lib`](../../../testing/ws_soak/lib/) proves the
connection works but keeps its dial helpers unexported, so a small client package under `testing/` is
what the loop test opens its connections with.

**It splits across two slices.** The legs up to *who receives it* are buildable now, because the delta
already flows: two clients on one owner, one save, and an assertion about what each one got, including
the suppression. *How it is applied* waits on the client slice and lands with it — that slice is not
finished until the replay asserts the applied document matches the stored one, which is § Done when's
own line about rebuilding from an ordered stream.

#### What this owes before it is built

**The payload figure is unmeasured**, and this plan does not quote one. It is measured against a
restored copy of live rather than dev — a job's stored size varies with how many setups, materials and
ESI rows it carries, and a dev document is not that shape. With the stack up:

```
db.job_documents.aggregate([
  { $project: { size: { $bsonSize: "$$ROOT" } } },
  { $group: { _id: null, avg: { $avg: "$size" }, max: { $max: "$size" }, n: { $sum: 1 } } },
])
```

It decides nothing about whether the stage is built — the § Done when line stands on its own — but it
decides whether removing the full document afterwards is worth the breaking change.


### Stage F — Every multi-job write is one change

Stage D made a close one change. The other writes that touch several jobs at once still go as several
requests built from local copies, and a shared planner is where that breaks. Found by an investigation
of merge and of the lock under shared planners; the evidence is in the overlay once built.

**Merge** (`mergeJobs.js`) saves the replacement and the relinked parents and children in one request,
then deletes the old jobs in a second. It takes no lock, the delete has no revision check, and a partly
refused save throws "No jobs were removed" after part of it landed — leaving the replacement beside the
old jobs with one-sided links. Neighbours not loaded locally keep links to deleted ids; the group's
membership is recomputed from loaded jobs only, dropping members this tab never fetched; purchases,
extra costs, invention entries and linked ESI records on the old jobs are discarded without a word; and the account's ESI links are
removed locally and never saved. **Multi-delete** (`deleteMultipleJobs.js`) and **archive**
(`archiveJobButton.jsx`, `archiveGroupJobs.js`) have the same save-then-delete shape.

**The rework:**

- **Deletes join one change.** `JobWriteBatch` gains `deletes`, each naming a job and the revision it
  was read at. Inside `WriteJobChange`'s transaction a delete is conditional on that revision, stamped
  with the session and client first through `MetaStamp`, as `DeleteManyAfterStampingMeta` does; a delete that matches
  nothing refuses the change, and `staleInChange` names it moved or gone. The lock gate covers written
  and deleted ids together. Wire: additive in shape, but an old server would ignore `deletes` and write
  the replacement while dropping nothing, so it ships with the server half — a hard cutover.
- **Merge, multi-delete and archive send one change.** Before building, the SPA reads back the selected
  jobs and every parent and child they name, so links and revisions are complete and current rather
  than whatever this tab happened to load. The tree logic stays in the SPA; the server owns only
  atomicity, the lock and the revisions. A refusal restores the touched jobs from the server, as a
  refused close does.
- **The group and the account follow the change.** As for a close: the group write and the ESI links
  are written only once the change lands, and job-groups' move of membership onto `job.groupID`
  deletes merge's group recompute.
- **Nothing a lock refuses is silent.** About a dozen callers ignore what `saveJobsViaApi` answers — the
  price entry dialogue, mass build, drag and drop, templates, `closeGroup` and others — so a write
  refused by another member's lock stays queued with no retry and no word, while the screen shows it
  done. Each says which jobs were held and offers to ask for them, or puts the store back.

**Leftovers from Stage D, taken here:** the group page and the Edit Job page still take the group's
lock, so only one member works a group page at a time — the group lock should be taken only to change
the group's own document; and archived-job restore still gates a grouped job on its group rather than
on itself (`archivedjobs/restoreHandlers.go`).

**Decided:**

1. **A refused merge writes nothing and keeps the selection.** A panel lists what moved — jobs edited,
   gone or held, naming no member — and offers to merge again from the current jobs.
2. **Merge warns before discarding records.** When any selected job carries purchases, extra costs,
   invention entries or linked ESI records, the merge confirmation lists what will be discarded before the reader confirms.
3. **Merge takes no locks.** The server refuses the whole change when any job it touches is held by
   another session, and pressing Merge first checks the selection against lock state so held jobs are
   flagged before anything is sent. Multi-delete and archive follow the same rule.

## Wire compatibility

| Surface | Change |
|---------|--------|
| Job write endpoint | **breaking** at Stage C — an envelope of a partial document and a list of removed row paths replaces a body of a whole document, with no dual-shape period. API and SPA deploy together for this change; neither half rolls back alone |
| Document revision field | **already landed**, ahead of this project. `_meta.revision` is on every stored document and every job write increments it. Nothing here adds it |
| Job write request body | additive at Stage A — a body may carry the revision it read. Absent means unversioned, and an unversioned write is accepted as it is today, which is what lets the server be converted before the client |
| Job write envelope | **breaking**, in the Stage C cutover — `includedInGroup` and `groupID` are removed; they fed only the group holder's exemption. Unreleased, so both sides ship together
| Job write response | **breaking** at Stage A — a per-document result replaces a whole-batch 409. The 409 shape stays available for a client that has not moved, but a mixed outcome has no representation in it |
| Realtime document payload | additive at Stage E — a message carries each path the update set with its value, the removed row paths, and the pair of revisions it moves between, beside the full document a client may still take. Removing the full document is the breaking half, is where the payload saving is, and is separable |
| Close request | additive at Stage D — a batch may be marked as one change, which the server writes in one transaction or refuses whole. An unmarked batch is written per document as today |
| Deletes inside one change | **breaking in effect** at Stage F — `deletes` on `JobWriteBatch` is additive in shape, but a server that ignored it would write a merge's replacement and drop nothing, so it ships with the server half |
| Archive request | **breaking in effect** at Stage F — `PUT /api/v1/archived-jobs` now removes each job from the planner in the same transaction, checked against the revision its `_meta` carries, and has no 100-job cap. Same shape; an old SPA's follow-up delete finds nothing, a new SPA on an old server would leave the jobs on the planner, so both ship together |
| `DELETE /api/v1/job-documents` | **removed** at Stage F — every removal rides a change or an archive; nothing in the SPA calls it |
| Document lock enforcement | **narrowed** at Stage D — a job's lock is consulted for that job alone; a group's holder is no longer exempt from a member job's lock. Not a wire shape |
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
  nothing and shows the reader what changed, so they choose which of their edits to take onto it.

## Open questions

- ~~**Whether the lock gate should trust what a request says about a job's group.**~~ **Settled by
  removal.** The gate stopped exempting a group's holder at Stage D, so nothing reads a job's group
  from the request any more and the two envelope fields went with it.
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

  A counter rather than Stage G's position token because they answer different questions: the token
  orders deliveries within an owner and says *is this one I have already seen*, the counter is
  per-document and says *is this still the document I read*. A conditional write needs the second.

  **For delta delivery the counter answers both.** The token is the global JetStream stream sequence,
  so one document's tokens are not contiguous — they step over every other document's — and a client
  cannot tell a legitimate jump from a lost message. The revision is `$inc`-ed by one per write on that
  document, so it is the only thing on the wire that can prove nothing was missed. § Stage E carries
  the rule that follows from it.

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
- ~~**What the group lock covers once it stops covering member jobs.**~~ **Settled: the group's own
  document.** Membership, name and ordering are guarded by it; a member job by its own lock. Whether
  reordering a group while another member edits a job in it should be a conflict is left to
  [job-groups](../job-groups/plan.md), which moves membership onto the job.
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
| D — the lock stops being broad | **Landed.** A held job no longer costs the batch; a close is sent as one change and written in one transaction or refused whole, with the group and ESI links written only after it lands; a refused close keeps the editor open on the saved jobs and opens a review of the reader's changes, and an incoming save mid-edit keeps the reader's value wherever the two clash and says so. **The lock covers one job**: a group's lock covers its own document only, the cascade and the group holder's exemption are gone, and a job's own lock still refuses other sessions' saves — advisory was weighed and not taken. See [overlay.md](./overlay.md) § Stage D |
| E — delta delivery and client apply | **Landed, end to end.** A job document's update publishes each path it set, with its value, in the client's names, the paths it cleared, and the pair of revisions it moves between, beside the whole document a client may still take. The envelope is pinned for both languages by [job-delta.json](../../../testing/fixtures/realtime-messages/job-delta.json), and a live test drives a real write through a real change stream. A client applies one onto the document it holds, folding a window's deltas in order and reading the job again where they do not join up. One save is followed the whole way: through the real endpoint, a real change stream, the stack's own websocket service, to the tabs that receive it and the tab that must not — and then through the SPA's handlers, where the applied document has to be the one the server stored. § The loop a change has to survive. § Where it starts has the slices, [overlay.md](./overlay.md) §§ Slice 1 to Slice 8 what runs. Behind Stage C here, because a delta is meaningless until the write that produces it is field-scoped; its shared-planners dependency is discharged and `jobArray` is plain since [job-document-drafts](../job-document-drafts/plan.md) Stage 5. The design is settled in § Stage E: the delivery carries each path the update set with its value and the paths it cleared, and the pair of `_meta.revision` values it moves between, because the delivery position is a global sequence and cannot prove a document missed nothing. Owed before building: the payload figure, measured against a restored copy of live |
| F — every multi-job write is one change | **In progress.** Removals ride a change; merge, multi-delete and archive each land whole or not at all; the job-documents delete endpoint is gone; a save another member's lock refused is said and put back; restore is checked per job — see [overlay.md](./overlay.md) § Stage F. Still to come: the group lock only for the group's own document, which needs a decision on how a group write is protected. Decisions settled — § Stage F |

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

**Stage E has landed, both halves** — § Stage E settles the envelope, the gap check and what the
coalescer has to do; `JobJSONChanges` / `JobJSONRemoved` turn a stored delta into the
client's names, the parity test proves that derivation over both transports, and the watcher publishes
the delta beside the whole document; the SPA applies it onto the job it holds and reads the job again
on a gap. The live change-stream and loop tests pass against the stack on the path
envelope, and the replay passes on the capture that run recorded. What the stage still owes is
elsewhere: the account key that carries a personal planner's jobs
into every other planner is [shared-planners](../shared-planners/plan.md) § Stage G's G6, and removing
the whole document from the delivery — where the payload saving is — is the separable breaking half in
§ Wire compatibility. What the stage is worth is narrower than it looks: the product problem is Stage C's, and the payload
saving belongs to the separable breaking half that removes the full document. Schedule it for the
§ Done when line about rebuilding from an ordered stream.

**Stage C does not need that project's slice 5.** Slice 5 converts the panels to read from the draft,
which narrows re-rendering; the log is complete without it, because every change already goes through
a command and the job on screen cannot be changed any other way.

**Stage D has landed.** A close is one change, written in one transaction or refused whole; a refused
close keeps the editor open on a review of the reader's changes; and the lock covers one job — a
group's lock its own document, a job's lock that job. Going advisory was weighed and not taken, so the
one-writer rule [job-document-drafts](../job-document-drafts/plan.md) is built on stands.

**Stage E was always behind Stage C**, because a delta is meaningless until the write producing it is
field-scoped.

**What remains in [job-document-drafts](../job-document-drafts/plan.md)** that touches this project is
its Stage 2 reaching the live release window, which gates deploying Stage C here.

**[job-groups](../job-groups/plan.md) no longer waits on this project.** Its dependency table names
Stage A and Stage D's removal of the group lease over member jobs; both have landed, and the membership
diff in `BulkUpsertGroups` it planned to delete is already gone. Its own plan still lists the
dependency as outstanding until its owner updates it.

**Stage F is next**: merge, multi-delete and archive become one change, and no write a lock refuses
goes unsaid; its decisions are settled (§ Stage F).

**What else stands between this project and promotion** is the cutover, not code: Stage C deploys with
[job-document-drafts](../job-document-drafts/plan.md) Stage 2 in the release window; the payload figure
§ Stage E owes, measured on a restored copy of live; and a live figure for how many whole jobs one
close carries against the 1 MB body limit — [overlay.md](./overlay.md) § A save marked as one change.

**What this project supplies to others, and the caveat on it.** Stage A gives a document version and
a write that refuses a stale base. Both are built and proved against a real database, and on this branch every write of a stored job carries
the revision it was read at. **Neither is operating in production** until Stage C deploys: the SPA running there
sends no revision, so every live write still takes the unconditional path. Saying Stage A has landed
without that caveat reads as protection that does not exist.

**The lock gate has a live test.** A lock another session really holds, taken through the lock
service against the stack's Redis, makes the handler drop that job and write the rest, and a group's holder is refused a member job
another session holds. See [overlay.md](./overlay.md) § What proves this works.
