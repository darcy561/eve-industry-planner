# Job groups — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not
unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

A group document holds only what a person authored. Membership is `job.groupID` and nothing else, so
no client can express a change to a group's contents from a view of the planner it only partly holds.

Everything else follows from that: the derived sets come off the document, the Group class loses the
machinery that builds them, the persist queue that exists to batch those rewrites goes, and creating a
group stops needing a page to run on.

## Starting position

A group is stored as `models.Group` and mirrored by the SPA's `Group` class. The SPA class carries
fourteen fields; the stored model adds `SchemaVersion` and `AccountID` to them. Those fourteen split
four ways:

| | Fields |
|---|---|
| Authored | `groupName`, `groupID`, `groupStatus`, `groupType` |
| Derived by `Group._buildNewGroupData` | `includedJobIDs`, `includedTypeIDs`, `materialIDs`, `outputJobCount`, `linkedJobIDs`, `linkedOrderIDs`, `linkedTransIDs` |
| Derived, but kept separately | `archivedJobIDs`, by `markJobsArchived` — it adds the archived ids, then recomputes the seven above through `removeJobsFromGroup` |
| Neither | `areComplete`, per-job progress kept on the group; and `_meta` |

The client is the sole author of all of it. `PUT /api/v1/groups` takes whole documents and
`BulkUpsertGroups` upserts what it is given; the server never compares a submitted group against the
jobs it holds, though it knows how — `models.Group.RebuildFrom` does exactly that for the archive.

**Of the derived fields, most are read by nothing.** Sweeping the SPA for consumers:

| Field | Read by |
|-------|---------|
| `materialIDs` | nothing — `job.materialIDs` is an unrelated getter on `Job` |
| `outputJobCount` | nothing |
| `includedTypeIDs` | one: the `AvatarGroup` on the classic planner card |
| `linkedJobIDs`, `linkedOrderIDs`, `linkedTransIDs` | one: the login sum in `Functions/Endpoints/Private/groups.js` |
| `includedJobIDs`, `archivedJobIDs` | many, all asking which jobs are in the group |
| `areComplete` | four, all per-job completion state; two further files only write to it |

So two thirds of what is written on every group save is dead weight, and the group document averages
1 606 bytes to carry it — see [measurements/group-shape.md](./measurements/group-shape.md).

**The claimed-ESI set does not come from groups either.** `linkedSetsFromUserDocument` seeds the
account's `linkedJobs` / `linkedOrders` / `linkedTrans` from the **user document** at login, backed by
`LinkedJobs`, `LinkedTrans` and `LinkedOrders` on `models.UserAccountDocument`. The sum over group
documents runs afterwards and merges into the same sets. It is a second copy of a fact the account
document already owns, and the incomplete one — an ungrouped job's links only ever reach the user
document.

## The defect

A group is destroyed by an ordinary save when the reader does not hold all of its jobs.

1. The planner loads a reader's ungrouped jobs at login. A group's members are fetched when the group
   is opened, through `jobsFromIdsOrObjects`.
2. `jobsFromIdsOrObjects` fetches what is missing and **swallows a failed request into
   `console.error`**, returning whatever it managed to collect.
3. Closing the group calls `Group.updateGroupData(groupJobs)`, which routes through
   `_setLiveIncludedJobIDs` — a **replace**, not a merge. `mergeJobs` does the same on its touched
   groups.
4. The whole document is `PUT`, and the members that were never loaded are gone from it.
5. Those jobs still carry `groupID`. They are now orphans: in a group that does not list them,
   invisible to the group page, and not on the planner either.

Nothing on either side detects or repairs this. The server cannot: a submitted document that lists
eight of forty members is indistinguishable from a reader who deliberately removed thirty-two.

**The second symptom is creation.** Because a group's fields are derived, making one is a procedure
rather than a write: `newGroupPage.jsx` rewrites parent and child links across the selected jobs,
mints the group, flushes the debounced group save, saves the modified jobs, then polls `jobArray` on a
one-second `setInterval` racing a ten-second timeout before navigating. A route had to exist to host
it. A failure part-way leaves a group in the array with jobs pointing at it.

## What the group document becomes

```
groupID, groupName, groupStatus, groupType, outputTypeIDs, _meta
```

