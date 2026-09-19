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
| The change set a field-scoped write sends | [job-document-drafts](../job-document-drafts/plan.md) Stage 3 | **Not started.** That project holds a job as an untouched base plus an ordered log of what the player changed. The log *is* what Stage C sends: without it the client has nothing field-scoped to offer. Stage C is blocked on it |
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

**Blocked on [job-document-drafts](../job-document-drafts/plan.md) Stage 3**, which supplies the
change set this stage sends. That project's § What depends on this states it: *"The log is the change
set that stage sends; without it the client has nothing field-scoped to offer."*

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
| Job write endpoint | **breaking** at Stage C — a body of changed paths replaces a body of a whole document, with no dual-shape period. API and SPA deploy together for this change; neither half rolls back alone |
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
| A — a write that checks the revision | **Landed, server side, and proved against a real database.** A job carrying a revision is written conditionally on it as its own `UpdateOne`, whose match is the answer; a job carrying none is batched and upserted as before, so the change is additive. The refusal is answered per document as a 409 `revision_conflict` carrying `saved` and `rejected[]`. The first build batched the conditional writes and inferred the outcome from a later read, which passed every unit test and reported every refused write as applied — see § Stage A. The client half is Stage B. See [overlay.md](./overlay.md) § Stage A |
| B — a refused write is an outcome the UI handles | **Landed.** All three defects closed: the client recognises a `revision_conflict` beside the lock conflict it already handled, drops the refused write from the pending queue rather than replaying it forever, and warns the user; `persistJobDocumentsToApi` answers an outcome that `saveJobsViaApi` passes through, so `closeActiveJob` stops reporting a refused write as saved; and the client's own gate warns instead of discarding edits silently — in `closeGroup` as well as `closeActiveJob`, which carried the same defect for the group lock. Stage A's ordering constraint is discharged. See [overlay.md](./overlay.md) § Stage B |
| C — field-scoped writes | **Not started, and blocked on [job-document-drafts](../job-document-drafts/plan.md) Stage 3**, which supplies the change set this stage sends. Two decisions stand — the body is replaced outright rather than widened, and the slice is jobs only — and two are superseded by that project: it supplies the change set rather than a baseline diff, and its Stage 2 keys the row collections so a path into a row is stable. See § Stage C |
| D — the lock stops being broad | **Part landed: the batch refusal is per document.** A held job is dropped from the batch and the rest written, answered as a 409 carrying `saved` and every held document; the client keeps only the held ids queued. The other two removals are **not safe yet** — they rest on conditional writes, and no write is conditional until the SPA carries the revision, which is Stage C. Relaxing the lock now would remove the only protection operating. See [overlay.md](./overlay.md) § Stage D |
| E — delta delivery and client apply | Not started. Its shared-planners dependency is discharged — Stage G landed and closed — but it is blocked behind Stage C here, because a delta is meaningless until the write that produces it is field-scoped, and Stage C is itself blocked on [job-document-drafts](../job-document-drafts/plan.md) |

## Recommended pickup order

**Stages A and B have landed, and Stage D's batch refusal with them.** A stale write is refused per
document and answered with what the client must reconcile against; the client recognises that
refusal, drops it rather than retrying forever, and tells the user; and a job another session holds no
longer costs the rest of the batch. What was silent write loss is a visible refusal end to end.

**Nothing in this project is actionable next.** Every remaining stage is blocked, and the blockers are
worth stating precisely because two of them are not obvious from the stage list:

**Stage C is blocked on another project.** [job-document-drafts](../job-document-drafts/plan.md)
Stage 3 supplies the change set a field-scoped write sends, and its Stage 2 keys the job's row
collections so a path into a row survives another member's insert. Building Stage C first would mean a
diff beside the log that project is adding, and index-based paths into arrays it is about to key —
two mechanisms to throw away. That project's own plan states the dependency; this one had not, which
is how Stage C came to be designed twice.

**Stage D's remaining removals are blocked behind Stage C**, and the plan's own ordering argument
hides why. The relaxation rests on a version check. The check is built and **inert**: the SPA's `Job`
class drops `_meta.revision`, so no production write is conditional. Until Stage C carries it, the
document lock is the only thing preventing two members overwriting each other — relaxing it would
remove the only protection operating rather than trade it for another.

**Stage E was always behind Stage C**, because a delta is meaningless until the write producing it is
field-scoped.

**So the next work is in [job-document-drafts](../job-document-drafts/plan.md).** Its Stage 2 — the
reshape that keys the row collections — is now built, wired into the release as a required step, and
proved against a restored copy of live; what remains there is the SPA and API reading the new shape.
Stage 3, the one Stage C here actually waits on, has not started.

**[job-groups](../job-groups/plan.md) waits on this project, and half its wait is over.** Its
dependency table names Stage A — landed — and Stage D's removal of the group lease over member jobs,
which is not, and which § Stage D explains cannot be taken until conditional writes are live. So that
project stays blocked, on the second of the two rather than both. Its own plan still reads as though
both are outstanding; the dependency is stated there rather than here, which is the same one-way
linking that let Stage C be designed twice.

**One gap is owed rather than blocked.** The Redis lock gate has no live test: nothing proves a lock
genuinely held by another session makes the handler drop that job and write the rest. `testing/redislive`
exists and this project does not use it. It belongs with Stage D's remaining work — see
[overlay.md](./overlay.md) § What proves this works.
