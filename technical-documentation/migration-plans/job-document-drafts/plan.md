# Job document drafts — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and — for the surfaces this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
and [`../../backend/technical-rules.md`](../../backend/technical-rules.md).
Phase 1 (project folder and docs) before any product work.
Go surfaces are in scope — the release migration in `services/core/commands` — so `go fix -diff` runs
against that package only, before the work and again on what was edited.
Live SoT will not be edited until this project is complete and promotion is approved.

**`go fix -diff ./commands/...` at Phase 1:** five files in scope, none of them the release migration
itself — `interface{}` → `any` in `cli/asynq_purge.go`, `cli/asynq_queues.go`, `cli/sde_lock.go` and
`cli/sde_version.go`, and a manual loop that `slices.Contains` replaces in
`live_rewrite_owner_scoped_ids_test.go`. The last is also named at
[document-defaults](../document-defaults/plan.md) Phase 1; whichever project reaches it first takes it.
None blocks Stage 2, and none is in the file this project will edit.

## Goal

A change to a job is **the field the player changed**, from the moment they change it: held as such
while the editor is open, undoable as such, and handed to the write path as such.

Today a change to a job is a whole rebuilt `Job` instance. Everything downstream — the re-render, the
discard, the save, and the lack of an undo — follows from that one decision.

## Starting position

The measurements are in [measurements/inventory.md](./measurements/inventory.md). The three findings
that matter:

**The instance identity is the change signal.** Every derived figure on `Job` is a getter, which is
deliberate and documented — a figure cannot fall behind what it is derived from. The consequence is
that the only way to invalidate one is to hand out a new object, so `UPDATE_ACTIVE_JOB` does
`new Job(payload)` on every edit. Call sites mutate the live instance and pass it back to the reducer
purely to get a fresh identity. One typed material cost rebuilds every setup, material, market order,
transaction, broker fee, extras cost and invention entry on the job.

**Nothing subscribes narrowly.** The editor's state and actions arrive by prop spread through the step
selector, 56 files under `Edit Job` read `state.activeJob`, and there is not one `memo` in the tree.
Even a free rebuild would re-render the same surface. The rebuild is the visible cost; the prop-wide
subscription is the one that sets the size of the re-render.

**The editor can already express "what changed" — for half the job.** `parentChildToEdit` and
`esiDataToLink` are genuine add/remove change sets. The job's own fields have no equivalent: they are
tracked by one sticky `jobModified` boolean, and discard is a second whole copy of the job parked in a
ref. That asymmetry is why the save path can only send the whole document.

## Why the window decides the order

The document reshape below is migrate-required. Arranging a migration is the expensive part and
extending one is nearly free, so a stored-shape change is timed to a release that is already rewriting
documents rather than planned as work that has to justify a migration of its own.

The shared-planners release is that window: the stack is down, nothing reads or writes while the data
work runs, and every collection it writes to is copied first so a command can put the copies back.

**Which of that release's two mechanisms the reshape uses is not yet decided**, and the difference is
real:

- **A `prepareRelease` step**, like `stampMetaOwner`. Runs inside the window, inside the release's own
  copy, and `revertRelease` undoes it. Suits a cheap server-side pipeline; a step that takes a long time
  puts the window at the mercy of how long it takes.
- **A fan-out command run before the window**, like `rewriteOwnerScopedIDs`. That one is deliberately
  *not* a step — it moves every document in the largest collections in the database, so it runs ahead of
  the window over live traffic and `prepareRelease` only carries `verifyOwnerScopedIDs`, the check that
  it finished. A command in this position **takes its own copy of its own collections**, because the
  release's copy is taken later and would otherwise record the rewritten state as the thing to revert to.

Which one the reshape needs depends on whether array-to-map conversion is expressible as a server-side
`$set` pipeline or has to read each document to rebuild it. That is the first thing Stage 2 establishes,
and it is an open question below rather than an assumption to build on.

**Either way the reshape ships with shared planners, or it waits for the next release that migrates
documents.** That is the constraint the stage order below is built around: everything that has to be in
the window is at the front, and everything that does not is deliberately kept out of it.

## What this project inherits

Items decided elsewhere. They may still move; anything here that depends on one is written as an
assumption to re-verify rather than as settled fact.

| Inherited | Where it is decided | What this project assumes |
|-----------|---------------------|---------------------------|
| The release window itself | [shared-planners](../shared-planners/plan.md) § Live data | That one release takes the stack down to do data work, and a job document rewrite can ride it — either as a `prepareRelease` step or as a fan-out command ahead of the window |
| Backup and revert over the reshaped collections | Same | That whichever mechanism carries the reshape copies the collections it writes **before** writing them, and that `revertRelease` restores what was copied. A pre-window command must take that copy itself |
| Per-owner delivery ordering | [shared-planners](../shared-planners/plan.md) § Stage G | That inbound documents arrive in order. The rebase in § A change arriving mid-edit is worth nothing applied to a stale document that overtook a newer one |
| A version on the document | [document-write-granularity](../document-write-granularity/plan.md) § Stage A | That a client can eventually learn its base went stale. Until it exists, the rebase is best-effort and the collision check reports rather than protects |
| Field-scoped writes on the wire | Same, § Stage C | That the change set this project produces is what that stage sends. Stage 3 here is that stage's client half; neither is useful alone |
| Delta delivery and the client apply | Same, § Stage E | That an inbound change can arrive as changed paths rather than a whole document, and that a gap in the stream is detectable. § Two readers of one job works on whole documents as delivered today and gets granular for free when that stage lands |
| The schema version bump and the read-path upgrader | [document-defaults](../document-defaults/plan.md) | That `models.Job` gets a version and an upgrader entry in this same window. This project says which fields exist; that project owns what fills them and what a read normalises |