All authored — each one set by a person's action or at creation — and roughly 200 bytes. Nothing on it
is derived from a collection a client might hold only part of, which is what makes the defect
impossible rather than guarded against.

| Field | Becomes |
|-------|---------|
| `includedJobIDs`, `archivedJobIDs` | removed; `job.groupID` is the membership fact, and an archived member is an `archived_jobs` row carrying the same `groupID` |
| `materialIDs`, `outputJobCount` | removed; nothing reads them |
| `includedTypeIDs` | replaced by `outputTypeIDs` — see below |
| `linkedJobIDs`, `linkedOrderIDs`, `linkedTransIDs` | removed; `models.UserAccountDocument` already owns the account's claimed-ESI set, and the group sum is a duplicate source |
| `areComplete` | moves onto the job. `jobStatus` (0–3) already exists there, and marking one job complete then writes the job rather than rewriting the group |

Moving `areComplete` matters more than its size suggests. Today, two members completing two different
jobs both rewrite the same group document; afterwards each writes the job they touched.

## The icons are the outputs

The one derived field with a real consumer is `includedTypeIDs`, drawn as an `AvatarGroup max={4}` on
the classic planner card. It becomes `outputTypeIDs`: the types produced by the group's parentless
jobs, capped at what the card draws.

**It is the visual twin of the group name.** `setGroupName(outputJobs)` already builds the name by
joining the output jobs' names at creation, after which the reader may rename it. `outputTypeIDs`
follows the same rule from the same jobs at the same moment — so the card shows, in pictures, what the
name says in words, and the rule is one a later reader can state in a sentence.

**It is also a better card.** Outputs average 2.17 per group against 14.2 included types, and 88.5 %
of groups have four or fewer, so most cards draw the complete set. Today, against a median of eight
types, a card shows an arbitrary four of eight — the product mixed with whatever intermediates and
materials happen to sort first.

**Its staleness is cosmetic.** Outputs change when the group's topology changes: linking a job to a
parent inside the group demotes it from output to intermediate. The refresh point is group close,
which already holds every member job and is already normalising relationships, so it costs no extra
read. If the client's view is partial at that moment the icons are wrong until the next close — which
is the point. The property this project buys is that nothing a client writes can lose data, and four
stale icons satisfy it where a truncated membership list does not.

`outputJobCount` is not kept. Nothing reads it, and where a count is wanted later it should be asked
for deliberately rather than inherited.

## Membership is the job's fact

`job.groupID` is already stored on every job, already persisted, and already served —
`GetJobDocumentsByGroupHandler` answers `/api/v1/job-documents` by group. The group's id list is a
second copy of that, and it is the copy that gets destroyed.

Reads move accordingly:

- **The group page** asks for the group's jobs by group instead of reading `liveMemberIDs` and posting
  the ids. Same documents, one fewer round trip.
- **Call sites with jobs already loaded** — the accordion, the templates dialogue, the tree, the side
  menu — filter `jobArray` on `groupID`.
- **Call sites that run before jobs load** — `groupFrame`'s loader and
  `patchGroupMemberJobScopesAfterGroupGrant` — ask the server.

The SPA's `Group` class loses `_buildNewGroupData`, `createGroup`, `updateGroupData`,
`addJobsToGroup`, `removeJobsFromGroup`, `markJobsArchived`, `_setLiveIncludedJobIDs` and the
add/set/remove trio for each of six id sets. What remains is a name, a status and the output types.

**The persist queue goes with them.** `pendingJobGroupWrites`, `queueJobGroupWrites`,
`queueJobGroupWritesAndSchedule`, `clearPendingJobGroupWrites`, `getPendingJobGroupWritesPayload`,
`scheduleDebouncedGroupSave` and `flushPendingGroupSave` exist to batch derived-field rewrites
triggered by job actions. With authored-only fields a group is written when someone renames it or
moves its status — one write, on blur.

## Creation is one request

`POST /api/v1/groups` carries the authored group and the modified job documents; the server writes
both. The SPA navigates on the response.

The parent/child pruning stays in the SPA — it is real domain logic about job trees and the server has
no business rewriting them — but it happens before the request rather than between three of them. The
`/group/new` route, the `setInterval` poll and the ten-second timeout go, and a failure writes nothing
instead of leaving a half-made group.

## What this costs to read

The planner list and login must stay free of job reads, and they do: both read group documents only,
as today, and those documents get smaller.

