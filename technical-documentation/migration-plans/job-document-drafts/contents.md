# Job document drafts

## Owns

How a job is **shaped when stored** and **held while it is being edited** — so that a change to a job
is a set of changed fields rather than a rebuilt object.

- **The job document's shape**: row collections keyed by the id they already carry instead of stored as
  arrays; derived figures removed from storage; `rawData` leaving the document; `layout` split between
  per-reader view state and the planning decision hiding in it; an owner stated once rather than as a
  character/corporation pair beside the flag that already discriminates them; and the archive fields
  living in a block a live job does not carry.
- **How the SPA holds a job while it is open**: an untouched base, an ordered log of what the player
  changed, and a draft derived from the two — replacing the reducer that rebuilds a `Job` instance on
  every edit.
- **What the `Job` class is for** once state is plain data: normalisation as a function, derived figures
  as pure functions of the slices they read, and mutation methods as commands that emit changes.
- **Undo and redo** inside an edit session: what one undo step is, how a command groups the changes it
  made, and how an entry inverts.
- **The line between a change and a question** — a player twisting a figure to see the outcome, held
  apart from the changes they mean to keep, generalising what the speculative child job map does for one
  panel today.
- **What happens when another member's change arrives mid-edit** — the base is replaced and the log is
  re-applied over it, and a change to a field the reader is editing is the one case that surfaces.
- **Reading a job and changing one as one mechanism** — reading is the case where the log is empty, and
  holding the lock is a separate axis from having changes — and what each surface shows while changes are
  uncommitted.
- **That one writer at a time stays the isolation mechanism** — what the layers may and may not assume
  about the document lock, which inbound changes reach a job whose lock is held, and what "read-only"
  narrows to.
- **Drafting against a job somebody else holds** — the lock gating writing rather than editing, and what
  a drafter's log is reviewed against when the lock frees.
- **Which release carries the reshape, and by which of its mechanisms**: the document rewrite rides the
  shared-planners release — as a `prepareRelease` step inside the window, or as a fan-out command ahead
  of it taking its own copy, which the plan leaves open.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **What a write does with the change set** — field-scoped `$set` on the wire, what a conflicting write
  is answered with, the document version, and how broad the document lock has to be →
  [document-write-granularity/contents.md](../document-write-granularity/contents.md). This project
  produces a change set the client can name; that project decides what the server does with one. Stage C
  there consumes what Stage 3 here produces.
- **Per-owner delivery ordering, the position token, the owner-scoped baseline and `session_resume`** →
  [shared-planners/plan.md](../shared-planners/plan.md) § Stage G. The rebase in § A change arriving
  mid-edit assumes inbound documents arrive in order; it does not establish that they do.
- **The release machinery itself** — `prepareRelease`'s step list, the backup-and-revert pair, and
  `rewriteOwnerScopedIDs` → [shared-planners/contents.md](../shared-planners/contents.md). This project
  adds its rewrite to one of them; it does not own either.
- **What a document is born with and what a read normalises** — server-side defaults for a job and a
  group, and the upgrader on the read path →
  [document-defaults/contents.md](../document-defaults/contents.md). That project owns the machinery
  that fills a shape and the schema version bump that carries it; this project decides which fields the
  shape has. Both change `models.Job` in the same window, and § What this project inherits says how they
  divide.
- **Speculative child jobs, the Planning panel split, and the selling figures quoted at plan time** →
  [planning-stage-panels/contents.md](../planning-stage-panels/contents.md). Those panels are readers of
  the draft; this project changes how they read, not what they ask.
- **The close-time cascade** — `getAllRelatedJobs`, the parent/child recalculation and the group write.
  It stays as it is. This project makes the cascade's output field-scoped per document; it does not
  change which documents the cascade reaches.
- **The remaining effect-driven state findings** — the signal sent by bumping a counter, the seeded
  price entry rows, and the fetch that belongs in React Query →
  [effect-state-sync/contents.md](../effect-state-sync/contents.md). That project's settled answer was
  that most findings are corrections where they stand. One item it disclaims is the Edit Job reducer's
  in-place mutation of `state.activeJob`, which **this project resolves** — § Undo requires every write
  to go through the store, because a mutation destroys the before-image an undo entry needs. Its pointer
  for that item names a different project and wants correcting.
- **Live SPA and backend behaviour**, promoted only when this project closes → [frontend/](../../frontend/contents.md),
  [backend/](../../backend/contents.md).

## Task map

| I need to… | Read |
|------------|------|
| Understand what the edit page does today and what it costs | [plan.md](./plan.md) § Starting position |
| See the numbers behind that | [measurements/inventory.md](./measurements/inventory.md) |
| Know why this ships with the shared-planners release | [plan.md](./plan.md) § Why the window decides the order |
| See what this project depends on | [plan.md](./plan.md) § What this project inherits |
| See what waits on this project | [plan.md](./plan.md) § What depends on this |
| Understand base, log, scratch and draft | [plan.md](./plan.md) § How a job is held while it is open |
| See how a component reads a job under that design | [plan.md](./plan.md) § What a component actually reads |
| Find the document shape changes and why each one is there | [plan.md](./plan.md) § The document shape |
| Understand what undo costs and what it constrains | [plan.md](./plan.md) § Undo |
| See how experimenting with a job stays out of its changes | [plan.md](./plan.md) § A what-if is not a change |
| Follow the worked case of stepping a built job back to look | [plan.md](./plan.md) § The worked case: stepping a built job back to look |
| Know what this project assumes about the document lock | [plan.md](./plan.md) § The lock is the isolation, and it stays |
| See how a member works on a job somebody else is holding | [plan.md](./plan.md) § Drafting without the lock |
| Understand what happens to a draft when the lock frees | [plan.md](./plan.md) § The merge, when the lock frees |
| Know what happens to the `Job` class | [plan.md](./plan.md) § What happens to the classes |
| See what happens when another member saves mid-edit | [plan.md](./plan.md) § A change arriving mid-edit |
| See how watching a job and editing one relate | [plan.md](./plan.md) § Two readers of one job |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| See the stages and their order | [plan.md](./plan.md) § Stages |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See what has been decided | [plan.md](./plan.md) § Settled |
| See what is still undecided | [plan.md](./plan.md) § Open questions |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
