# Document defaults

## Owns

Where a stored document's shape is decided when the client did not decide it — the defaults a document
is born with, and the normalisation every read applies before a caller sees it.

- **Server-side defaults for a job and a group.** `DefaultUserAccountDocument` and
  `DefaultApplicationSettings` exist for the documents the server creates at first login; the documents
  the planner creates have no counterpart, and their defaults live in the SPA's `Job` constructor.
- **The upgrader on the read path.** `Upgrader.UserAccountDocument`, `.ApplicationSettings` and
  `.PlannerSettings` run on every read; `.Job` and `.Group` run only in the offline `schemamaint`
  drain, so a job is handed to a caller exactly as stored.
- **The extras category id space** — what a category is identified by, and what an extra filed under
  none carries.
- **The schema version bump** that converges both, and the release step that carries it.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **How a change is written** — whole-document `$set` versus field-scoped writes, what a conflicting
  write is answered with, and how broad the document lock has to be →
  [document-write-granularity/contents.md](../document-write-granularity/contents.md). That project
  owns the write shape; this one owns what the shape is filled with.
- Statistics rows and their derived extras totals → [archived-jobs-stats/contents.md](../accounts-page/archived-jobs-stats/contents.md).
  A row is rebuilt from the job, so it follows what this project settles rather than being changed by it.
- The dead `apiJobs` / `apiOrders` / `apiTransactions` fields the sweep found in every job document.
  No project owns them; they are named in [plan.md](./plan.md) § Non-goals so the finding is not lost.
- JSON tag semantics, `omitempty` versus `omitzero`, and `encoding/json/v2` →
  [backend/shared/jsoncodec.md](../../backend/shared/jsoncodec.md). The tag rule there and the tags this
  project touches interact; neither owns the other.
- The model parity sweep that measures all of this → live SoT at
  [testing/harness.md](../../testing/harness.md) § Model parity. This project reads its output; it does
  not own the tool.
- Live job / group / settings behaviour → [backend/](../../backend/contents.md) (promote target).
- SPA class shapes → [frontend/](../../frontend/contents.md) (promote target).

## Task map

| I need to… | Read |
|------------|------|
| Goals, tracks, done-when, open decisions | [plan.md](./plan.md) |
| What the live corpus actually holds, measured | [plan.md](./plan.md) § What the documents actually hold |
| Why the read path is the gap | [plan.md](./plan.md) § Track A |
| The extras category id decision and its migration | [plan.md](./plan.md) § Track B |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