**The dependency runs both ways with `document-defaults`, and that is deliberate.** Both projects change
`models.Job` in one release. Splitting them by mechanism rather than by field is what keeps them from
colliding: that project owns *defaults, normalisation and the version*, this one owns *which fields are
stored at all*. A field this project removes is one that project then has no default for, which is the
correct outcome and needs saying in both plans.

## What depends on this

§ What this project inherits lists what this project waits on. The traffic runs the other way too, and it
is worth stating because it changes the order the neighbouring plans are worth taking in.

| What needs this | Which stage supplies it |
|---|---|
| [document-write-granularity](../document-write-granularity/plan.md) § Stage C, field-scoped writes | Stage 3. The log is the change set that stage sends; without it the client has nothing field-scoped to offer |
| Same, § Stage E, delta delivery and client apply | Stage 3 for an open editor, Stage 5 for the store. A delta needs something to apply onto, and a whole-document store is not it |
| Same, § Stage B, a refused write reaching the user | Stage 3, partly. It does not fix the gate, but per § What drafting settles for the write path it changes what the gate costs when it fires |

**Nothing upstream blocks Stages 1, 3, 4 or 5.** Every dependency in the inherits table is about making a
later stage *safe* or *complete*, not about making it buildable: the rebase works without a document
version and is simply best-effort until one exists; the layers work on whole-document delivery and get
granular for free when delta delivery lands. Stage 2 is the exception, and what it waits on is a release
window rather than another project's stage.

**One ordering preference rather than a dependency:** [document-defaults](../document-defaults/plan.md)
Phase A2 moves the SPA's defaults and aliases into the server's upgrader, so a job arrives already
normalised. Taken before Stage 5, it leaves the SPA's `buildJob` nearly empty and makes the class removal
smaller. Taken after, both projects rewrite the same normalisation in turn. Neither blocks the other.

## How a job is held while it is open

Three layers and the view derived from them, each read by one thing:

```
base       jobID → the document as loaded or last received. Never written to.
log        what the player changed:  { seq, command, jobID, patches[], inversePatches[] }
scratch    what the player asked about: the same entry shape, never saved
draft      jobID → base with the log and then the scratch applied
```

`draft` is what components read. `log` is what undo and the save read. `scratch` is read through the
draft and by nothing else — it exists to change what is on screen and never to be collected, per § A
what-if is not a change. Each entry comes from the `produce` call at the moment of the edit.

An edit session is **not one document**. Linking a child job writes the child's `parentJobs`, and close
time recalculates the related tree. So `base` is a map of job id to document and every log entry names
the job it changed — which is also what makes the eventual write field-scoped *per document* rather
than per request.

### What a component actually reads

An ordinary plain job object. The merge is not resolved per read.

Applying a change returns a new root, but every subtree the change did not touch is the **same object
by reference**. Editing a run count gives new objects for `draft`, `draft.build`, `draft.build.setup`
and `draft.build.setup.<id>` — and leaves `draft.build.materials`, `draft.build.sale` and
`draft.layout` referentially identical to the ones in `base`.

That referential stability is the subscription mechanism. A material card selecting its own row gets an
unchanged reference, the store's equality check passes, and it does not re-render — with no `memo`, no
path strings at the call site, and no hand-written change check. The panel holding the edited setup
re-renders; nothing else does.

The cost of an edit becomes proportional to the **depth of the path edited**, not to the size of the
job.

### Where a whole job is still materialised

Three places, and only three: a derived figure that reads many paths and is memoised on the subtree it
reads; the save, which is the only reader that cares about paths as strings; and a caller that wants a
whole job, such as the dependency tree or the shopping list, which gets plain data.

## The document shape

Six changes. The first four reduce how many paths a single player action has to touch, which is what
makes the log short enough to reason about and the undo entries small enough to invert. The last two
say each fact once, in the place it belongs. Both surfaced as fields whose zero had to be suppressed
to keep the wire unchanged — the tag rule that decides which is in
[backend/shared/jsoncodec.md](../../backend/shared/jsoncodec.md) § The `json` / `bson` tag pair.

### Row collections become id-keyed maps

Everything a patch needs to address already carries an id and is stored as an array anyway:

| Collection | Key it already carries |
|---|---|
| `build.materials` | `typeID` |
| `build.materials[].purchasing` | `id` |
| `build.costs.extrasCosts` | `id` |
| `build.costs.inventionEntries` | `id` |
| `build.costs.linkedJobs` | `job_id` |
| `build.sale.marketOrders` | `order_id` |
| `build.sale.transactions` | the transaction id |
| `build.sale.brokersFee` | the fee's own id |

`build.setup` is already a map keyed by `id` — the one that got it right, and the shape the rest move
to. `build.materials.4.purchasing.2.itemCost` becomes `build.materials.34317.purchasing.<uuid>.itemCost`:
stable under another member's concurrent insert, and expressible as a Mongo `$set`, which an array index
is not. Where display order matters it becomes an explicit field or a sort at render.

### An owner is stated once, not four ways

`LinkedESIJob`, `MarketOrder` and `Transaction` each carry four fields for one fact:

```go
// MarketOrder and Transaction:
CorporationID  int    `json:"corporation_id,omitzero" bson:"-"`
CorporationRef string `json:"-"                       bson:"corporation_ref,omitempty"`
CharacterID    int    `json:"character_id,omitzero"   bson:"-"`
CharacterRef   string `json:"-"                       bson:"character_ref,omitempty"`

// LinkedESIJob, whose corporation id is not held out of storage by its tag:
CorporationID  int    `json:"corporation_id,omitzero" bson:"corporation_id,omitempty"`
```

