# Document write granularity — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project moves a job save from "replace the whole document" to "write what changed, checked against
the revision it was read at", makes a refusal something the reader sees, narrows the document lock to
one job, and delivers a change to other clients as a delta.

Stages A to E are built and every status the plan gives them holds up against the code. None of it is
running in production: `Public` still decodes a batch of whole jobs, so the whole project reaches users
in the one release window, together with the job reshape it depends on.

Stage F is the only stage with code left to write. Its first two slices — removals inside one change,
and merge as one change — exist **only as uncommitted working-tree changes**, and the plan's status row
for it was moved from "Not started" to "In progress" in the same uncommitted state.

Two things need attention most. Archive cannot become "one change" with the mechanism as built,
because `WriteJobChange` writes one collection and an archive writes two; the plan does not say what
archive becomes. And the plan still carries prose, a wire-compatibility row and a `contents.md` line
that describe the advisory lock that was weighed and not taken.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---------------|-----------|----------------|----------|---------|
| Phase 1 — project docs | Complete | Folder, `contents.md`, `plan.md`, `overlay.md`, and the row in the section task map | [`../contents.md`](../contents.md) line 23 | confirmed |
| A — a write that checks the revision | Landed server side, proved against a real database; not operating in production | A job carrying a revision is its own `UpdateOne` filtered on `_meta.revision`, never upserted; a job carrying none is batched and upserted; a refusal is a per-document 409 | `services/shared/mongo/jobs_put.go` (`BulkUpsertJobs`, `applyConditionalWrites`, `conditionalJobFilter`, `describeConflict`); `services/api/helper/revision_http.go` (`RespondRevisionConflictJSON`); `services/shared/mongo/live_jobs_conditional_write_test.go`; `services/api/v1endpoints/jobdocuments/live_revision_conflict_test.go` | confirmed |
| B — a refused write is an outcome the UI handles | Landed | The 409 is recognised, the refused ids leave the queue, the reader is warned, and every save answers an outcome | `frontend/src/Functions/JobDocuments/revisionConflict.js`; `frontend/src/Functions/Endpoints/refusalBody.js` (`parseRefusalBody`); `frontend/src/Functions/JobDocuments/persistJobDocumentsToApi.js` (`"saved" \| "locked" \| "conflict" \| "failed"`); `frontend/src/Functions/DocumentLock/canPersistDocumentEditClose.js`; `testing/fixtures/write-conflict/body.json` | confirmed |
| C — field-scoped writes | Landed, proved end to end, not deployed | The SPA sends one envelope per job; the server derives `$set` and `$unset` paths from `models.Job`; a field write is conditional and never upserts | `frontend/src/Functions/JobDocuments/writeBody.js`, `jobWriteEnvelope.js`; `services/shared/models/job_write.go` (`JobWriteBody`, `JobSetPaths`, `JobUnsetPaths`); `services/shared/mongo/jobs_put_fields.go` (`SetFieldsWithRevision`, `BulkUpsertJobFields`); `services/api/v1endpoints/jobdocuments/jobWrite.go`, `putHandler.go`; `testing/fixtures/job-write/body.json` read by `job_write_corpus_test.go` and `jobWrite.corpus.test.js`; `live_field_write_test.go`, `live_jobs_field_write_test.go`. `Public`'s handler still decodes `Jobs []models.Job` | confirmed |
| D — the lock stops being broad | Landed; advisory weighed and not taken | A held job is dropped from an unmarked batch; a batch marked `oneChange` is one transaction or nothing; a refused close keeps the editor open on a review; the lock gate asks about each job alone | `putHandler.go` (`dropHeldWrites`, `refusalFor`); `services/shared/mongo/transaction.go` (`InTransaction`), `retry.go` (the `inTransaction` step-aside), `jobs_put_change.go` (`WriteJobChange`); `frontend/src/Functions/JobDocuments/saveJobsViaApi.js` (`saveJobsAsOneChange`, `restoreSavedJobs`); `frontend/src/Functions/JobPlanner/closeActiveJob.js` (`"kept-open"`); `frontend/src/Components/Edit Job/Edit Job Hooks/jobDraftReview.js` (`reviewChanges`), `jobDraftStore.js` (`reviewOf`, `settleChangeReview`, `keepHeld`, `dropHeld`); `ChangeReviewDialogue.jsx`, `IncomingSaveNotice.jsx`; `services/shared/core/documentlock/holder_require.go` (`CollectLockHeldElsewhereRejects` takes an owner and ids, no group exemption). `JobGroupBypass`, `resolveDocumentLockApiTarget`, `document_lock_group_cascade`, `cascade.go` and `cascade_pipeline.go` appear nowhere in `services/` or `frontend/src`. `live_conflict_loop_test.go` and `changeReview.conflictLoop.replay.test.jsx` follow the conflict end to end | confirmed |
| E — delta delivery and client apply | Landed end to end; payload figure owed | A job update publishes `changed`, `removed`, `revision`, `appliesTo` beside the whole document; the SPA folds a window's deltas and re-reads on a gap | `services/core/changestream/job_delta.go` (`jobDeltaFor`), `watcher.go` (`ChangeStreamMessage`); `services/shared/models/job_write.go` (`JobJSONChanges`, `JobJSONRemoved`, `EntityRefIDKey`); `frontend/src/Functions/JobDocuments/jobDelta.js` (`deltaFromMessage`, `deltaVerdict`, `applyJobDelta`), `inboundJobDocuments.js`; `frontend/src/WebSocket/handlers/documentMessage.js`; `client_shape_parity_test.go`, `live_job_delta_test.go`, `live_full_loop_test.go`, `documentMessage.replay.test.js`; `testing/wsclient`; `testing/fixtures/realtime-messages/job-delta.json`, `job-delta-capture.json` | confirmed |
| E — the breaking half (the whole document comes off the delivery) | Separable, not scheduled | Not built: the watcher still asks for the post-image on every update | `services/core/changestream/watcher.go` (`SetFullDocument(options.UpdateLookup)`) | confirmed (open) |
| F — removals inside one change | In progress (working-tree plan); "Not started" at HEAD | Built, uncommitted: a `oneChange` batch carries `deletes`, checked by the lock gate and removed inside the transaction at the revision read | `services/shared/models/job_write.go` (`JobDeleteBody`, `JobWriteBatch.Validate`, `JobIDs`); `jobs_put_change.go` (`JobChange`, `planJobDeletes`, `deleteInChange`); `putHandler.go` (`jobDeletes`); fixture key `changeWithDeletes`; `live_one_change_test.go`, `live_jobs_put_change_test.go` | confirmed, uncommitted |
| F — merge is one change | In progress (working-tree plan) | Built, uncommitted: merge reads its jobs back, stops on a held job, confirms what it discards, sends one change with removals, and shows what moved on a refusal | `frontend/src/Functions/JobPlanner/mergeJobs.js`, `mergeReview.js`; `frontend/src/Events/mergeJobsEvents.js`; `frontend/src/Components/Dialogues/Merge Jobs/MergeJobsDialogue.jsx` mounted in `frontend/src/App.jsx`; `mergeJobs.test.js` | confirmed, uncommitted |
| F — multi-delete and archive as one change | Still to come | Not started: each still saves, then deletes in a second request with no revision | `frontend/src/Functions/JobPlanner/deleteMultipleJobs.js` (lines 173 and 183); `frontend/src/Functions/Groups/archiveGroupJobs.js` (86, 117); `archiveJobButton.jsx` (46, 60); `services/api/v1endpoints/jobdocuments/deleteHandler.go` (lock gate, then `DeleteManyAfterStampingMeta` on ids alone) | confirmed (open) |
| F — no write a lock refuses goes unsaid | Still to come | Not started: eleven call sites await `saveJobsViaApi` and discard what it answers | listed under § Stage F below | confirmed (open) |
| F — the group lock only for the group's own document | Still to come | Not started: the Edit Job page takes the group's lock whenever it was opened from the group | `frontend/src/Components/Edit Job/Edit Job Hooks/useEditJobDocumentLocks.js` (`groupLockReady`); `frontend/src/Components/Groups/groupFrame.jsx` | confirmed (open) |
| F — restore checked per job | Still to come | Not started: a grouped job is gated on its group's lock and only a loose job on its own | `services/api/v1endpoints/archivedjobs/restoreHandlers.go` (`restoreLockRejects`) | confirmed (open) |