A read-time aggregate over member jobs was considered for the card and rejected on measurement. The
heaviest account holds 600 grouped jobs across 31 groups — about 2.4 MB of job documents — and the
planner list is drawn on every session and every planner switch. An authored `outputTypeIDs` costs
nothing on that path.

The group page's cost does not change: it fetched every member's document before and does so still.

## What this project waits on

**No stage of this project starts until the document lock work has landed.** The lock is the one place
where a group's membership is read by the server, and two projects are about to change what that means.

| Waits on | Why |
|----------|-----|
| [shared-planners](../shared-planners/plan.md) § Stage H — the lock stops being account-shaped | The lock key, waitlist, viewer set and fan-out subject move onto the owner key. Until they do, two members of one planner take two keys for one job and neither contends, so there is no lock here to reason about |
| [document-write-granularity](../document-write-granularity/plan.md) § Stage A — a version on the document and a write that checks it | Stage D rests on it and must not precede it |
| [document-write-granularity](../document-write-granularity/plan.md) § Stage D — the lock stops being broad | Deletes the group lease over member jobs, `resolveDocumentLockApiTarget`'s retarget, `JobGroupBypass`, and `cascade.go` / `cascade_pipeline.go` outright |

Stage D is the binding one. `cascade.go` reads `group.IncludedJobIDs` to force-release per-job locks
when a group lease moves, and `put_groups.go` diffs added members out of a group upsert to extend the
lease to them. Both are consumers of the field this project removes — but Stage D **deletes both
files**, along with the reason they exist. Moving them onto a job query first would be writing code
that another project is already committed to removing, and would couple this project's rollback to
theirs.

So the order is: the lock stops being account-shaped, then it stops being broad and the cascade goes,
and only then does membership come off the group document. By that point the server's only remaining
read of a group's membership is gone, and this project is a change to storage and the SPA rather than
to locking.

**Coordination, not a block:**

- [document-defaults](../document-defaults/contents.md) owns the upgrader on the read path. `.Group`
  runs only in the offline `schemamaint` drain today, so the field removal below either rides that
  project's read-path upgrader or ships with a drain — decided when both are scheduled.
- [job-document-drafts](../job-document-drafts/contents.md) reshapes the job document. This project
  puts nothing new on a job, but it makes `groupID` load-bearing, which that project should know before
  it decides what a job's stored shape carries.
- [document-write-granularity](../document-write-granularity/plan.md) § Stage C gets easier here: a
  five-field document whose only free-text field is one a person types has little use for field-scoped
  writes, and the two-writers-different-fields conflict largely stops existing for groups.

**Go modernisation in scope.** `go fix -diff` over `shared/models/...`, `shared/mongo/...`,
`api/v1endpoints/groups/...` and `shared/core/documentlock/...` reports one suggestion: an
`omitempty` on `forceReleaseSameAccountTxResult.Record` in `documentlock/atomic.go` that wants
`omitzero`. It is in a file the lock projects own and this project does not need to edit; it belongs
to whichever of them touches `atomic.go` first.

## What each surface owes

| Surface | Owes |
|---------|------|
| `models.Group` | fields removed, `OutputTypeIDs` added, schema version bumped |
| `services/api/v1endpoints/groups` | `POST` for creation; `PUT` accepting only authored fields and rejecting the rest |
| `services/shared/mongo/put_groups.go` | the membership delta goes; upsert writes authored fields only |
| `services/shared/models/group_shape.go` | `RebuildFrom` stays for the archive; nothing on the live path calls it |
| SPA `Classes/group.js` | reduced to name, status, type, output types |
| SPA `Zustand/jobsSlice/groupManagement.js` | the persist queue removed |
| SPA `Functions/Groups`, `Functions/JobPlanner` | `closeGroup`, `mergeJobs`, `addNewJobsToPlanner`, `buildNextMaterialsTree`, `closeActiveJob`, `importFitFromClipboard`, `deleteMultipleJobs`, `instantiateGroupTemplate` stop rebuilding groups |
| SPA `Components/Groups/New Group` | deleted with its route |
| SPA planner cards | `outputTypeIDs` on the classic card; the compact card never drew icons |

## Schema versioning

`GroupSchemaCurrent` is **1** in `models/document_schema.go`, and **Stage B is what moves it** — the
step to write is `1 → 2`.