That last line is the asymmetry. `MarketOrder` and `Transaction` keep a raw id out of Mongo
structurally, by `bson:"-"`; `LinkedESIJob` relies on `jobidentity.Encrypt` zeroing the id after
deriving its ref, so `omitempty` finds nothing to write. Both are empty in practice today, but one is
guaranteed by the type and the other by a function every write path has to remember to apply.

The id/ref split is deliberate and stays: ids face the client, refs are what is stored, which is the
entity-id encryption boundary. What is redundant is the pair. Exactly one of character and corporation
is ever set, and each struct **already carries the discriminator** — `IsCorporation` on the first two,
`IsCorp` on `Transaction`. So the type cannot express its own invariant, and every reader re-derives it.

One id and one ref, read through the flag already beside them. The invariant stops being a convention.

The cost is the SPA: `corporation_id` appears in 71 of its files and `character_id` in 15, and
`marketOrder.js` writes them back out through `toDocument()`, so this is a wire change with a client
migration rather than a storage change alone. `models.Owner` is deliberately **not** the answer here —
these structs speak ESI's vocabulary, which the SPA and ESI both read, and translating at this layer
would put a boundary in the middle of an ESI mirror.

### Archive metadata is not a live job's

`JobMetaData` carries five fields that only mean anything once a job has been archived:

```go
ArchivedAt, ArchivedBy, ArchiveProcessed, DeletedAt, DeletedBy
```

Every writer of them is in the archive path — `putHandler` stamps, `restore` clears, the statistics
rota reads. An ordinary job carries all five as absences. The archived copy is the same shape as a job;
only the meta differs, so the fix is a block on `_meta` that is simply absent until a job is archived,
not a second type.

That block is where `archiveProcessed` stops needing `omitzero` at all: a nil block omits under either
engine.

The cost is that `_meta.archivedAt` is queried, sorted and indexed — `archivelist.go` maps the API's
`sort=archivedAt` onto it and filters on it, `backfill_archived_at` filters on it in three forms, and
one of the 26 application indexes is on it. So the path change carries an index change and a public
sort parameter with it.

### Stored derived figures come out

A setup stores `materialCount`, `estimatedTime`, `rawTime` and `estimatedInstallCost`, all recalculated
from the run count, ME, structure and system index it sits beside. Stored, one changed run count has to
write five paths, any of the four can disagree with its inputs, and two members can hold different
values for a number neither of them chose.

`Material.quantity` already does this correctly — a getter over the setups' `materialCount`, absent from
the document. That is the model.

**The rule this project writes down: a stored field exists only for something a person decided.** A
derived figure is never stored, so it never appears in a patch, never conflicts, and never needs an undo
entry.

`rawData` goes for a different reason: it is the blueprint recipe from the SDE, identical for every
player holding that blueprint, copied into every job document and re-sent on every write. It is not the
player's data and does not belong in the player's document.

### The document splits by who writes it

`build` currently mixes three kinds of field with three different write rules:

| Zone | Fields | Write rule |
|------|--------|------------|
| Decisions | setups, material purchases, extras costs, invention entries, the sale plan, price overrides | Patchable, undoable, checked for collision |
| Observations | linked ESI jobs, market orders, transactions, broker fees | Sourced from ESI, replaced wholesale by a refresh, never hand-edited |
| Derived | totals, requirements, install costs, times | Not stored |

`updateLinkedJobData` overwrites the observation rows on every refresh. Sharing a zone with decisions
would make the log carry entries no player created, and force undo to decide what unwinding an ESI
refresh means. Separating them means it never comes up.

### `layout` stops existing

`layout` is a bag holding three unrelated kinds of thing, and reading each one to its home empties it:

| Field | What it actually is | Where it goes |
|---|---|---|
| `materialPriceOverrides` | What the player decided a material is priced at | `build`, with the other decisions |
| `localMarketDisplay`, `localOrderDisplay` | A **per-job override** of the account's default market hub and order type | `build`, for the same reason |
| `esiJobTab` | Which tab this reader had open | Dropped — `applicationSettings.esiJobTab` already holds it at account level |
| `setupToEdit` | Which setup card is selected | Dropped — editor session state, held by the draft store and re-derived on open |
| `resourceDisplayType` | Nothing. No consumer reads it | Dropped |

**The two market fields are the surprise.** They read as view state from their names and their
neighbours, but `useEffectiveMarketHubFromLayout` resolves each as `job ?? account default`, and
`useStripRedundantJobMarketHubOverrides` exists to clear a job's value once it matches the account's. A
field with a hook dedicated to keeping it only while it differs is an override, and an override of a
pricing basis is a decision about the job. They belong with `materialPriceOverrides`, not in settings and
not deleted.

**`esiJobTab` is a duplicated source of truth** — the account-level setting already exists and the job
carries a second copy. On a shared planner that copy is two members overwriting each other's open tab, in
a document write, over the websocket.

**`setupToEdit` costs one behaviour change**: reopening a job selects the first setup rather than the one
last edited. It is also what `setupToBuildFrom` reads to decide which setup a new one copies, so that
falls back to the first as well.

Nothing is left, so `layout` goes with them.

## Undo

Undo is why the log is a log. Four consequences, and they are constraints on the design rather than
features added to it.

**An entry carries its before-image.** The inverse of setting a path is setting it back, and the old
value is unrecoverable once the edit lands. `undefined` cannot quietly mean "unset" either, or removals
will not invert — an entry names its operation.

