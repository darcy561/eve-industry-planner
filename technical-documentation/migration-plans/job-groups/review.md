# Job groups — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project takes the derived sets off the group document so that membership is `job.groupID` alone,
replaces the type icons with authored output types, and makes creating a group one request.

**No product work has started, and the plan is right that nothing blocks it any more.** Both lock
projects it waited on are in the code: the lock key is built from the planner's owner, and the group
lease, the cascade and the membership diff in the group upsert are gone.

Three things need attention before Stage A is written:

- **The plan's schema argument rests on a false premise.** `Public` does carry `document_schema.go`
  with `GroupSchemaCurrent = 1`, and an hourly task stamps it onto group documents. Live groups are
  already v1 in the old shape — see § Decisions needed, first entry.
- **The server still reads and writes a group's membership**, in the archive restore path. The plan
  says the last server-side reader went with the cascade; `restoreGroups` was missed.
- **Deleting a group has the same partial-view hazard as the defect**, and the plan does not cover it.
  Once the list is gone the delete path has nothing to read.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 — project docs | Complete | Folder, `contents.md`, `plan.md`, `overlay.md`, `measurements/group-shape.md` and the section row all exist | this folder; [`../contents.md`](../contents.md) last row | confirmed |
| Waits on: shared-planners § Stage H | Landed | The lock key, waitlist and pulse keys take a `models.Owner` | `LockKey`, `waitlistKey`, `WaitlistPulseKey`, `lockScope` in `services/shared/core/documentlock/redis.go`; both group handlers resolve the owner with `helper.RequestPlannerOwner` before the gate | confirmed |
| Waits on: document-write-granularity § Stage A | Landed | Documents carry a write counter and the group upsert moves it | `MetaData.Revision` in `services/shared/models/metaData.go`; `SetDocumentWithRevision` in `services/shared/mongo/groups_put.go`; release step "give every document a write counter at _meta.revision" in `services/core/commands/prepare_release.go` | confirmed |
| Waits on: document-write-granularity § Stage D | Landed; removed the group lease and deleted the cascade | No `cascade.go` or `cascade_pipeline.go` in `services/shared/core/documentlock/`; no `JobGroupBypass` or `resolveDocumentLockApiTarget` anywhere under `services/` or `frontend/src`; `BulkUpsertGroups` is one bulk write with no prior read | directory listing of `documentlock/`; `services/shared/mongo/groups_put.go`; `canPersistJobClose` in `frontend/src/Functions/DocumentLock/canPersistDocumentEditClose.js` asks about the job's lock alone | confirmed |
| Stage A — membership becomes the job's | Not started, no longer blocked | No group step in `prepareRelease`; every SPA reader still reads `includedJobIDs` | step list in `services/core/commands/prepare_release.go`; `groupJobs` in `frontend/src/Components/Groups/groupFrame.jsx` filters on `activeGroupObject.includedJobIDs` | confirmed |
| Stage B — the group document stops carrying derived data | Not started | `models.Group` holds all sixteen fields; nothing named `outputTypeIDs` exists on either side | `services/shared/models/group.go`; `frontend/src/Classes/group.js`; a search of `services/` and `frontend/src` | confirmed |
| Stage C — creation is one request | Not started | The router answers `GET`, `PUT` and `DELETE` only; the placeholder route and page are present | `services/api/v1endpoints/groups/groupsRouter.go`; `frontend/src/routes/group/new.jsx`; `frontend/src/Components/Groups/New Group/newGroupPage.jsx` | confirmed |

The stage statuses are all confirmed. The discrepancies are in claims the plan makes on the way:

1. **§ Schema versioning — "`Public` has no `document_schema.go`, so live has never held a v1 group."**
   Overstated. `git show Public:services/shared/shared/models/document_schema.go` has
   `GroupSchemaCurrent = 1` and an `UpgradeGroup` that stamps it. `Public:services/core/scheduler/maintenance/schema_versions.go`
   schedules `cron.schemaVersionMaintenance` at `0 * * * *` over a rotation that includes the groups
   collection, and `maintainGroupSchemaVersionBatch` in `Public:services/worker/tasks/maintenance/schema_version_batch.go`
   writes the version onto every group that lacks it.