No row is overstated. What follows is where the documents disagree with the code or with each other.

**Discrepancies**

1. **Stage F's progress exists only in the working tree.** The files in the two "uncommitted" rows are
   modified or untracked, and so is the status row that describes them. At HEAD the plan says "Not
   started" and the code agrees with it. Until the slice is committed, the plan is honest only for
   someone reading this working tree.
2. **The advisory lock is still described as the direction in three places.** [plan.md](./plan.md)
   § Stage D keeps "Build toward advisory; do not make returning to enforcing expensive" and "Three
   current hazards become harmless at that point" below the line that says it was not taken.
   § Wire compatibility has "Document lock HTTP and websocket surfaces — unchanged … what changes is
   that no write path consults the answer", which contradicts the row above it and the code: the job
   PUT, the job DELETE, the archived-jobs PUT and the restore all call
   `CollectLockHeldElsewhereRejects`. And [contents.md](./contents.md) § Does not own says Stage D
   "changes only whether a write path consults the answer". One event did go
   (`document_lock_group_cascade`), so "keeps its endpoints and events" is not exact either.
3. **The three hazards the advisory lock was to neutralise are therefore still live**, and the plan no
   longer says who has them. Two are now decided work in
   [shared-planners](../shared-planners/plan.md) § Stage K (a 15-minute lease in place of the 24-hour
   one; release five minutes after the holder's connection drops). The third — no gate at all when no
   Redis is configured (`h.locks.Redis != nil` in `putHandler.go`) — is owned by nobody, though the
   revision check no longer depends on Redis, so it now costs a second writer a refusal rather than a
   lost write.
4. **job-groups has already recorded that it is unblocked.** [plan.md](./plan.md) § Recommended pickup
   order says job-groups' "own plan still lists the dependency as outstanding until its owner updates
   it". [job-groups/plan.md](../job-groups/plan.md) § Stage status reads "Not started, and no longer
   blocked", and the section task map says the same.
5. **The overlay's opening paragraph predates Stage C.** [overlay.md](./overlay.md) lines 6 to 10 say
   "Every write is still a whole document", and § Stage E opens with the delta being "not yet
   meaningful … until Stage C lands". Both are false on this branch.
6. **Two status rows carry a stale tail.** Stage A's says "nothing sends a revision yet", which is true
   of `Public` only — on this branch every stored job is written at its revision
   (`jobWriteEnvelope.js`). Stage E's ends "Owed before building: the payload figure", though the stage
   is built; § What this owes before it is built places the figure before the breaking half.
7. **The open question about a linked run's plain corporation id looks answered elsewhere.**
   [plan.md](./plan.md) § Open questions says `LinkedESIJob.CorporationID` "stores the plain id beside
   the ciphered `corporation_ref`". [entity-id-encryption](../entity-id-encryption/plan.md) § What it
   converts says the conversion derives the ref and **clears** the id, and the cipher is handed a
   pointer to it (`services/shared/jobidentity/jobidentity.go`). On that reading the bson tag is how an
   unconverted row is read, not a second stored copy. See § Decisions needed.

## What each remaining step changes

Stages A, B and D need nothing further; what runs is in [overlay.md](./overlay.md) §§ Stage A,
Stage B and Stage D.

### Stage C — the cutover

**Today.** In production the endpoint takes whole jobs. `Public`'s `putHandler.go` decodes:

```go
var reqBody struct {
	Jobs []models.Job `json:"jobs"`
}
```

so a save of one renamed job sends, and replaces, all of it:

```json
{ "jobs": [ { "jobID": "job-fixture", "name": "Rifter build",
              "build": { "materials": { "…": "every row" }, "…": "every field" } } ] }
```

**After.** The envelope `testing/fixtures/job-write/body.json` pins for both sides:

```json
{ "jobs": [ { "jobID": "job-fixture", "revision": 7,
              "document": { "name": "Rifter build",
                            "build": { "materials": { "34": { "volume": 4200 } } } },
              "removed": [["build", "extrasCosts", "e-2"]] } ] }
```

which becomes one conditional update, filtered on `_meta.revision: 7`:

```json
{ "$set":   { "name": "Rifter build", "build.materials.34.volume": 4200, "schemaVersion": 1 },
  "$unset": { "build.extrasCosts.e-2": "" },
  "$inc":   { "_meta.revision": 1 } }
```

(the stamp fields under `_meta` are set path by path and are omitted here). A stale write answers:

```json
{ "error": "revision_conflict", "collection": "job_documents",
  "saved": 2, "savedDocIDs": ["job-1", "job-3"],
  "rejected": [ { "docID": "job-moved",   "expected": 4, "current": 9, "gone": false },
                { "docID": "job-deleted", "expected": 4, "current": 0, "gone": true } ] }
```

**Work.**

1. No code. The API and the SPA ship in one deploy; neither half rolls back alone.
2. The release runs two steps this depends on, both already in
   `services/core/commands/prepare_release.go`: "reshape every job document" (required) and "give
   every document a write counter at `_meta.revision`".
3. Measure, on a restored copy of live, how many whole jobs the largest close carries against the
   request body limit (`DefaultMaxBodySize`, 1 MiB, in `services/api/helper/json.go`). A marked batch
   is exempt from the 100-job limit but not from this one, and the only figure recorded is from dev.

**Wire.** Breaking, as a hard cutover. This project adds no `prepareRelease` step of its own: a
field-scoped write produces the document a whole write would, and the stored-shape change it needs is
[job-document-drafts](../job-document-drafts/plan.md) Stage 2's.

### Stage E — the breaking half: the whole document comes off the delivery

**Today.** Every job update is published with the post-image Mongo looked up for it, and the delta
beside it. `ChangeStreamMessage` in `services/core/changestream/watcher.go`:

```go
Document  map[string]any         `json:"document,omitempty"`
Changed   []models.JobJSONChange `json:"changed,omitempty"`
Removed   [][]string             `json:"removed,omitempty"`
Revision  int64                  `json:"revision,omitzero"`
AppliesTo int64                  `json:"appliesTo,omitzero"`
```

and what a browser is sent for the fixture's update (abridged):

```json
{ "collection": "job_documents", "operationType": "update", "docID": "job-fixture",
  "document": { "…": "the whole job, 3–5 KB on dev" },
  "changed": [ { "path": ["_meta", "revision"], "value": 8 },
               { "path": ["build", "materials", "34", "volume"], "value": 4200 },
               { "path": ["name"], "value": "Rifter build" } ],
  "removed": [["build", "extrasCosts", "e-2"]],
  "revision": 8, "appliesTo": 7 }
```

**After.** The same frame without `document`, and the watcher no longer asking for
`options.UpdateLookup` on that stream. The plan states the three reads that must move
([plan.md](./plan.md) § What the breaking half actually removes) and leaves one thing unspecified:
**what carries a change when `jobDeltaFor` answers false.** Today that case — no revision written,
`truncatedArrays`, an unreadable path, a ref set on its own — falls back to the looked-up document.
With the lookup gone there is no document to fall back to.

**Work.**

1. Measure the payload on a restored copy of live, with the aggregate in
   [plan.md](./plan.md) § What this owes before it is built.
2. Give `job_documents` a collection group of its own in
   `services/core/changestream/collection_groups.go`, so its stream's options can differ from
   `jobs`, `job_groups` and `planner_settings`.
3. Route every operation by `OwnerFromDocumentID`, which today runs only for a `delete` with no
   preimage.
4. Build whatever answers the fallback (see § Decisions needed).
5. In `inboundJobDocuments.js`, every branch that "takes the whole document" — a job the client does
   not hold, a job with unacknowledged writes, a delivery with no delta — becomes a re-read through
   `requestJobDocumentsByIdsFromApi`.
6. Re-pin `job-delta.json`, re-record `job-delta-capture.json` from a live run, and extend
   `live_full_loop_test.go` and `documentMessage.replay.test.js` to a frame with no document.

**Wire.** Breaking on two surfaces: the client frame, and the JetStream-persisted NATS message, which
a rolling deploy pairs old-with-new in both directions. Hard cutover; no stored document changes.

### Stage F — every multi-job write is one change

Removals inside a change and the one-change merge are built; what runs is in
[overlay.md](./overlay.md) § Stage F. One thing is missing from both built slices: **no test follows a
change carrying a removal through delivery.** `live_full_loop_test.go` and `live_conflict_loop_test.go`
send no `deletes`, so nothing shows that a merge's removals reach the other tabs as deletes and are
not echoed to the tab that merged. The four parts below are not started.

#### Multi-delete as one change

**Today.** `deleteMultipleJobs.js` makes four requests from the planner's own copies, and the last one
checks nothing but the lock:

```text
putJobDocumentsBatch(wholeJobWrites(jobsToPersist))   relinked parents and children, per document
putJobGroupsBatch(…)                                   the groups those jobs leave
saveUserAccountDocument()                              the account's ESI links
deleteJobDocumentsFromApi(jobsToDeleteIDs)             DELETE { "jobIDs": ["job-a", "job-b"] }
```

A refusal part-way leaves relinked neighbours pointing at jobs that still exist, or a group and an
account already rewritten for a delete that did not happen.

**After.** One request, in the shape merge already sends (`changeWithDeletes` in the fixture):

```json
{ "jobs": [ { "jobID": "parent-1",
              "document": { "…": "the whole relinked job, its _meta.revision the one read" } } ],
  "deletes": [ { "jobID": "job-a", "revision": 3 }, { "jobID": "job-b", "revision": 9 } ],
  "oneChange": true }
```

with the group and account writes made only once it lands.

**Work.**

1. Lift `readJobsAMergeTouches` out of `mergeJobs.js`, where it is module-private, so multi-delete
   reads its selection and neighbours back through the same function rather than a copy of it.
2. Send through `saveJobsAsOneChange(jobs, undefined, removed)`; move the group and account writes
   after a `"saved"` outcome.
3. On any other outcome, `restoreSavedJobs` and tell the reader — with what, the plan does not say
   (§ Decisions needed).
4. Vitest in `deleteMultipleJobs.test.js`, and the delivery leg noted above.

**Wire.** Additive on the request; the server half is already built. Ships with it.

#### Archive as one change

**Today.** `archiveJobButton.jsx` runs `saveArchivedJobs([job])`, then `markJobsArchivedInGroups`,
then `deleteJobDocumentsFromApi([job.jobID])`, then `saveUserAccountDocument()`.
`archiveGroupJobs.js` runs `saveArchivedJobs(filteredJobs)`, `deleteJobGroupsFromApi([groupID])`, then
the job delete. Two collections are written by two or three requests, and a job edited between the
copy and the delete is archived as it was and deleted as it is.

**After.** The plan says archive "sends one change". It cannot do so through what is built:

```go
func (m *Mongo) WriteJobChange(ctx context.Context, owner models.Owner, accountID string,
	change JobChange, now time.Time, sessionID, wsClientID string) (…) {
	d := m.JobDocuments
```

`WriteJobChange` writes `job_documents` alone, and an archive also inserts into `archived_jobs` and,
for a group, deletes from `job_groups`. The target shape is unspecified — § Decisions needed.

**Work.** Depends on that decision. In every version: the delete carries the revision the archived
copy was read at, and the group write and the account's links follow the change.

**Wire.** Breaking in effect if the archive request changes shape; hard cutover with the SPA.

#### No write a lock refuses goes unsaid

**Today.** `saveJobsViaApi` answers an outcome and eleven callers drop it:

```js
await saveJobsViaApi(jobsToCommit); // "saved" | "locked" | "conflict" | "failed", unread
```

`Components/Job Planner/Hooks/useDnD.jsx`, `Components/Dialogues/Price Entry/PriceEntryDialogueContent.jsx`,
`Components/Groups/New Group/newGroupPage.jsx`, `Functions/GroupTemplates/instantiateGroupTemplate.js`,
`Functions/Shared/passBuildCosts.js`, `Functions/JobPlanner/massBuildMaterials.js`,
`importFitFromClipboard.js`, `buildNextMaterialsTree.js`, `addNewJobsToPlanner.js`,
`Functions/Groups/releaseJobsAfterGroupRemoved.js` and `closeGroup.js`.

On `"locked"`, `persistJobDocumentsToApi` keeps the held ids queued and raises nothing, so the screen
shows the change made and the reader is never told it is waiting on somebody else. (`"conflict"`
already warns once, from the flush.)

**After.** "Each says which jobs were held and offers to ask for them, or puts the store back"
([plan.md](./plan.md) § Stage F). The outcome is a bare string, so a caller cannot name the held jobs
today; the answer has to grow, and the plan does not give the shape:

```js
const { outcome, held } = await saveJobsViaApi(jobsToCommit); // shape not specified by the plan
```

**Work.** Depends on the decision below about where the telling happens. Either way: surface the held
ids that `persistJobDocumentsToApi` already reads off the error (`err.lockHeldDocIDs`), and cover each
caller.

**Wire.** None; client only.

#### The group lock only for the group's own document, and restore checked per job

**Today.** The Edit Job page takes two locks when it was opened from a group
(`useEditJobDocumentLocks.js`), because a close still writes the group document; the group page takes
the group's lock for as long as it is open (`groupFrame.jsx`). So one member works a group at a time.
Restore gates a grouped job on its group, in `restoreLockRejects`:

```go
groupIDs, _ := groupJobsByGroupID(jobs)
if len(groupIDs) > 0 {
	rejects, err := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, owner, sessionID,
		eipmongo.CollectionJobGroups, groupIDs)
	// … a held group refuses the restore
}
// only jobs with no GroupID are then checked against their own lock
```

**After.** The group's lock is taken only by something changing the group's name, ordering or
membership; a restored job is checked against its own lock whether or not it has a group.

**Work.**

1. `restoreLockRejects`: check every job id against `CollectionJobDocuments`, and the group ids only
   where the restore writes the group document. Extend `restorelock_test.go`.
2. Edit Job page: stop taking the group's lock. Safe only once a close no longer writes the group
   document — see § Decisions needed.
3. Group page: take the group's lock when a group-document edit starts rather than on open.

**Wire.** None; lock enforcement narrows, no shape changes.

## Decisions needed

### What an archive becomes

**Question.** Does archiving write `archived_jobs` and remove from `job_documents` in one transaction,
or stay two requests with a revision on the delete?

**Why it is James's call.** The plan says "one change" and the built mechanism covers one collection.
Either answer changes a request shape, and one of them leaves a state the product has to explain.

**Options.**
- *One transaction across both collections.* The archive request names each job and the revision it
  was read at; the server inserts the archive copy, deletes the live job (and the group, for a group
  archive) inside one `InTransaction`, or does none of it. Nothing is ever both archived and live. It
  needs a second writer beside `WriteJobChange`, or `JobChange` widened beyond jobs.
- *Two requests, the second a removal inside a change.* Smallest build: the delete becomes
  `{ deletes: […], oneChange: true }`. A delete refused as stale leaves the job archived **and** live,
  with the archive holding the older copy.
- *Leave archive as it is.* Keeps the unchecked delete this stage exists to remove.

**Recommendation.** The first. The rule Stage D settled for a close — whole or not at all — is the
reason this stage exists, and the second option produces exactly the half-landed state it forbids.

**Blocked until decided.** The archive slice of Stage F, and the fate of the standalone delete below.

### Whether the standalone job delete survives Stage F

**Question.** Once merge, multi-delete and archive remove jobs inside a change, is
`DELETE /api/v1/job-documents` removed?

**Why it is James's call.** It is a public endpoint, and removing one is a breaking change that has to
be flagged rather than discovered.

**Options.**
- *Remove it with its last caller.* `deleteJobDocumentsFromApi` has exactly three call sites, all in
  this stage's scope. Leaves one way to delete a job, and it is the checked one.
- *Keep it.* An unchecked, revision-less delete stays reachable beside the checked one.

**Recommendation.** Remove it, in the slice that moves the last caller.

**Blocked until decided.** Nothing is blocked; it decides whether Stage F ends with dead code.

### How a reader is told a lock refused a write, and which writes become one change instead

**Question.** Is a lock refusal announced once where every job write meets, or by each of the eleven
callers — and do the callers that create jobs beside a write to an existing one become one change?

**Why it is James's call.** The plan gives two behaviours ("offers to ask for them, or puts the store
back") without assigning them, and several of the eleven are themselves multi-job writes that this
stage's title covers but its text does not name.

**Options.**
- *Once, from the flush.* `persistJobDocumentsToApi` already warns once for a revision conflict; do
  the same for a held job, naming the jobs, and leave them queued. One place, no per-caller code, and
  the screen still shows a change that has not been saved.
- *Per caller.* Each restores the store or offers to request the lock. Exact, and eleven
  implementations of one rule.
- *One change for the writes that span linked jobs.* `massBuildMaterials.js` saves the jobs it
  created beside the parents it linked them to (`[...newJobs, ...updatedParents]`), and
  `passBuildCosts.js` saves several existing parents at once; a held parent today leaves the children
  saved and the parent's link to them queued. Sending those through `saveJobsAsOneChange` makes a
  refusal total, as it is for a close.

**Recommendation.** The first for single-job writes (drag and drop, price entry), the third for mass
build and passing build costs, and nothing per caller beyond reading the outcome. Group creation is already
[job-groups](../job-groups/plan.md) § Creation is one request.

**Blocked until decided.** The "nothing a lock refuses is silent" slice, and what a refused
multi-delete shows.

### Who takes the group lock off the Edit Job page, and when

**Question.** Does Stage F stop the Edit Job page taking the group's lock now, or does that wait for
[job-groups](../job-groups/plan.md) to stop a close writing the group document?

**Why it is James's call.** It is an ordering between two projects, and the cheap order reopens a
defect the other project was started to fix.

**Options.**
- *Now.* Two members can then close jobs in one group at the same time, and each close writes the
  whole group document from its own copy — the client-authored membership overwrite job-groups
  § The defect describes.
- *After job-groups Stage A.* Membership is then `job.groupID`, inside the job writes the transaction
  already covers, and a close has no group write left to guard.

**Recommendation.** After job-groups Stage A; move this item into that project's plan or mark it as
waiting on it here. The restore half has no such dependency and can go now.

**Blocked until decided.** Only this leftover. The rest of Stage F does not wait on it.

### Whether the whole document comes off the delivery, and what answers when no delta can be stated

**Question.** Is Stage E's breaking half taken, and if so what does a client receive for an update
whose delta `jobDeltaFor` cannot state?

**Why it is James's call.** It is a breaking change on two cross-process surfaces whose only benefit —
a post-image lookup and some bytes per update — has not been measured, and the fallback is a design
choice the plan has not made.

**Options.**
- *Do not take it.* Delivery stays additive. Costs one lookup per job update and the document's bytes.
- *Take it; the watcher reads the job itself in the rare case.* A `FindOne` only when no delta can be
  stated, published as the whole document. The client is unchanged for that frame; the common case
  loses the lookup.
- *Take it; publish a frame with neither.* The client re-reads. Simplest watcher, and every connected
  client fetches the same job at once.

**Recommendation.** Measure first and decide on the figure; do not schedule it in this release. If it
is taken, the second option, with `job_documents` in a collection group of its own.

**Blocked until decided.** Nothing else in this project; only the payload saving.

### Whether the account document needs a check on its writes

**Question.** `PUT /api/v1/user/document` replaces the account document on every close, merge,
multi-delete and archive with no lock and no revision compare — is that left as it is?

**Why it is James's call.** [plan.md](./plan.md) § Open questions records it as "unexamined rather
than decided", and an open question stands in the way of promotion.

**Options.**
- *Leave it, by decision.* The document is account-scoped; its only second writer is the same person
  in another tab. Nothing under `services/api/v1endpoints/user/` imports the lock package.
- *Compare the revision.* `accounts` is among the collections the release seeds with
  `_meta.revision`, so the compare is available; a refusal then needs the SPA to re-read and re-apply
  its link changes.
- *Write the link lists as adds and removes.* `addLinkedEsiData` already expresses the change that
  way, so two tabs linking different runs would both keep theirs. A new write path.

**Recommendation.** Leave it by decision and say so in the plan, so the question closes; note the
third option as the shape to take if two tabs losing a link is ever reported.

**Blocked until decided.** Promotion, not code.

### Which documents are written by field

**Question.** Do groups, planner settings and the archive follow jobs onto field-scoped writes?

**Why it is James's call.** It is the project's scope, and it is the other unresolved entry in
§ Open questions.

**Options.**
- *Jobs only.* Planner settings are already field-scoped (`UpdatePlannerSettings` in
  `services/shared/mongo/planner_put.go`); a group shrinks to five authored fields under job-groups,
  whose plan says field-scoped writes then have little to offer it; an archived job is written once.
- *Groups too.* Worth it only if job-groups does not land.

**Recommendation.** Jobs only; close the question with those three reasons.

**Blocked until decided.** Promotion, not code.

### The linked run's plain corporation id

**Question.** Is `LinkedESIJob.CorporationID`'s stored tag a defect this project should hand on, or the
read path [entity-id-encryption](../entity-id-encryption/plan.md) already depends on?

**Why it is James's call.** Two plans describe the same field differently, and the correction has
stored documents behind it in a release window that is open now.

**Options.**
- *Close it here as answered.* That project's § What it converts says its conversion derives the ref
  and clears the id, and its step is already listed as owed in
  [shared-planners](../shared-planners/plan.md) § Every open project ships in this window. The tag
  becomes `bson:"-"` once that step has run against live.
- *Keep it open here.* Leaves a question in this plan that this project cannot answer.

**Recommendation.** Close it here and point at that project. One thing to pass on with it: that plan
names the field at `build.costs.linkedJobs[]`, and the reshape moves linked runs under `esi`; the
owner stamp its step follows runs before the reshape in `prepare_release.go`, so which path the
conversion reads depends on where exactly its step is put.

**Blocked until decided.** Promotion here; nothing in code.

## Dependencies and order

**What this project waits on.**

- The release window, for everything. Stage C cuts over with
  [job-document-drafts](../job-document-drafts/plan.md) Stage 2, whose reshape step is in
  `prepare_release.go` and marked required; that project's status reads "Landed, awaiting the window".
- [job-groups](../job-groups/plan.md) Stage A, for the Edit Job page's group lock only.
- Two measurements on a restored copy of live: the largest close against the 1 MiB body limit, and
  the payload figure for Stage E's breaking half.

**What it no longer waits on.** The plan's account of
[shared-planners](../shared-planners/plan.md) holds. Stage G is landed apart from G6, which that plan
measures with this project's `live_full_loop_test.go`. Stage H is landed, and the code agrees: the
lock gate is keyed by `models.Owner`, resolved by `helper.RequestPlannerOwner` in `putHandler.go`, so
there is a real lock between two members for Stage D to have narrowed.

**What waits on it.**

- [job-groups](../job-groups/plan.md) Stage A is unblocked by Stages A and D here, and says so.
- [shared-planners](../shared-planners/plan.md) § Stage K reuses two things Stage D built: an expired
  lease keeps the editor's changes "as the held layer of the draft store", and taking the lock back
  "rebases them through the change-review panel". Both exist (`jobDraftStore.js`,
  `ChangeReviewDialogue.jsx`). Stage K also takes over the 24-hour lease and the missing
  disconnect release that this plan's Stage D text still lists as hazards.

**Recommended next slice.** Finish the merge slice that is in the working tree: add the delivery leg
for a change carrying a removal to the live loop test, then it is ready to commit when wanted. After
it, multi-delete as one change, which reuses everything merge built and needs no decision beyond what
a refusal shows. Archive waits on its decision. The plan corrections in § Discrepancies are a
ten-minute edit and are worth making before any of it, because three of them describe a lock model
the code does not have.