**An undo step is a command, not a field write.** Importing a purchase touches purchases, remaining
quantities and cost rows together. Undo per path would unwind a third of what the player did, and they
would stop trusting it immediately. Entries group under a named command, which also supplies the UI copy:
*Undo: link market order*.

**Typing coalesces.** Same path, same command, inside a short window merges, keeping the oldest
before-image. Otherwise a cost field produces twenty undo steps.

**Edits stop mutating the live instance.** Today a call site mutates the instance and dispatches it back,
which destroys the before-image before anything can record it. Every write goes through the store. This
is the same discipline the narrow subscriptions need, so it is not an extra cost — but it is a hard
constraint, not a preference.

**Scope: session-local and pre-save.** Undo unwinds the log down to the base and dies when the editor
closes. Undo *after* a save is a different feature needing a compensating server write and an answer for
what a co-member did in between; it is a non-goal here. Redo is nearly free — undone entries move to a
forward stack, discarded at the next new edit.

The two intent sets do not invert by data. "Add child job" also created a job and wrote the child's
`parentJobs`, so `parentChildToEdit` and `esiDataToLink` keep an explicit inverse action each rather than
an inverse patch. There are a fixed few of them and they already exist as discrete reducer actions.

## A what-if is not a change

A player twisting a run count to see what the cost does is asking a question, not editing the job. Under
one log those are the same act: the experiment counts as a pending change, marks the job modified, goes
to the save, and — once a planner has more than one member — is a path a co-member's change can collide
with. That is the wrong answer to all four.

**The distinction already exists in the code, for one case.** Speculative child jobs are held in their
own map, and the reducer says why: costing a row is a question the player asked, not a change to the
job, and nothing there is persisted. This project generalises that from a special case for one panel
into a layer.

**`scratch` sits above `log`, and the difference is what each is allowed to reach:**

| | `log` | `scratch` |
|---|---|---|
| Marks the job modified | Yes | **No** — modified is `log` being non-empty, never `draft` differing from `base` |
| Goes to the save | Yes | **Never** |
| Undoable | Yes | Yes, by the same mechanism |
| Checked against an inbound change | Yes | **No** |
| Survives closing the editor | Saved or discarded | **Dropped** |

**An experiment is not disturbed by a co-member's change**, because `scratch` is the topmost layer. An
inbound change to a path being experimented on lands in `base`, underneath, and the what-if value still
wins. Nothing prompts, because a scratch entry is not a claim about the document — it is a question
about it. The *outcome* of the experiment does move, which is correct: the question is what would happen
to the job as it now stands.

**Promotion is moving an entry between layers.** "Actually, keep that" moves a scratch entry into the
log; "leave that for now" moves it back. They are the same entry shape, so neither costs anything, and
both are why the layers are two lists rather than a flag on one.

**What the UI owes.** A figure on screen that comes from a what-if must say so, and there must be one
obvious way out of it. Without that a player reads a build cost that is not their build cost — which is
worse than not having the feature.

**What this is not.** One what-if at a time over one job, not two scenarios side by side. Nor is it what
several setups already do: those are additive rather than alternative — `materialRequirement`,
`totalJobSlots` and `totalQuantityProduced` all sum across every setup on the job — so a second setup is
a second production line the player intends to run, not a variant to compare against the first. Whether
comparing two scenarios side by side is wanted at all is a product question this project does not
answer.

### The worked case: stepping a built job back to look

A job sits at Building. The player opens it, moves it back to Planning, changes a few numbers to see what
it would have cost, and then decides whether any of it is worth keeping.

Today that is not available. `STEP_ACTIVE_JOB_BACKWARD` and the stepper's jump both mark the job
modified, so moving back *to look* arms the save prompt, and the only way out is discard — which is
all-or-nothing and, per § Two readers of one job, also reverts anything that arrived while the editor was
open. The player is using the escape hatch as the feature.

Under the layers it is ordinary. `jobStatus` goes into scratch like any other path, the editor renders
Planning, the tweaks land in scratch beside it, and every derived figure recomputes. Leaving scratch puts
the job back at Building with nothing changed, nothing modified and nothing to save. Anything worth
keeping is promoted into the log first, and the rest is dropped.

This works because `stepBackward` is a plain decrement with no side effects. A step change that *did*
have side effects would need those to be patches too — which is the substance of § Undo's rule that
edits stop mutating the live instance, seen from another direction.

## The lock is the isolation, and it stays

The property this project must not spend: **one writer at a time, and nothing leaves the editor until it
is submitted.** That is what the document lock buys today and it is the reason a player can take a job
apart to see what happens.

**"Read-only" narrows, and that is deliberate.** Today it means both *cannot commit* and *fields are
inert* — `useActiveJobReadOnly` feeds `disabled` at two dozen call sites. § Drafting without the lock
keeps the first meaning exactly and drops the second. What the lock protects is the document; inert
fields were never the protection, only the cheapest way to express it.

Nothing here relaxes it. With the lock held there are no inbound *edits* to the job being edited, because
there is no second writer — so the rebase in § Two readers of one job is, for that job, about the reader's
other tabs and about server-side writes rather than about a competing editor. The layers do not make a
job more exposed; they make what the editor already holds privately more precise.

**Inbound changes still reach a locked job**, from one direction: the observation zone. An ESI refresh
rewrites linked jobs, market orders and transactions under the reader while they work, and nothing about
holding the lock stops it. That is the case the rebase earns its place on even under the strictest lock —
those rows land in the base and the reader's own layers stay above them.