2. **§ What this project waits on — "the server's only remaining read of a group's membership is gone."**
   Overstated. `restoreGroups` in `services/api/v1endpoints/archivedjobs/grouprebuild.go` loads the
   live group, folds the restored jobs into `IncludedJobIDs` with `Group.AddJobs`, and writes it with
   `BulkUpsertGroups`. `live_restore_test.go` in the same package asserts on `stored.IncludedJobIDs`.
3. **§ What each surface owes — "`RebuildFrom` stays for the archive; nothing on the live path calls it."**
   Overstated. Restore is an API request that writes a live `job_groups` document, and it calls
   `RebuildFrom` when the group is gone. `AddJobs` is not mentioned in the plan at all.
4. **§ What each surface owes — "`groups_put.go`: the membership delta goes."** Understated: it has
   gone. [document-write-granularity/overlay.md](../document-write-granularity/overlay.md) § Stage D
   says so in as many words.
5. **§ Membership is the job's fact — `patchGroupMemberJobScopesAfterGroupGrant`.** No longer exists.
   It went with the cascade. The call sites that run without the group's jobs loaded are different
   ones: see § What each remaining step changes, Stage A.
6. **§ Starting position — "`includedTypeIDs`: one reader, the `AvatarGroup`."** Overstated.
   `Group.hasIncludedTypeId` is called by `frontend/src/Functions/Groups/findMaterialJobInGroup.js`
   and `frontend/src/Functions/JobPlanner/importFitFromClipboard.js`. Both use it as a guard before
   a `jobArray` search and convert easily, but they are consumers.
7. **§ Membership is the job's fact — "`job.groupID` … and nothing else."** A job carries three
   membership fields, set together by `assignToGroup` in `frontend/src/Components/Edit Job/Edit Job Hooks/jobCommands.js`:
   `groupID`, `includedInGroup` and `displayOnPlanner`. `models.Job` stores all three. The backfill
   has to write the first two.
8. **Stage A — "Needs `{_meta.owner.id, groupID}` on `jobs` and `job_documents`."** Partly.
   `ajd_meta_owner_groupID_1` exists on `job_documents` in `deployment-tool/internal/dataplane/mongo/index_specs.go`,
   and `aj_meta_owner_groupID_1` on `archived_jobs`. The `jobs` collection has no entry in that
   spec list at all. The `explain` against the restored snapshot has not been run: unverifiable here.
9. **§ What this project waits on — the `go fix` note on `forceReleaseSameAccountTxResult.Record`.**
   The field's tag is `json:"record"` with no `omitempty` today, so the suggestion no longer applies
   as written. `go fix -diff` was not re-run for this review.
10. **`overlay.md` disagrees with `plan.md`.** § Stage A still says the project is blocked, and
    § Stage B still names a `1 → 2` upgrade step where the plan now says the version stays 1.

The figures in [measurements/group-shape.md](./measurements/group-shape.md) were not re-measured.

## What each remaining step changes

### Stage A — Membership becomes the job's, and the damage is repaired

**Today.** A group's members are whatever its document lists. The job says the same thing a second
time, and nothing compares the two.

```json
{
  "groupID": "group-3f0c",
  "groupName": "Rifter, Slasher",
  "includedJobIDs": ["job-a", "job-b", "job-c"],
  "archivedJobIDs": []
}
```

```json
{ "jobID": "job-b", "groupID": "group-3f0c", "includedInGroup": true, "displayOnPlanner": false }
```

The readers of the list, by whether the group's jobs are in the store when they run:

| Runs with the jobs loaded | Runs without them |
|---|---|
| `groupFrame.jsx` (`groupJobs`), `Side Menu/Buttons/buttonFunctions.jsx`, `SaveGroupTemplateDialogue.jsx`, `JobDependencyTreeDialogue.jsx`, `resolveEditJobLinkTreePayload.js`, `closeGroup.js`, `instantiateGroupTemplate.js` | `ensureGroupJobs.js` and `prepareGroupPage.js` (both through `liveMemberIDs`), `getJobIDsFromGroupObjects.js` (planner selection, called from `Zustand/jobsSlice/core.js` and `buildNextMaterialsTree.js`), `releaseJobsAfterGroupRemoved.js` (a group deleted from its planner card) |

The server already answers the question the second column needs:
`GET /api/v1/job-documents/by-group/{groupID}` (`GetJobDocumentsByGroupHandler` in
`services/api/v1endpoints/jobdocuments/getHandlers.go`), a `{groupID}` filter scoped to the owner.
The SPA already has the request for it, `fetchJobDocumentsByGroupFromApi` in
`frontend/src/Functions/Endpoints/Private/jobDocuments.js`, and nothing calls it.

