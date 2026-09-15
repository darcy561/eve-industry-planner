# Job groups

## Owns

What a job group **is** as a stored thing, and who is allowed to write it.

- **The group document's shape** — the fields that survive, and the derived sets that come off it.
- **Where membership lives**: `job.groupID` as the one fact saying which group a job is in, and the
  removal of the group's own copy of that list.
- **What a group card shows without loading its jobs** — the output type icons, authored at creation
  from the same jobs the group name is built from.
- **How a group is created** — one request carrying the group and its member jobs, and the retirement
  of the `/group/new` placeholder route and its poll.
- **What the SPA's `Group` class is for** once nothing on it is derived, and the persist queue that
  exists only to batch derived rewrites.
- **The repair of groups already damaged** by the client-authored membership defect.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **How a write is shaped**, whether a conflicting write is refused, and **how broad the document lock
  is** → [document-write-granularity/contents.md](../document-write-granularity/contents.md). That
  project's § Stage D deletes the group lease over member jobs and the cascade that reads
  `IncludedJobIDs`; this project must not move that code first. See [plan.md](./plan.md) § What this
  project waits on.
- **What the lock is namespaced by** → [shared-planners/plan.md](../shared-planners/plan.md) § Stage H.
  A group lock that does not contend between two members is that project's problem, not this one's.
- **The defaults a document is born with, and the upgrader on the read path** →
  [document-defaults/contents.md](../document-defaults/contents.md). This project decides which fields
  exist on a group; that one owns the mechanism that fills and upgrades them.
- **The job document's own shape** → [job-document-drafts/contents.md](../job-document-drafts/contents.md).
  This project adds nothing to a job: `groupID` is already stored. It only stops writing the second copy.
- **Rebuilding a group for the archive** → [archived-jobs-stats](../accounts-page/archived-jobs-stats/contents.md).
  `RebuildFrom` serves that path and is not deleted by this project.
- **The group page, scheduler, name panel and dependency tree** → live SoT under
  [frontend/group/contents.md](../../frontend/group/contents.md). Their behaviour does not change; what
  they read it from does.
- Live SPA and backend behaviour, promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand why a group is destroyed on save today | [plan.md](./plan.md) § The defect |
| See what the group document becomes, and why each field goes | [plan.md](./plan.md) § What the group document becomes |
| Know why the card's icons became the outputs | [plan.md](./plan.md) § The icons are the outputs |
| Know where membership lives now | [plan.md](./plan.md) § Membership is the job's fact |
| Understand why creating a group needed a placeholder page | [plan.md](./plan.md) § Creation is one request |
| Know what has to land before any of this starts | [plan.md](./plan.md) § What this project waits on |
| See why a read-time aggregate was rejected | [plan.md](./plan.md) § What this costs to read, and [measurements/group-shape.md](./measurements/group-shape.md) |
| Find the real distribution of group sizes | [measurements/group-shape.md](./measurements/group-shape.md) |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| See the stages and their order | [plan.md](./plan.md) § Stages |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