### Drafting without the lock

**The lock gates writing, not editing.** Anyone who can open a job can build a log against it; only the
holder can turn one into a write. That is the separation the lock should always have had, and the layers
make it free — a non-holder's draft is the same base, log and scratch as a holder's, differing only in
what it is allowed to reach.

**The holder is unaffected, which is what keeps the isolation intact.** Another member's draft never
touches their document and is never visible to them. It lands only through an ordinary locked write, made
later, by someone who by then holds the lock. Nobody sees anybody else's draft at any point.

What changes is what a non-holder is shown: fields become editable rather than inert, with the holder
named, and the save affordance becomes *merge when free* rather than a disabled save.

### The merge, when the lock frees

The drafter takes the lock — the waitlist and hand-over path already exists — and then reviews their log
against the job as it now stands. **Review is per command, not per path**, reusing the grouping § Undo
already requires: *set run count to 40*, *add purchase of 500 Tritanium*. Each is kept or dropped on its
own.

Four outcomes per command, three of them the collision cases from § Two readers of one job:

| Outcome | What it means |
|---|---|
| Applies clean | Nothing touched those paths while the draft sat. The common case |
| Already done | The holder made the same change. Drop it rather than rewrite an identical value |
| Conflicts | The holder set the same path differently. The drafter chooses |
| **Unapplicable** | The target is gone — the setup was deleted, the material is no longer on the job. Specific to drafting, because only a draft outlives the thing it addresses |

Unapplicable is the one that must be surfaced rather than handled. Silently dropping it loses work
without saying so; resurrecting the deleted target is worse, because it undoes the holder's change as a
side effect of applying something unrelated.

Because the drafter holds the lock by the time they merge, the merge writes through the ordinary save
path. No second write path exists for it.

### Drift is the cost, and it wants showing early

A draft is written against a base that keeps moving: every save the holder makes rewrites it underneath.
The longer a draft sits, the more of it can become unapplicable — an hour's work against a job the holder
has since restructured.

So the drift is shown **as it happens**, not discovered at merge time. A draft whose base has moved under
six of its commands should say so while the drafter can still decide it is not worth continuing. This is
the same obligation as the what-if marker in § A what-if is not a change: a reader must be able to tell
what they are looking at.

### What this is not

**Not collaborative editing.** No draft is shared, nothing merges automatically, and there is no
operational transform or conflict-free type anywhere in it. Two members drafting against one held job are
two independent drafts that never meet; whoever merges second rebases onto the first's result by the same
mechanism, reviewing it the same way.

**Scratch never merges.** Only the log is merge material — a what-if is dropped with the session whether
or not the lock ever frees.

### What drafting settles for the write path

[document-write-granularity](../document-write-granularity/plan.md) § Stage B's worst defect is a gate
that refuses a write and discards the edits without telling anyone. Under the layers there is nothing to
discard: the edits are the log, and a log that cannot be written is a log that waits.

**That covers more than deliberate drafting, and the other cases are the common ones.** The gate fires
whenever `canPersistJobClose` is false, which reaches people who were holding the lock perfectly
legitimately:

- **A lease that lapsed.** The extend loop only renews while the tab is visible, and the lease is five
  minutes. A holder who backgrounds the tab long enough comes back read-only.
- **A hand-over taken from another session**, which flips this tab to read-only mid-edit.
- **A job in a live group whose group lock is held elsewhere.** Holding the job's own lock is not enough:
  the gate consults the group's.

Each of those loses the player's work today, and none of them is the player doing anything unusual. They
are the reason this matters — deliberate drafting is the feature, but a lapsed lease is the bug it also
fixes. Fixing the gate itself is still that project's Stage B; this changes what the gate costs when it
fires.

**Where this meets [document-write-granularity](../document-write-granularity/plan.md) § Stage D**, which
exists to make the lock less broad: that stage lists three removals, and they are not the same kind of
thing. The group lease standing in for every job in it, and the all-or-nothing batch refusal, are about
the lock's **breadth** — one member editing one job should not lock a hundred. Whether a write path
consults the lock at all is about **concurrency** — whether two members may edit one job at once. This
project assumes the first two are wanted and the third is not, and says so here because that assumption
decides how much of Stage D is worth building — and § Drafting without the lock is what makes keeping the
third affordable, because being locked out stops costing anyone their work. Stage D's remaining scope is
that project's to settle; this plan records which half it is built on.

## A change arriving mid-edit

An inbound document replaces `base`; the log re-applies onto the new base.

```
base ────────────► base'          inbound document, wholesale
log     ──re-apply──►
scratch ──re-apply──► draft'       untouched by the rebase
```

The reader's edits survive because they were never in `base`. A collision is precise: a log entry whose
path is also in the inbound change is the one case to surface, and everything else re-applies silently.
A member changing the sale location while another edits run counts is invisible, correctly.

This is the shared-planner payoff, and it is unreachable from the current shape — today the two are a
whole-document race with no way to tell the two cases apart.

Until a document version exists ([document-write-granularity](../document-write-granularity/plan.md)
§ Stage A), the collision check reports what it can see. It does not make the write safe on its own.

## Two readers of one job

Reading a job and changing one are the same mechanism with one difference: whether the log is empty.

```
reading    base' = base with the inbound change applied      draft = base
drafting   base' = base with the inbound change applied      draft = base' + log
```

**Holding the lock is a separate axis**, and § Drafting without the lock is why: it decides whether a log
can be written to the server, not whether one exists. A lock holder who has changed nothing is reading; a
member with no lock who has changed something is drafting. The four combinations are all reachable and
all ordinary.

