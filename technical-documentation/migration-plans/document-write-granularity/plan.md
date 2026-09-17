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
one's**, and they may still move. Anything here that depends on them is written as an assumption to
re-verify rather than as settled fact — when Stage G changes, this plan is updated in the same pass.

| Inherited | Where it is decided | What this project assumes |
|-----------|---------------------|---------------------------|
| Per-owner delivery ordering | Stage G § Ordering is a construction, not a token | That ordering is solved before deltas land; a delta stream is worth less than nothing if applied out of order |
| The position token on the wire | Stage G | That a client can say where it is, so a gap in a delta stream is detectable rather than silent |
| The owner-scoped baseline | Stage G | That a client can fetch a document set and a position together, which is what a delta stream is applied *onto*. The request that fetches it already names its planner — Stage E sends the owner on every scoped read and carries it in the cache key — so what Stage G owes is the endpoint and the position, not the addressing |
| `session_resume` answering from position | Stage G | That a reconnecting client is told what it missed, rather than asserting it missed nothing |
| The lock namespaced on the owner key | Stage H | That a lock exists between two members at all. Stage D here relaxes the lock's *breadth*; relaxing a lock that does not yet hold between members would be relaxing nothing |

The dependency runs one way. Shared planners does not wait on this project: its obligation is to stop
losing writes *silently*, which the position token achieves on its own. This project decides whether
the loss can be avoided rather than merely seen.

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

### Stage A — A version on the document, and a write that checks it

The conditional write above. Establishes that a write can be refused, and gives every later stage a
version to reason about.

Two things make this the first stage rather than the obvious one. It is what every relaxation in Stage
D rests on, per § Why the lock is as broad as it is. And it is the smallest change that converts silent
loss into something a client is told about, which is the property § What a conflicting write is
answered with identifies as the one that actually matters.

The refusal must be **per document**, not per request. A batch in which one job moved should write the
rest and answer with the one that did not — the current all-or-nothing 409 is a consequence of
whole-document writes, and reproducing it here would carry the defect forward into the mechanism meant
to fix it.

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

### Stage C — Field-scoped writes

Dirty tracking through the SPA persist path, and an API that sets only the paths it was given. This is
where the work is: the persist debounce and the outbound coalescer both assume a whole document today.

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
Depends on the ordering token from shared-planners Stage G being in place, per § What this project
inherits.

## Wire compatibility

| Surface | Change |
|---------|--------|
| Job write endpoint | **migrate-required** at Stage C — a body of changed paths is not a body of a whole document. Additive if the endpoint accepts both while the client is converted |
| Document version field | additive at Stage A — absent means unversioned, and an unversioned write is accepted as it is today |
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
- ~~**Where the counter lives.**~~ **Settled provisionally, and seeded already.** `_meta.revision` is a
  per-document counter, incremented by every write. It was taken now rather than at Stage A because
  [shared-planners](../shared-planners/plan.md) § Every owner-scoped document id carries its owner
  rewrites every one of these documents in the cutover window, and seeding a field costs nothing in a
  pass that is already rewriting the row — where doing it later means a second walk or a long tail of
  uncounted documents the conditional write must special-case forever. It is named for what it counts
  rather than `version`, which every model already carries as the shape of the document, and a document
  is created holding it so that "absent" is never a state the conditional write has to answer for.

  A counter rather than Stage G's position token because they answer different questions: the token is
  per-owner and says *did I miss anything*, the counter is per-document and says *is this still the
  document I read*. A conditional write needs the second. Nothing reads the field yet, so Stage A may
  still change it — but it would be changing a value that already exists on every row.
- **What the client does with a refusal.** Retry against the current document, surface a conflict, or
  merge — a product decision this plan records rather than settles. It decides what Stage B builds, so
  it is the one of these three that blocks work rather than shaping it.
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
| A — a version and a conditional write | Not started |
| B — a refused write is an outcome the UI handles | Not started. Independent of the rest of this project — all three defects are live on a personal account today. Blocked on the refusal question in § Open questions, which decides what it builds |
| C — field-scoped writes | Not started |
| D — the lock stops being broad | Not started. Rests on Stage A; must not precede it. Assumes the lock is namespaced on the owner key, which is [shared-planners](../shared-planners/plan.md) § Stage H |
| E — delta delivery and client apply | Not started. Depends on shared-planners Stage G |