**After.** Every reader asks the job. The first column filters `jobArray` on `groupID`; the second
calls the by-group endpoint. The group document is unchanged and still written as it is, so the
stage can be checked on its own.

```js
const groupJobs = jobArray.filter((job) => job.groupID === groupID);
```

Stored jobs change only where the two copies disagreed. The plan fixes one direction (a listed job
gains the `groupID`); the other cases are undecided — § Decisions needed.

**Work.**

1. A `prepareRelease` step after "reshape every job document" in
   `services/core/commands/prepare_release.go`, walking `job_groups` and writing `groupID` and
   `includedInGroup` onto `job_documents` and `archived_jobs` rows. It reports a count per case, and
   that report goes into `measurements/`.
2. Ordering and backup tests beside the existing ones in `prepare_release_test.go`
   (`stepIndex`, `TestTheBackupCoversEveryCollectionAStepWritesTo`).
3. Run the step as a dry run against the restored snapshot first. Its counts size every decision
   about disagreeing copies.
4. The second-column readers moved onto `fetchJobDocumentsByGroupFromApi`, which exists and is
   unused. A failed fetch must reject rather than be swallowed, which is step 2 of
   [plan.md](./plan.md) § The defect.
5. The first-column readers moved onto a `jobArray` filter. One shared selector, not seven copies.
6. `findMaterialJobInGroup.js` and `importFitFromClipboard.js` drop the `hasIncludedTypeId` guard.
7. `explain` for the by-group read against the snapshot, recorded in the overlay.
8. Tests: the existing suites that construct membership through the list
   (`prepareGroupPage.test.js`, `closeGroup.test.js`, `releaseJobsAfterGroupRemoved.test.js`), and
   the plan's own done-when test — closing a group whose jobs failed to load changes no membership.

**Wire.** Additive for the API and the SPA. **Migrate-required** for stored jobs: the backfill in
item 1. In a development database the readers move before the step has run, so a job listed by a
group but lacking the `groupID` drops out of that group until it does.

### Stage B — The group document stops carrying derived data

**Today.** The stored document on this branch, from `models.Group`:

```json
{
  "schemaVersion": 1,
  "accountID": "…",
  "groupID": "group-3f0c",
  "groupName": "Rifter, Slasher",
  "groupStatus": 1,
  "groupType": 1,
  "includedJobIDs": ["job-a", "job-b", "job-c"],
  "archivedJobIDs": [],
  "includedTypeIDs": [585, 587, 11399],
  "materialIDs": [34, 35, 585, 587, 11399],
  "outputJobCount": 2,
  "areComplete": ["job-c"],
  "linkedJobIDs": [],
  "linkedOrderIDs": [],
  "linkedTransIDs": [],
  "_meta": { "lastModified": "…", "owner": { "kind": "account", "id": "…" }, "revision": 4,
             "createdAt": "…", "lastUpdatedBy": "…", "archivedAt": null, "archivedBy": null }
}
```

**Live is not that shape.** `Public`'s `Group` has no `archivedJobIDs` and carries a `showComplete`
boolean this branch has dropped. The release step converts from live, so it starts from that.

`PUT /api/v1/groups` takes `{ "groups": [<whole document>] }` and `BulkUpsertGroups` sets what it is
given. Writers on the SPA side: the debounced queue in `Zustand/jobsSlice/groupManagement.js` and
`Functions/Debounce/jobGroupsPersistSchedule.js`, and a direct `putJobGroupsBatch` in
`markJobsArchivedInGroups.js`. Completion is a set on the group, toggled by `MarkAsCompleteButton`
(`Edit Job Components/Complete/…/markAsComplete.jsx`) and read by `ClassicGroupJobCardFrame.jsx`,
`groupJobTreeFlow.jsx` and `JobDependencyTreeDialogue.jsx`. `applyJobGroups` in
`Functions/Endpoints/Private/groups.js` sums the three `linked*` sets into the account's.

**After.** From [plan.md](./plan.md) § What the group document becomes. The plan's field list is
silent on `schemaVersion` and `accountID`; they are shown because the stored model has them.