One apply path, one store, one set of selectors. A reader gets granular re-renders for nothing — a change
touching `build.sale` re-renders the selling panel and leaves the rest referentially identical, where a
whole-document replacement re-renders the page. No second code path for reading as against changing,
which is the strongest argument for this shape over merging inbound changes into one mutable copy.

**Revert means what the word says.** Discard today restores the copy taken when the editor opened, so
discarding your own change also discards any co-member change that arrived since and writes the old
value back over it. Dropping a log lands the reader on the current committed state with their own
changes gone and nobody else's — which is what discard should have always meant.

**A collision has three outcomes, not one.** Inbound paths intersected with log paths: disjoint is
silent and is the common case; the same path carrying the same value drops the log entry, because the
reader's edit has become redundant and keeping it would rewrite an identical value; the same path
carrying a different value is the only case that reaches the reader.

**A gap in delivery costs the editor nothing.** A client that detects one re-fetches the document
wholesale and re-applies its log onto it. That is only true while the log is re-appliable from a base
rather than incremental against the last state, which is a constraint on how entries are built rather
than a property that can be added later.

### What this settles for the write path

**A rebase makes field-scoped writes necessary rather than merely better.** After a rebase the reader's
local document carries a co-member's values in fields they never touched. Sending the whole document
asserts those values as the reader's own — an improvement on today, where the document sent predates the
co-member's change entirely, but still an assertion over fields nobody edited. Sending the log sends the
reader's fields and no others. The log is already the right payload for
[document-write-granularity](../document-write-granularity/plan.md) § Stage C; the rebase is what makes
it the only correct one.

**Edits refused by a lock are pending rather than lost.** That project's § A refused write is not
currently an outcome names the worst of its three defects: when the client's own gate says no,
`closeActiveJob` applies the edits locally and clears the pending writes, so no request is made, nothing
is shown, and the work is gone at the next reload. Under a log the edits *are* the log — a refusal
leaves them in place, and they are still there when the lock arrives. This does not fix that defect,
which is that project's to fix; it changes what the defect costs from work lost to work waiting.

## What happens to the classes

`Job` does three jobs, and they separate:

| Job it does | Becomes |
|---|---|
| State container | Gone. A patch addresses plain data by path, and a class instance with getters is the wrong thing to apply one to |
| Normalisation and defaults | A `buildJob(json)` function and its `toDocument` counterpart. Same code, same tests, no class |
| Derived figures as getters | Pure functions of plain data, cached per selector, recomputing when the subtree they read changes |
| Mutation methods | Commands that emit changes against a draft — and the natural home for the undo grouping |

Row classes are the last to go and may not need to: they are cheap and read only their own fields.

The blast radius is the reason this is staged rather than landed at once. `jobArray` holds `Job`
instances app-wide, not only while editing — see the counts in
[measurements/inventory.md](./measurements/inventory.md).

**Live SoT consequence, at promote:** [`frontend/technical-rules.md`](../../frontend/technical-rules.md)
§ Class members: getters and methods states the convention this replaces, including that derived values
are getters so a figure cannot fall behind. It is not edited while this project runs; it is rewritten in
the promotion drafts.

## Wire compatibility

| Surface | Verdict |
|---------|---------|
| Job document row collections (arrays → id-keyed maps) | **migrate-required**, one cutover, on the shared-planners release. Rollback is `revertRelease` over a copy taken before the rewrite writes — the release's own copy if the reshape is a step, its own copy if it runs ahead of the window |
| `rawData` and the stored derived setup fields | **Removal only.** Nothing needs an upgrader — the writer stops writing them and stored copies age out |
| `materialPriceOverrides` moving under `build` | **migrate-required** — rewritten in the same step as the row collections |
| `layout` removed, its two overrides moved under `build` | **migrate-required** for the move; the three dropped fields are removals needing no upgrader |
| `models.Job` schema version and upgrader entry | Owned by [document-defaults](../document-defaults/plan.md); this project supplies the field list that version describes |
| `PUT` of a job document | **Unchanged by this project.** The client keeps sending whole documents until [document-write-granularity](../document-write-granularity/plan.md) § Stage C; the change set exists client-side before anything on the wire uses it |
| Websocket job document delivery | **Unchanged.** The rebase applies to whole documents as delivered today |
| SPA store shape (`jobArray` holding instances) | Internal; no wire surface. Staged because of call-site breadth, not compatibility |

## Stages

Ordered so each is worth landing alone, and so everything needing the release window is in front of
everything that does not.

### Phase 1 — Project folder and docs

This folder, its [contents.md](./contents.md), this plan, the overlay scaffold, the measurement
inventory, and the row in the section [contents.md](../contents.md). No code.

### Stage 1 — The removals

`rawData` out of the job document; the stored derived setup figures out; `esiJobTab`, `setupToEdit` and
`resourceDisplayType` out, per § `layout` stops existing. Cheapest first because removals need no
upgrader — the writer stops writing them and stored copies age out.

Worth landing on its own even if nothing else does: it shrinks every job document, every write and every
websocket frame, and it removes four figures that can disagree with their inputs.

### Stage 2 — The reshape, in the release window

Row collections become id-keyed maps, and the three fields that outlive `layout` move under `build`:
`materialPriceOverrides`, `localMarketDisplay` and `localOrderDisplay`. `layout` itself goes with them,
Stage 1 having already emptied the rest. The SPA and the API read and write the new shape.

A `prepareRelease` step, after the owner stamp and inside the release's copy, per § Settled. It opens by
proving the update pipeline against real job documents and by counting repeated `typeID` rows across the
live snapshot — a repeated key loses a row silently, so that count gates the step rather than following
it.