Nothing scheduled ahead of this project bumps it. [shared-planners](../shared-planners/plan.md)
§ Schema versioning looks like it does, but its landed account says otherwise: *"there is no
`v1 → v2` step to write, the four `*SchemaCurrent` constants stay where they are"* — the owner is not
a shape a document can be upgraded into, so that cutover stamped owners without touching versions.
Stage B still reads the constant rather than this sentence, in case something lands in between.

The upgrade step drops the removed fields and sets `outputTypeIDs` from the jobs the group listed —
which is the last moment the stored membership list is readable, so the step must not run before
Stage A's backfill has put `groupID` on every member.

Per the master rule that a dropped field needs no upgrader, the removals alone would not justify a
version; the added `outputTypeIDs` and the ordering constraint do.

## Wire compatibility

| Change | Verdict |
|--------|---------|
| Group document fields removed, `outputTypeIDs` added | **migrate-required** — one `SchemaVersion` step, with a backfill that must precede it; see § Schema versioning for the number |
| `PUT /api/v1/groups` body | **breaking** — the accepted shape narrows to authored fields; a client sending the old shape has the rest ignored rather than stored |
| `POST /api/v1/groups` | **additive** |
| Job document | **additive — nothing changes.** `groupID` is already stored and already served by group |
| Change stream group payloads | **breaking in content, not in shape** — a delivered group carries fewer fields. Group churn drops sharply, since a group document changes only when a person edits it |
| `areComplete` moving to the job | **migrate-required** — carried by the same upgrade step |
| Document lock keys and cascade | **untouched by this project** — owned by the two projects above |

## Stages

### Phase 1 — Project folder and docs

This folder, its `contents.md`, this plan, the overlay scaffold, the measurements, and the row in the
section task map. No product work.

### Stage A — Membership becomes the job's, and the damage is repaired

A backfill walks every group and ensures each job in `includedJobIDs` carries that `groupID`, which is
also the repair: a job whose `groupID` names a group that stopped listing it is exactly an orphan from
the defect, and under the new model it is simply a member again. The walk reports how many it found —
that number is the defect's real blast radius and belongs in `measurements/`.

Every read of `includedJobIDs` then moves onto `job.groupID`, on both sides. The group document still
carries its fields and is still written as it is today, so nothing breaks and the stage is verifiable
on its own.

Needs `{_meta.owner.id, groupID}` on `jobs` and `job_documents`, confirmed by `explain` against the
restored snapshot rather than by reading the index spec list.

### Stage B — The group document stops carrying derived data

The fields come off, `outputTypeIDs` arrives, `areComplete` moves to the job, the schema steps once,
and `PUT` narrows to authored fields. The SPA's `Group` class and the persist queue shrink to match.

### Stage C — Creation is one request

`POST /api/v1/groups` carrying the group and its member jobs. The `/group/new` route, the poll and the
timeout are deleted.

## Done when

- A group document carries only authored fields, and a client that holds none of a group's jobs can
  rename it without affecting its membership.
- Every membership read on both sides resolves through `job.groupID`.
- Creating a group is one request with no placeholder route and no polling.
- The orphan repair has run, with its count recorded.
- The planner list and login read no job documents.
- Tests ship with each stage: the group page and close path covered end to end through the area's
  existing harnesses, and a test that closing a group whose jobs failed to load changes no membership.

## Open questions

- **Where the group-close output refresh runs.** § The icons are the outputs puts it on the client at
  close, where the jobs are already held. The server could do it from the close request's payload
  instead. Neither is clearly better until Stage C's request shape is settled.
- **Whether `groupType` survives.** It is written, defaults to 1, and no consumer was found in the
  sweep. Left on the document for now because it is authored and costs nothing; worth a decision
  before Stage B rather than carrying a field nothing reads into a document defined by not having any.
- **What the classic card shows for a group with no outputs.** Possible while a group holds only
  intermediates mid-restructure. Falling back to nothing is the simplest answer; falling back to
  included types reintroduces what this project removed.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — membership becomes the job's, and the damage is repaired | **Not started, and blocked.** Waits on shared-planners § Stage H and document-write-granularity §§ Stage A, Stage D — see § What this project waits on |
| B — the group document stops carrying derived data | Not started. Rests on Stage A's backfill; must not precede it |
| C — creation is one request | Not started |