```json
{
  "schemaVersion": 1,
  "accountID": "…",
  "groupID": "group-3f0c",
  "groupName": "Rifter, Slasher",
  "groupStatus": 1,
  "groupType": 1,
  "outputTypeIDs": [585, 587],
  "_meta": { "…": "unchanged" }
}
```

```go
type Group struct {
	SchemaVersion int           `json:"schemaVersion,omitempty" bson:"schemaVersion,omitempty"`
	AccountID     string        `json:"accountID" bson:"accountID"`
	GroupName     string        `json:"groupName" bson:"groupName"`
	GroupID       string        `json:"groupID" bson:"groupID"`
	GroupStatus   int           `json:"groupStatus" bson:"groupStatus"`
	GroupType     int           `json:"groupType" bson:"groupType"`
	OutputTypeIDs []int         `json:"outputTypeIDs" bson:"outputTypeIDs"`
	MetaData      GroupMetaData `json:"_meta" bson:"_meta"`
}
```

The SPA class keeps the constructor, `toDocument`, `setGroupName` and the three status methods.
The plan's removal list does not mention `setGroupID`, `findOutputJobs` or `getJobIDsForOutputJob`.
A rename is one `PUT` on blur. Where a job's completion is stored is not specified beyond "on the
job" — § Decisions needed.

**Work.**

1. `models.Group` reduced; `Group.AddJobs` deleted; `RebuildFrom` reduced to a name and output types,
   or deleted, depending on what restore does (§ Decisions needed).
2. `restoreGroups` rewritten: for a group that exists there is no membership to write.
3. `PUT /api/v1/groups` narrowed to the authored fields.
4. A `prepareRelease` step after Stage A's: set `outputTypeIDs` from each group's parentless jobs,
   carry `areComplete` to the jobs, then `$unset` the removed fields **and live's `showComplete`**.
   It cannot select its work by `schemaVersion` — § Decisions needed, first entry.
5. A verify gate beside the two at the end of `prepareRelease`: no group carries `includedJobIDs`.
6. `Classes/group.js` reduced, and its comments brought to the two-line rule in the same change.
7. The persist queue removed from `groupManagement.js`, with `jobGroupsPersistSchedule.js`,
   `persistJobGroupsToApi.js` and `pendingJobGroupWrites` in `stateDefault.js`.
8. The rebuild calls removed: `closeGroup.js`, `mergeJobs.js`, `closeActiveJob.js`,
   `buildNextMaterialsTree.js`, `deleteMultipleJobs.js`, `instantiateGroupTemplate.js`,
   `markJobsArchivedInGroups.js`, `newGroupPage.jsx`.
9. `applyJobGroups` stops summing `linked*`; `ClassicGroupJobCard.jsx` draws `outputTypeIDs`.
10. Completion's three readers and its one writer moved to wherever it lands.
11. Group delete: `deleteGroupWithoutJobs.js` and `releaseJobsAfterGroupRemoved.js` have no list to
    read — § Decisions needed.
12. Tests rewritten or retired: `group.test.js`, `groupMembership.test.js`,
    `groupDerivation.corpus.test.js`, `group_shape_test.go`, and the live tests that construct
    `IncludedJobIDs` (`live_parity_putget_test.go`, `live_restore_test.go`, `mongo_live_test.go`,
    `live_lock_gate_test.go`). A rename followed from the editor to a second client, since
    `handleUserJobGroupUpsert` replaces the whole instance from what arrives.

**Wire.** `PUT` body: **breaking**. Stored groups, and jobs gaining completion: **migrate-required**,
item 4. Change stream group messages: same envelope, fewer fields. The SPA and the API ship together.

**In flight elsewhere.** `mergeJobs.js`, `closeActiveJob.js`, `instantiateGroupTemplate.js` and the
planner's `Side Menu/Buttons/buttonfunctions.jsx` are modified in the working tree by other work.
`mergeJobs.js` still calls `group.updateGroupData`.

### Stage C — Creation is one request

**Today.** "New Group" on the planner navigates to `/group/new?includes=job-a,job-b`. The page's
effect then runs, in order: prune parent and child links with `applyCommands`; `group.createGroup`;
`addGroupToGroupArray`; `flushPendingGroupSave()`, which is `PUT /api/v1/groups`; `saveJobsViaApi`;
a one-second `setInterval` over `jobArray` raced against a ten-second timeout; navigate to
`/group/$groupID`. A rejection logs and navigates to `/jobplanner`. The route is
`audience: "public"`: signed out, the same code runs and skips both requests.