**This is the only stage with a deadline.** It ships with the shared-planners release or it waits for the
next release that migrates documents.

### Stage 2b — An owner once, and the archive block

The two shape changes in § An owner is stated once and § Archive metadata is not a live job's. Both
move stored paths, so both need a release window.

They are numbered beside Stage 2 rather than after it because they want the same window, not because
they must ship together: if Stage 2's window is already spoken for, these wait for the next release
that migrates documents rather than widening that one. The id collapse also needs the SPA released with
it, which Stage 2 does not.

Neither is urgent. `omitzero` already keeps both out of the wire, so what is left is the modelling: a
type that cannot express its own invariant, and a live job carrying an archived job's fields.

### Stage 2c — An extras id is a string, in the documents too

`ExtraCost.ID` and `InventionEntry.ID` are app-minted ids, and every other app-minted id in this
codebase is a string: `jobID`, `groupID`, `plannerID`, `accountID`, `inviteID`, `templateID`. EVE's
ids are numbers because ESI sends numbers. These two broke that line once, years ago, because they
were minted from the clock before they were minted as uuids.

**The generator is already right.** The SPA mints `crypto.randomUUID()` for both, and nothing can
produce a numeric id any more. Both models coerce on the way in and on the way out, so a stored number
is read as a string, sent as a string, and written back as a string the first time anything saves that
job. Nothing is broken and nothing is leaking.

What is left is the documents that have not been saved since, and they will not fix themselves: a job
nobody opens is never rewritten. That is a prepare-release step, and it has to run against live —
counts taken in dev say nothing about how many exist in production.

**The step must normalise the row, not patch the field.** The trap is the shape
[`release_extras_labels.go`](../../../services/core/commands/release_extras_labels.go) uses: it reads
extras rows as `[]bson.M`, stamps one key, and `$set`s the array back, which preserves every other
value's original type. A step written that way fixes what it targets and carries the numeric ids
through untouched. Decoding each row through `models.ExtraCost` and writing the struct back normalises
the whole row by construction, and cannot miss a field.

It covers more than the id. The same two types tolerate `category`, `categoryLabel` and `extraText`
arriving as numbers, `extraValue` arriving as a string, and `deletedAt` arriving as epoch
milliseconds — all of which the same rewrite settles.

**Only after live is clean does the read-side coercion come out**, and it should: `extraCostScalarString`,
`extraCostScalarFloat64`, `stringFromDocumentValue`, both `UnmarshalJSON` methods and both
`UnmarshalBSON` methods exist solely to absorb these shapes. Four dead `case json.Number` branches go
with them — they are the last thing keeping `encoding/json` in the tree outside operator output, as
[backend/shared/jsoncodec.md](../../backend/shared/jsoncodec.md) § What still imports `encoding/json`
directly records. Retiring them is its own change, after
the data is known good, not part of the release that cleans it.

### Stage 3 — Base, log, scratch and draft in the editor

The draft store and its three layers, plain data in the edit session, narrow selectors, and
`new Job(draft)` surviving as a read-only lens where a derived figure is read. The edit page's re-render
surface collapses without anything outside it changing.

The what-if layer lands here rather than later: § A what-if is not a change is what decides whether an
edit marks the job modified, so building the log without it would build the wrong rule and change it
again in the next stage.

Undo lands here or immediately after — the log has to be designed for it from the start, per § Undo, so
the decision is taken in this stage whether or not the UI ships in it.

### Stage 4 — Getters become functions, panel by panel

Each converted panel drops its dependency on the lens. Incremental by construction, and the stage that
can be paused without leaving anything half-built.

### Stage 5 — `jobArray` goes plain and the lens is deleted

The stage that touches the rest of the SPA. It is what makes inbound deltas applicable to the store
rather than only to an open editor, so it is only worth taking if
[document-write-granularity](../document-write-granularity/plan.md) Stages C and E are being taken.

The lens does not survive as a forwarding wrapper: this stage finishes the cutover or it has not
happened.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | **Done** |
| Stage 1 — the removals | Not started |
| Stage 2 — the reshape, in the release window | Not started |
| Stage 3 — base, log, scratch and draft | Not started |
| Stage 4 — getters become functions | Not started |
| Stage 5 — `jobArray` goes plain | Not started |

## Settled

**One writer per job stays; drafting does not need the lock.** The document lock keeps gating writes, and
a member without it builds a draft that merges when the lock frees — § The lock is the isolation, and it
stays and § Drafting without the lock carry the design.

The consequence for [document-write-granularity](../document-write-granularity/plan.md) § Stage D: its
first two removals are wanted, because they are about the lock's **breadth** — one member editing one job
should not lock a hundred. Its third, making the lock advisory so a write path no longer consults it, is
**not wanted**, because that is what would allow two writers on one job. That is a finding for that plan
rather than a change this one can make.

**The reshape is a map conversion, and the pattern is what standardises.** Every row collection becomes a
map keyed by the identifier its rows already carry, matching `build.setup`, which is keyed by `id` today.
`build.materials` keys on `typeID`; the others key on what they hold — a purchase on its `id`, a market
order on `order_id`, a transaction on its own id, an extras cost and an invention entry on `id`. What is
standardised is the shape, not one field name: a row collection is a map, addressed by the row's own
identifier, never by position.

