# Archive and statistics API (draft for `backend/api/archive.md`)

**Draft, not live SoT.** Promoted into `technical-documentation/backend/api/archive.md` when
[archived-jobs-stats](../plan.md) closes, with a row added to
[backend/api/contents.md](../../../backend/api/contents.md). Written in the live voice — current
behaviour only. Provenance: [overlay.md](../overlay.md) §§ Stage D, Stage F, Stage G, Stage I.

---

Live SoT for reading the archive and the figures derived from it. Code:
[`services/api/v1endpoints/archivedjobs`](../../../../services/api/v1endpoints/archivedjobs/),
[`services/api/v1endpoints/statistics`](../../../../services/api/v1endpoints/statistics/). How the
figures are produced → the worker statistics topic. Storage → [shared/mongo.md](../../../backend/shared/mongo.md).

## Routes

| Method | Path | Serves |
|--------|------|--------|
| `PUT` | `/api/v1/archived-jobs` | archive a batch of jobs |
| `GET` | `/api/v1/archived-jobs` | a paged, filtered list of summaries |
| `GET` | `/api/v1/archived-jobs/{jobID}` | one full archived document |
| `POST` | `/api/v1/archived-jobs/{jobID}/restore` | restore one job |
| `POST` | `/api/v1/archived-jobs/groups/{groupID}/restore` | restore a group, rebuilt from its jobs |
| `POST` | `/api/v1/archived-jobs/related/{jobID}/restore` | restore a set walked over the archive |
| `PATCH` | `/api/v1/archived-jobs/{jobID}/filing` | file a job's figures by hand |
| `PATCH` | `/api/v1/archived-jobs/groups/{groupID}/filing` | the same, for a group |
| `PATCH` | `/api/v1/archived-jobs/related/{jobID}/filing` | the same, for a related set |
| `GET` | `/api/v1/statistics/{owner}/timeline` | monthly figures |
| `GET` | `/api/v1/statistics/{owner}/timeline/items` | the same, per item |
| `GET` | `/api/v1/statistics/{owner}/totals` | lifetime totals; `?summary=1` folds the archive into one row |

## The owner in the path

`{owner}` is an **owner handle** — `account:{id}` today. The router parses it and answers 404 for a
handle it cannot read; each handler then compares it with the session and answers **403** for an owner
the session does not hold. A kind that is routable but not served — `corporation:`, `planner:` — is
refused there rather than falling through to the caller's own account.

The check lives in the handler rather than the router because it compares against the session the auth
middleware resolved: rejecting earlier would answer 403 where these routes answer 401.

An account may read only itself. That comparison becomes a grant lookup when shared planners land, and
nothing else about the shape changes.

## What a list row carries

A summary is assembled from two collections: the archived job for its identity and dates, and its
statistics row for its figures. Rows report both the group they belonged to and the related set they
are part of, because those are different questions — a group is what a user put together, a related
set is what parent/child links make.

Filters narrow a window, they do not define one. A row whose figures have not reached the aggregates
yet is marked pending; one whose job the reduction cannot read is marked stale, and stale outranks
pending on a row that is both — one resolves itself in seconds and the other does not resolve at all.

## Restore is one server-side operation

The order is the reverse of archiving and it matters:

1. Decrypt the stored identity.
2. Resolve ESI links against what the account already holds.
3. Write the job documents back to the planner.
4. Re-link free ESI ids on the account.
5. Return the jobs to their groups.
6. Delete the archived documents.
7. Queue the fold that takes the figures back out.

Each job rejoins the group it was archived from, merging into it when that group is still on the
planner and rebuilding it from every job that names it when it is not. A group another session holds
refuses the restore: the group's lock stands for its archived members.

Conflicts are reported, not fatal. An ESI id another job now holds is stripped from the restored job
and named in the response, rather than refusing the job or silently dropping the link.

The ESI re-link is written **server-side**. The `accounts` document is realtime synced, so a server
write reaches the client's store before it would next save — which is what lets restore stay atomic
rather than splitting the job write and the re-link across two processes.

## Groups are rebuilt from their jobs, not stored

A group is derived from the jobs that name it, so restoring one does not need a stored copy. Derivation
has one owner on each side — `models.Group`'s `RebuildFrom` and `AddJobs` here, `createGroup` and
`addJobsToGroup` in the SPA — and a shared corpus at `testing/fixtures/group-derivation` defines the
rules both read. The corpus is the rule: a change to what a group derives goes there first.

While a job is archived the group keeps it in `archivedJobIDs` and drops its contribution from the
derived sets until it comes back. Archiving a whole group deletes it.

## What a period cost

A month carries the six components of a period's cost and its extras by category. The Market segment is
decided on evidence — a job that left no sale behind is Stock, and broker fees count as market activity
— rather than on a stored flag, because nothing attributes a stack in a hangar to the job that built it.

**Kept as stock** is a quantity, not a classification: `quantityProduced − quantitySold`, floored at
zero because a month can settle a sale against an earlier month's build. Chain output is excluded
unless an item view asks for the chain.

## Topic-only detail

How figures are produced, queued and reconciled → the worker statistics topic. Owner block, index rules
and collection naming → [shared/mongo.md](../../../backend/shared/mongo.md). The pages that read these
routes → [frontend/](../../../frontend/contents.md).