**After.** One request, written whole or not at all. **The plan does not give the body.** It says
only that it carries the authored group and the modified jobs, and that it should use the mechanism
a close uses. An illustration under that constraint, with each job in the envelope pinned by
`testing/fixtures/job-write/body.json`:

```json
{
  "group": { "groupID": "group-3f0c", "groupName": "Rifter, Slasher",
             "groupStatus": 0, "groupType": 1, "outputTypeIDs": [585, 587] },
  "jobs": [
    { "revision": 7,
      "job": { "jobID": "job-a", "groupID": "group-3f0c", "includedInGroup": true,
               "displayOnPlanner": false } }
  ]
}
```

The id stays client-minted (`group-${crypto.randomUUID()}`), because the jobs in the same request
have to name it.

**Work.**

1. `POST /api/v1/groups` in `groupsRouter.go`, writing the group and the jobs in one transaction
   through the close path's writer, refused whole if any job is stale or held by another session.
2. The envelope pinned as a fixture for both sides, beside `job-write/body.json`.
3. The pruning lifted out of `newGroupPage.jsx` into a function the planner button calls.
4. The signed-out path kept: the same function, no request.
5. An empty selection still makes an empty group, which the button's tooltip promises.
6. `routes/group/new.jsx`, `newGroupPage.jsx` and its test deleted, and `routeTree.gen.js`
   regenerated.
7. A live test that a refused creation leaves neither a group nor a changed job.

**Wire.** **Additive.**

## Decisions needed

### The group schema version when live already holds v1

**Question.** Does `GroupSchemaCurrent` stay 1 through a release that changes what a v1 group is?

**Why it is James's call.** The plan, [shared-planners](../shared-planners/plan.md) § Every open
project ships in this window, and document-defaults all rest "no version moves" on live never having
held a v1 document. That is false for `Public` (§ Verified status, discrepancy 1). The rule is
release-wide and owned by shared-planners.

**Options.**

- **Stay at 1.** Nothing else in the release changes. But `1` then names two shapes;
  `completeSchemaMaintenance` reports every live group "already at v1"; the Stage B step cannot
  find its work by version; and a partly converted collection is indistinguishable by version from
  a finished one.
- **Move to 2 in this build**, once, for the documents whose shape this release changes. The number
  says which shape a document is in. It contradicts "no schema version moves in this build" and
  reopens the same question for the job reshape.

**Recommendation.** Whichever is chosen, the Stage B step selects on shape
(`includedJobIDs` present), is required, and has a verify gate. On the number itself: move it,
because `1` has shipped meaning the old shape. Confirm first with one count on the restored
snapshot: groups carrying `schemaVersion: 1`.

**Blocked until decided.** Stage B's release step and the overlay's upgrade section. Not Stage A.

### What the backfill does when the two copies disagree

**Question.** For each way a group's list and a job's `groupID` can disagree, which one wins?

**Why it is James's call.** The plan settles one case. The rest decide whether a reader's jobs move
between a group and the planner at release, with nobody watching.

**Options.** The cases, and the choice in each:

| Case | Choices |
|---|---|
| Listed, job's `groupID` empty | pull it into the group (the plan) · drop it from the group |
| Listed by A, job names B | leave it in B · move it to A |
| Job names a group that does not list it | a member again (the plan) — no write |
| Job names a group that no longer exists | release it to the planner · rebuild the group |
| Listed id is an `archived_jobs` row | write `groupID` there too |
| Listed id exists nowhere | dropped with the list, counted |

**Recommendation.** The job's own non-empty `groupID` always wins. A listed job with none is pulled
in, with `includedInGroup` set and `displayOnPlanner` cleared as `assignToGroup` does. A job naming
a vanished group is released to the planner, which is what deleting a group was meant to do. Take
the dry-run counts before confirming.

**Blocked until decided.** Stage A's release step.

### Whether deleting a group releases its jobs on the server

**Question.** With no list on the group, who finds and releases a deleted group's jobs?

**Why it is James's call.** The plan does not cover delete, and the choice is between keeping job
writes on the client and letting the server change jobs.

**Options.**

- **The client asks by group, saves the released jobs, then deletes.** Three requests. A failure
  between them leaves jobs naming a group that is gone, invisible on every screen — the defect by
  another route. `releaseJobsAfterGroupRemoved` already swallows a failed fetch.