**That makes it a `prepareRelease` step rather than a fan-out command.** An array-to-map conversion is
expressible as an update pipeline — `$arrayToObject` over a `$map` producing `{k, v}` pairs, with
`$toString` on numeric keys and `$ifNull` for an absent array — so the server rewrites each document
without the migration reading it. Mongo 8 is what runs, and both update-with-pipeline and
`$arrayToObject` are long established there. So the reshape goes inside the window and inside the release's own copy,
which is the reversible half of § Why the window decides the order. **Not yet verified against real job
documents** — that is the first thing Stage 2 does.

**`immer` is the library, and the boundary is that it stays a function.** `zustand` declares it an
optional peer because it ships an `immer` middleware, so the store already expects it rather than being
bent around it. It is also already resolved in the lockfile — but only as `recharts`'s transitive
dependency, which makes it a known quantity here rather than a free one: taking it means a direct entry
with its own range in `package.json`.

`produceWithPatches` emits the forward and inverse patches from one call, and `applyPatches` performs
both the undo and the rebase; hand-writing that means getting before-image capture right for every
operation shape on the job.

What is **not** wanted is anything that brings a structure with it: a synchronisation library, an
operational transform, or a conflict-free replicated type. Those impose a model on how changes are
represented and merged, which is the opposite of § What this is not. `immer` imposes nothing — it is a
function that returns a value and a list of what changed.

**Where the per-reader half of `layout` lives: nowhere.** § `layout` stops existing empties the bag
rather than relocating it — two fields turn out to be per-job overrides and move to `build`, one is
already held at account level, one is editor session state, one is unread. The field goes.

**A draft is local to the editor session.** It exists while the job is open and is committed or dropped
when the job closes. No browser storage, no stored pending-draft document, no expiry, and nothing to
migrate — which removes the whole question of a draft outliving the shape it was written against.

This keeps the close interaction the editor already has: save or discard, one decision, at one moment.
What it adds is that the decision can now be taken per command rather than for the whole job.

**Its cost falls on § Drafting without the lock**, which becomes a live-session feature: a member can
work on a job somebody else holds, but only while they stay on it. Close the job before the lock frees
and the draft is gone. That makes § Open questions' waitlist question sharper rather than smaller — if a
draft cannot outlive the session, being told the moment the lock frees is what decides whether the
feature is usable at all.

**`scratch` survives moving between steps, because the worked case requires it.** § The worked case:
stepping a built job back to look moves the job to Planning by putting `jobStatus` in scratch. If moving
between steps dropped scratch, the first thing it would drop is the entry that moved the player there.
The two cannot both hold, and the worked case is the point of the feature.

What that leaves is not a question about lifetime but about signposting: a what-if set on Planning is
still live when the player reaches Selling, and § A what-if is not a change already owes a visible marker
and one obvious way out. The marker has to travel with the reader rather than sit on the panel where the
value was set.

## Open questions

None of these blocks Stage 1 or Stage 2, which are the only work with a deadline. Each carries a leaning
so a later reader has a default to argue with rather than a blank; a leaning is not a decision, and none
of them is recorded in § Settled. All are better answered against a working Stage 3 than in the abstract.

**Which surfaces show the draft and which show the base?** The editor shows the draft. The planner list,
the dependency tree and the group view all show figures for a job that may be open with uncommitted
changes.

*Leaning: base everywhere except the editor.* It is what happens today, so it is the option that changes
nothing by accident; a co-member watching the planner should not see totals moving from edits that may be
reverted; and figures that move under a reader who is not editing are worse than figures that are behind.
The cost is that the reader's own job row shows committed values while their editor shows new ones —
answered by marking the row as having unsaved changes rather than by showing the uncommitted figures on
it.

**Is a drafter a waitlist entry?** Now the deciding question for § Drafting without the lock rather than a
refinement of it: a session-scoped draft is only worth building if the drafter learns the lock freed while
they are still there.

*Leaning: join the existing queue on the first change, and accept that the holder sees a waiter.* The
machinery exists — `requestAccess`, the handoff queue and the probe — and building a second, passive
"tell me when it frees" channel to preserve privacy would be new machinery bought to hide something that
is arguably worth showing: somebody does want the job. The cost is that drafting stops being invisible,
which § Drafting without the lock otherwise promises, so the promise is what would need rewording.

**What does a collision do to the reader?** § A change arriving mid-edit detects one; what the editor
*does* is a product decision shared with
[document-write-granularity](../document-write-granularity/plan.md) § Stage B, which faces the same
question for a refused write. Neither should answer it alone.

*Leaning: mark the field with both values and let the reader choose inline; never prompt.* A modal
arriving mid-edit interrupts work over a case that is rare and usually uninteresting, and taking the
inbound value silently is the loss this whole design exists to stop. Marking also matches what § The
merge, when the lock frees already does — the same choice, made in the same shape, in the two places it
arises.

**Does `build.materials` keyed by `typeID` hold for reactions?** Reaction formulas restack and a job can
carry a stacked quantity, but a material row is still one row per type. § The reshape is a map
conversion makes this a **gate on the migration** rather than a tidiness check: `$arrayToObject` keeps
the last value for a repeated key, so a job carrying two rows of one type loses one silently as it is
rewritten. Counted across the live snapshot before Stage 2 writes anything.

## Non-goals

- **Undo after a save.** § Undo says why.
- **Changing which documents the close-time cascade reaches.** The cascade is inherent to how jobs
  relate. This project makes its output field-scoped per document and leaves its reach alone.
- **A UI redesign of the edit page.** The panels are readers of the draft. What they ask and how they are
  laid out belongs to [planning-stage-panels](../planning-stage-panels/contents.md).
- **Removing the document lock.** How broad it needs to be is
  [document-write-granularity](../document-write-granularity/plan.md) § Stage D.