- **`DELETE /api/v1/groups` releases every job naming the group, in the same transaction**, refused
  whole if another session holds one. Other clients already release their copies on the delete
  message (`handleUserJobGroupDelete`).

**Recommendation.** The server. It is three scalar fields, not the tree logic the plan keeps in the
SPA, and it is the only way the delete lands whole.

**Blocked until decided.** Stage B work item 11.

### Where a job's completion within its group is stored

**Question.** Is it `jobStatus`, a new field on the job, or does `areComplete` stay?

**Why it is James's call.** The plan says it "moves onto the job" and points at `jobStatus`, but the
button sits on the Complete stage, so a job at the last status can be marked or not: `jobStatus`
cannot carry it. A new field contradicts this project's own "adds nothing to a job", and
[job-document-drafts](../job-document-drafts/plan.md) records, as landed behaviour, that marking a
job finished in its group leaves the job document untouched.

**Options.**

- **A new boolean on the job**, written through a job command. Two members marking two jobs stop
  colliding. Needs a name and a home agreed with job-document-drafts, and a migration.
- **Derive it from `jobStatus`.** No field, but the button's meaning changes.
- **Leave `areComplete` on the group.** It is authored, not derived. It stays a list of job ids that
  a whole-document `PUT` can overwrite.

**Recommendation.** The new boolean, agreed with job-document-drafts. Stage B can ship the other
removals first if this is not settled.

**Blocked until decided.** Stage B work items 4 and 10, completion only.

### What archive restore does to a group

**Question.** When a restored job names a group, what does the server write to that group?

**Why it is James's call.** The plan assumed nothing live calls the rebuild. Restore does.

**Options.** For a group that exists: nothing, or refresh its output types. For one that is gone:
recreate it from a name and output types, or restore the jobs ungrouped.

**Recommendation.** Nothing for a group that exists. Recreate a missing one, as today, with
`RebuildFrom` reduced to the name and the output types.

**Blocked until decided.** Stage B work items 1 and 2.

### Where output types are computed

**Question.** The plan's own open question: the client at close, or the server.

**Why it is James's call.** It decides whether the rule lives in one language or two.

**Options.** Server only, from a query for the group's parentless jobs: always complete, one
implementation. Client at creation and close, as the plan has it.

**Recommendation.** The client, as planned, because a signed-out reader's groups never reach a
server. If restore recreates groups, the rule then exists in Go as well, and the existing parity
corpus (`groupDerivation.corpus.test.js`, `TestRebuildMatchesTheCorpus`) is cut down to pin both.

**Blocked until decided.** Stage B item 4's rule, and Stage C's body.

### Whether `PUT` refuses or ignores the fields that are gone

**Question.** A body still carrying `includedJobIDs`: 400, or stored without it?

**Why it is James's call.** The plan says both. § What each surface owes says "rejecting the rest";
§ Wire compatibility says "ignored rather than stored".

**Recommendation.** Refuse, as the job write refuses a body it cannot read. Both sides ship together.

**Blocked until decided.** Stage B work item 3.

### Smaller open points

- **`groupType`.** Confirmed: nothing outside the two models and `RebuildFrom` reads it. Drop it in
  Stage B's step rather than carry it into the new shape.
- **A card with no outputs.** An empty group can be created today. Draw nothing.
- **`includedInGroup` beside `groupID`.** Job-document-drafts' field. This project writes both in the
  backfill and should tell that project `groupID` is now the one that is read.

## Dependencies and order

**Waits on:** nothing. Both lock projects are in.

**Ships with:** the shared-planners release. Its step table already places Stage A's step after the
job reshape and Stage B's after Stage A's.

**Coordinates with:** job-document-drafts (the completion field, `includedInGroup`);
document-defaults (`Upgrader.Group` runs only in the `schemamaint` drain; `groups_get.go` does not
call it); shared-planners (the schema version rule); the archive restore path under
`services/api/v1endpoints/archivedjobs/`.

**Recommended next slice.** Stage A's release step, written and run as a dry run against the
restored snapshot. It needs only the disagreeing-copies decision, it writes nothing, and its counts
are the measurement the plan has been owed since Phase 1 — how many jobs the defect orphaned. The
SPA reads follow, and the schema version decision can be taken while they are written.
