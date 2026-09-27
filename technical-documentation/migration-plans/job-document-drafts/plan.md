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

Which one the reshape needs turned on whether the conversion had to avoid reading documents. It did not:
a step that reads and rewrites each one converts the whole corpus in 1m32s, so the reshape is a
`prepareRelease` step — [overlay.md](./overlay.md) § Stage 2.

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
and `draft.build.setup.<id>` — and leaves `draft.build.materials`, `draft.esi` and `draft.rawData`
referentially identical to the ones in `base`.

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

| Collection | Key it already carries | Where it lands |
|---|---|---|
| `skills` | `typeID` | `skills` |
| `build.materials` | `typeID` | `build.materials` |
| `build.materials[].purchasing` | `id` | `build.materials.<typeID>.purchasing` |
| `build.costs.extrasCosts` | `id` | `build.extrasCosts` |
| `build.costs.inventionEntries` | `id` | `build.inventionEntries` |
| `build.costs.linkedJobs` | `job_id` | `esi.industryJobs` |
| `build.sale.marketOrders` | `order_id` | `esi.marketOrders` |
| `build.sale.transactions` | the transaction id | `esi.transactions` |

`build.sale.brokersFee` is not on that list. It is not a row collection after this project — § A fee
belongs to its order folds it onto the order it was charged for. The destination column is § The grouping
follows the write rule.

**Measured, not assumed** — [measurements/row-key-uniqueness.md](./measurements/row-key-uniqueness.md)
counts every one of these keys across a live snapshot, and the broker fee's alongside them. Of the eight
above, five hold outright: skills, materials, purchases, extras costs and invention entries. Linked jobs
repeat only as byte-identical duplicates of one ESI job, which the map collapses and the array was
letting stand twice. The remaining two need a rule before they convert — § A row collection whose key
does not identify a row. The ninth is the broker fee, which leaves the list entirely.

`build.setup` is already a map keyed by `id` — the one that got it right, and the shape the rest move
to. `build.materials.4.purchasing.2.itemCost` becomes `build.materials.34317.purchasing.<uuid>.itemCost`:
stable under another member's concurrent insert, and expressible as a Mongo `$set`, which an array index
is not. Where display order matters it becomes an explicit field or a sort at render.

### A fee belongs to its order

`build.sale.brokersFee` is the one row collection with no key, and the reason is that it should never
have been a collection. `BrokerFee.ID` is the journal entry id, whose own comment records that it is
shared by orders listed together: an in-game multi-sell charges several orders in one entry. 393
distinct rows across both collections share an id with another, one archived job carrying 64 under a
single one. `order_id` is worse at 814, because one order can carry more than one distinct fee row — what
those rows are is § Open questions.

**The fee's identity is the order, and the code already says so.** `Classes/brokerFee.js` opens with
*"A row belongs to one market order and is removed with it, which is what `order_id` is for… the row
carries no identity of its own"*, and `findBrokersFeeEntry` returns exactly one fee per order. The live
documents bear it out: 324 orders, one fee each. The archive's multiples are mostly accumulation — the
worst case is an order carrying 65 rows, 64 of them byte-identical copies of one fee, which the array has
been hiding.

**So the fee moves onto the order**: `esi.marketOrders.<order_id>.fee`, one entry per order. The
invariant the comments assert becomes structural rather than something
[`job.js`](../../../frontend/src/Classes/job.js)'s removal filter has to remember, and a change to a fee
is one path on one order, which is what this project is for.

**One entry, and the conversion keeps the oldest.** 42 archived orders carry more than one — 38 of them
from 2022, where only 136 of the archive's 3,021 fee-bearing orders sit, against none at all in 2024 or
2025. What those extra entries are was never settled: two of the four later ones show a smaller second
charge and two a larger, and every amount carries the long decimals of `calcSellingCharges`' own
arithmetic rather than a journal figure, so each records a fee this app *worked out* at link time from
the skills and standings of whoever was linked then. A second link of one order recomputes and appends,
because `addMarketOrder` has no guard against being called twice for an `order_id`.

The oldest is the one the listing was actually charged, so it is the one that survives. It is also the
larger in 40 of the 42, which is what a first listing followed by recomputations or a discounted relist
would look like.

**What that drops, measured by running it.** 814 rows: 210 that duplicate the entry beside them (163.8M
ISK) and 604 that differ from it (326.0M ISK), against 21.1 billion ISK of fee the kept entries hold.

The duplicates matter as much as the rest, which a count of *distinct* fees hides. Both the Go cost
calculation and the SPA's `totalBrokersFees` sum every stored row, so a job holding one fee three times
has been charged for it three times ever since — consolidating corrects that rather than losing anything.
An earlier reading of this section put the drop at 61 rows and 43.3M ISK by counting how many distinct
fees would disappear; the figure that matters is how many rows stop being summed, and it is six times
larger.

Those jobs' broker costs fall accordingly and their statistics rows follow on the rebuild. It is a
deliberate write-down of figures rather than a shape change, which is why it is stated with its cost.

**The shape is what stops it recurring.** A single field cannot accrue a second entry, so the unguarded
append stops being expressible rather than being something `addMarketOrder` has to start checking for.

**What it costs.** The cost calculation in `models.Job`, the archive row builder's `buildFeeLines` — which
emits a line per fee today and a line per order afterwards — the SPA class and its tests all walk a fee
array today and walk orders instead. That is a modelling change
rather than a conversion, and it is why this is worth stating separately from the reshape that carries
it.

**Five fees have no order to move to, and the path that orphans them is live.** Two live and three
archived, each on a job holding no market orders at all, carrying 45.3M ISK between them — 39.6M of it
archived, and one row alone worth 28M.
`stripConflictedLinks` in the archive restore drops a market order another job already holds and leaves
its fee behind — the SPA's `removeMarketOrder` filters `brokersFee` first, the Go path has nothing to
filter and no reason to remember. So this is not a historic tail: the next restore hitting an order
conflict adds to it.

The fold closes it structurally, which is most of the argument for the fold. Deleting the order takes the
fee with it because the fee is on the order, with no second removal to get right. The conversion **drops
the five and reports the count**, because a fee charged against an order the job does not have is already
costing that job for something it cannot show. Five jobs' totals move, and three of those are archived,
so their statistics rows move with the rebuild.

**Three fields go rather than move.** `ArchivedJobFeeLine.FeeID` is written by `buildFeeLines` and read
by nothing. Every stored fee row carries a `complete` field no model and no class has ever read — 4,159
of them. And 3,624 carry a `CharacterHash`, which is redundant twice over once the fee sits on the order
that records whose it is. None survives the fold. Meanwhile `salesTax`, which the model does carry, is on **zero**
stored rows, which is the [document-defaults](../document-defaults/plan.md) pattern exactly: the upsert
`$set`s only what the struct marshals, so an unmodelled key is never touched.

### An invention entry states the shape it was written in

Every other version in this codebase is a **document** version: a `*SchemaCurrent` constant, a bump when
the shape changes, and an upgrader step that rewrites the document on read. An invention entry carries
its own instead, as `version` on the row.

**Because the rows outlive the bump.** A document version says what shape a job is in, and the upgrader
brings the whole job forward at once. That works while every row of a collection moves together. An
invention entry does not: a row added next year joins rows written years earlier, in a job whose version
says only when the job was last brought forward. Asking the job what shape one of its entries is in gives
the wrong answer as soon as two vintages sit side by side.

**Every stored row is v1**, and the conversion stamps it — 245 rows across the corpus, all of them
written before the field existed, all of them the one shape it was added to name. A row that arrives
carrying no version is read as v1 on both sides for the same reason.

**It is the first constant this repo keeps in two languages.** `models.InventionEntrySchemaCurrent` and
the SPA's `InventionEntry.SCHEMA_CURRENT` are one fact, and nothing about `1 == 1` stays true on its own,
so a test in `shared/models` reads the SPA's declaration and fails when the two drift. The alternative —
a comment on each asking the next person to remember — is what this project keeps finding the wreckage
of.

### A row collection whose key does not identify a row

Two of the eight need a rule before the conversion can run, and they need different ones.

**A market order keeps its order and loses its history.** Two archived jobs hold the same order twice
with different slices of its `timeStamps`, which is the only field that differs. Keying on `order_id`
never loses an order, so this is not a key to choose but a rule for the conversion: where rows collapse,
keep the longest `timeStamps` of them. With that, nothing is lost.

**A transaction's key holds for every sale ESI issued and not for one entered by hand.** All 18 groups
that genuinely differ carry `transaction_id` 0, where `models.IsMarketTransactionID` expects a
hand-entered sale to be minted negative. These are a historic tail rather than a live defect: the SPA's
`mintCustomID` mints a non-zero negative id and cannot produce a zero, so nothing writing today adds to
them. 120 archived rows carry a zero and one live row does; 96 archived rows carry a negative id, minted
as the SPA mints one now. So 217 rows are hand-entered sales, which is what the rule below has to cover.

**A hand-entered sale is minted the id it should already have had.** `Transaction.mintCustomID` mints a
negative 48-bit id, and that is the right shape: `transaction_id` is ESI's field, EVE's ids are numbers,
and a negative one is both outside the space ESI issues from and the thing `IsMarketTransactionID` reads.
The 217 rows carrying zero or nothing are rows the mint never reached, not rows minted wrongly. The
conversion mints them in that same shape.

This is deliberately **not** the uuid § Stage 2c gives `ExtraCost.ID` and `InventionEntry.ID`. Those are
ids the app invents for rows the app invents, in a field only the app reads. `transaction_id` is ESI's
own field carrying ESI's own value for every row but these, and the sign is what tells the two apart. A
uuid would make the field a string, which costs the sign test, `models.Transaction.TransactionID`,
`ArchivedJobTransactionLine.TransactionID`, and the `int64` chain below — a great deal of change for rows
that already have a working shape to be minted into.

`journal_ref_id` is not the key and was never a candidate: it identifies the journal entry the sale
produced rather than the sale, and it is absent from more rows than `transaction_id` is —
[measurements/row-key-uniqueness.md](./measurements/row-key-uniqueness.md) § Keys tested and rejected.

**The mint does not have to happen in a pipeline after all.** Running the conversion as a step that reads
and rewrites each document took 1m32s over 42,065 documents, so the window cost § Settled was weighing
does not arise — see [overlay.md](./overlay.md) § Stage 2. The id is minted in Go, in the shape
`Transaction.mintCustomID` produces, and 217 rows in the corpus need one.

#### A defect this found, which the mint does not fix

`Job.LinkedTransactionIDs` walks every transaction and returns `[]int64`, unfiltered, feeding
`Group.LinkedTransIDs`, `UserAccountDocument.LinkedTrans`, the `$in` query `esiLinkField` builds over
`build.sale.transactions.transaction_id`, and the conflict maps `stripConflictedLinks` compares against.
On the SPA the everyday path does the same: `addCustomTransaction` mints the row, the reducer pushes its
id into `esiDataToLink.transactions.add` with nothing distinguishing it from an ESI-matched one,
`closeActiveJob` passes that through to `addLinkedEsiData`, and the account store folds it into
`linkedTrans`.

That chain exists to stop one **ESI** transaction being claimed by two jobs — `esiLinkKind` names an ESI
series, and the getter's own comment says "the ESI transactions linked to this job". A hand-entered sale
is not one: it is minted locally, belongs to the job that minted it, and cannot collide with anything. It
is in the set because nothing filters it out.

**Recorded rather than taken.** Keeping the id numeric means nothing breaks, so this is a tidy-up rather
than work this project owes: a locally minted id occupies a slot in an account-wide record of which ESI
ids are taken, and does no harm there. The filter belongs on `LinkedTransactionIDs` and on the SPA change
set where it is built, and `IsMarketTransactionID` is the test either would use.

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

A setup used to store `materialCount`, `estimatedTime`, `rawTime` and `estimatedInstallCost`, all
recalculated from the run count, ME, structure and system index it sits beside. Stored, one changed run
count had to write five paths, any of the four could disagree with its inputs, and two members could hold
different values for a number neither of them chose. Two are already gone from the writers and two are
still stored — § Stage 1b measures which and why.

`Material.quantity` already does this correctly — a getter over the setups' `materialCount`, absent from
the document. That is the model.

**The rule this project writes down: a stored field exists only for something a person decided.** A
derived figure is never stored, so it never appears in a patch, never conflicts, and never needs an undo
entry.

**The rule has a second half: an input a decision was built from is stored too.** Otherwise it reads as
though nothing but a player's choices may live in the document, and `rawData` — the blueprint recipe from
the SDE, identical for every player holding that blueprint — would fail it. It stays, for two reasons
neither of which is about who decided it.

**It is what the derived figures are recalculated from.** `setupBuildHelpers` takes `rawTime` from
`rawData.time` and `baseQuantity` from `rawData.products[0].quantity`, `recalculateMaterials` is fed
`rawData.materials` when a setup is built and again from `Classes/job.js` when one is rebuilt, and
`buildJob` falls back to `rawData.products[0].quantity` for a required quantity. Remove it and the
figures above have nothing left to derive from.

**It is what makes the archive an archive.** A job's figures came from the recipe as it stood when it was
built, and EVE's recipes change; a job that looks its recipe up again renders differently from the job
that was run. The copy is the snapshot, and the snapshot is the point.

`skills` is the same class and stays for the same reasons: it is the job's own record of what building it
required, and `useGroupScheduler` reads `job.skills` off every job in a group to hand to
`calculateTimeForSetup`.

**The rule has a third qualification: a figure a calculation is handed on its own stays with it.** A
setup is meant to be passable on its own — `calculateTimeForSetup`, `timeForSetup` and the material
calculations all take a setup and nothing else.
`rawTime` and `materialCount` stay stored for that reason, and § Stage 1b measures why removing either
costs more than the duplication does. The rule reaches a figure when its inputs are in the document *and*
the caller already holds them — `Material.quantity` is still the model, because a material is read from a
job that holds its setups.

### The document splits by who writes it

`build` currently mixes three kinds of field with three different write rules:

| Zone | Fields | Write rule |
|------|--------|------------|
| Decisions | setups, material purchases, extras costs, invention entries, the sale plan, price overrides | Patchable, undoable, checked for collision |
| Observations | linked ESI jobs, market orders, transactions, broker fees | Sourced from ESI, merged per row on a refresh, never hand-edited |
| Derived | totals, requirements, install costs, times | Not stored |

A refresh is a per-row merge rather than a replacement: `updateLinkedJobData` walks the linked jobs and
calls `applyLatest` on each, and `applyLatestOrderData` does the same for orders, both matching on the
ESI id the row already carries. That is worth stating precisely, because it is what makes nesting safe —
a fee kept under its market order survives a refresh of that order, where a wholesale replacement would
have destroyed it.

What the zones are for is the log. Sharing one with decisions would make it carry entries no player
created, and force undo to decide what unwinding an ESI refresh means. Separating them means it never
comes up.

### The grouping follows the write rule

`build.costs` and `build.sale` are the two groupings the document has, and neither survives the zone
table above. `costs` holds extras costs and invention entries, which are decisions, beside linked ESI
jobs, which are an observation. `sale` holds market orders and transactions, which are observations,
beside `plan`, which is where the player chose a seller and a sale location. Each cuts across the write
rule rather than following it, so neither tells a reader or a writer anything.

So the two levels go, and the observations move to a sibling of `build`:

```
build/    what the player decided — patchable, undoable, collision-checked
  setup.<id>
  materials.<typeID>.purchasing.<id>
  extrasCosts.<id>
  inventionEntries.<id>
  sellerCharacter, saleLocationID
  localPricing, materialPriceOverrides

esi/      what ESI reported — merged per row on refresh, never hand-edited
  industryJobs.<job_id>
  marketOrders.<order_id>.fee
  transactions.<transaction_id>
```

**`build` keeps its name**, because that is what it now holds and nothing else: a job's build
information. The observations were never build information, which is why `costs` and `sale` had to exist
to hold them.

**One field is renamed as it moves, and only one.** `linkedJobs` becomes `esi.industryJobs`. Under `esi`
every row is linked, so "linked" stops distinguishing anything, while "job" at the top of a job document
collides with the parent/child links § How a job is held while it is open calls linking. `industryJobs`
says which of ESI's series it holds, which is what `models.LinkedESIJob`'s own comment already calls it.
Nothing else changes name: `extrasCosts`, `inventionEntries`, `marketOrders` and `transactions` all say
what they hold already.

**One nesting stays, because the parent's key is what scopes the child's.** A purchase belongs to one
material, so `purchasing` is keyed under it rather than hoisted into a collection that would need a
material id on every row. A fee is not a collection at all — § A fee belongs to its order makes it a
field of the order it was charged against.

**What it buys beyond a shorter path.** Every subtree has one write rule, so a patch is a decision or an
ESI refresh by its first segment rather than by inspecting what it touched. Today an entry under
`build.costs` could be either, and Stage 3's log would have to tell them apart some other way.

**What it costs.** Every path moves, so every `build.costs.*` and `build.sale.*` read in the SPA changes,
and the conversion rewrites more of each document. It rides Stage 2 because that step already moves every
path in the window; taken later it needs a window of its own.

### `layout` stops existing

**It was never a schema decision.** `layout` was added as a place to park values that were resetting on
rerender when they should not have — a persistence workaround for SPA state, not a statement about what
a job is. That is the whole reason it exists, and it is why reading its fields finds three unrelated
kinds of thing with nothing in common but the bug they were escaping.

Which makes the fix Stage 3 rather than a better bag. An untouched base with an ordered log over it is
state that survives a rerender because it is not rebuilt by one, so nothing needs parking. Each field
goes to where it belongs on its own merits:

| Field | What it actually is | Where it goes |
|---|---|---|
| `materialPriceOverrides` | What the player decided a material is priced at | `build`, with the other decisions |
| `localPricing` | The job's own choice of where each side of it is priced | `build`, for the same reason |
| `localMarketDisplay`, `localOrderDisplay` | The **superseded** single-market form of that choice, still echoed back by every save | Folded into `localPricing` by Stage 2's conversion, then dropped |
| `esiJobTab` | Which tab this reader had open | Dropped — `applicationSettings.esiJobTab` already holds it at account level |
| `setupToEdit` | Which setup card is selected | Dropped — editor session state, held by the draft store and re-derived on open |
| `resourceDisplayType` | Nothing. No consumer reads it | Dropped |

**The pricing fields are the surprise, twice over.** They read as view state from their names and their
neighbours, but `useEffectiveMarketHubFromLayout` resolves each as `job ?? account default`, and
`useStripRedundantJobMarketHubOverrides` exists to clear a job's value once it matches the account's. A
field with a hook dedicated to keeping it only while it differs is an override, and an override of a
pricing order type is a decision about the job. So this part of the bag is not view state at all.

**The second surprise is that two of the three are already superseded.** No control writes
`localMarketDisplay` or `localOrderDisplay`: every writer — the purchasing panel, `useMaterialOverrides`,
the strip-when-redundant hook — writes `localPricing`, and the `Job` constructor reads the older pair
only to seed it, falling back again to the older `marketLocation` / `orderType` aliases beneath them.

They are still *written*, though, and that is the defect. `toDocument` echoes both back on every save
from whatever the document was loaded with, so a job whose pricing has since changed carries a stale
single-market value on disk — and `jobPricingOverride` seeds an unchosen side from exactly that value.
A job with a buying choice and no selling choice takes its selling side from a figure nothing has
maintained since `localPricing` arrived.

`jobPricingOverride` also says why the pair cannot simply be carried forward: naming one market said
nothing about which side of the job it meant, so both sides seed from it and neither may claim it.
**Stage 2's conversion applies that rule once, to every document, and the pair goes with `layout`.** It
is the step with every document in hand, and once it has run nothing reads the old pair, so the
constructor's seeding goes in the same stage. This is not routed to
[document-defaults](../document-defaults/plan.md) Phase A2's read-path upgrader: that normalises what a
read finds, and after the window there is nothing left to find.

**That takes one of Phase A2's own items with it.** The constructor block being deleted is also where
`marketLocation → localMarketDisplay` is read, which Phase A2's alias list names. Stage 2 retires that
fallback as part of the fold, so the alias leaves Phase A2's scope rather than moving into its upgrader —
stated in both plans, because a dependency written down on one side only is how § Stage C of
[document-write-granularity](../document-write-granularity/plan.md) came to be designed twice.

`localPricing` is what survives, and it is read the most widely of anything in the bag —
`priceResolution`, `pricingSide`, `pricesWanted`, the purchasing panel, `useMaterialOverrides`, the
materials-and-sourcing panel's own read, the group output card and the `Job` constructor all take it. It
is absent from every stored document in the corpus because it is recent, not because nothing writes it.

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

### What slice 3 settled

**A step is taken back by dropping it, not by writing its before-image in.** Every read of a job is
already the base with the remaining steps applied over it, so dropping the newest step produces exactly
what stood before it — and it stays right when a co-member's document has arrived underneath in the
meantime, which writing an old value over the top would not. The before-image is still recorded, and is
what a step is reviewed against when the job it was made over has moved, per § The merge, when the lock
frees.

**Undo is the whole session read backwards, not a stack per job.** A step names the job it changed, and
the newest step is the newest whichever job and whichever layer it landed in — so a question is taken
back before the change beneath it, which is the order the player made them in.

**Coalescing merges only replaces over the same paths, and only against the step immediately before.**
That is the pair whose inverse is provably still right: the older before-image describes a field the
newer patch overwrites. A step that adds or removes a row is left alone, and a step made in between
blocks the merge rather than being reordered around. The window is 800ms, exported so the control and
its tests read the same number.

**A kept question takes its place in the order it was asked**, rather than at the end of the log:
the layers are replayed in order, so a question promoted after a later change would otherwise apply
over that change and quietly undo it. Slice 3's recheck found that, and it is why promotion is an
insert rather than an append.

**Redo is the undone steps, dropped at the next new edit** — recording anything empties the forward
stack, so it cannot be rejoined to a log that has since gone a different way.

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
touching `esi.transactions` re-renders the selling panel and leaves the rest referentially identical, where a
whole-document replacement re-renders the page. No second code path for reading as against changing,
which is the strongest argument for this shape over merging inbound changes into one mutable copy.

**Revert means what the word says.** Discard today restores the copy taken when the editor opened, so
discarding your own change also discards any co-member change that arrived since and writes the old
value back over it. Dropping a log lands the reader on the current committed state with their own
changes gone and nobody else's — which is what discard should have always meant.

The snapshot, the helper that writes it back and the leave paths that call it are
[overlay.md](./overlay.md) § Stage 3. **All of them go**: under the layers the base is the backup and it
is a live one, so discard is emptying a list rather than restoring a document. Discard also stops writing
to the store at all, which is what removes the guard those paths need today — a job deleted while the
reader had it open is not something a dropped log can resurrect.

**Opening a job, changing settings and leaving without saving keeps working; what changes is what else
survives it.** An ESI refresh or a co-member's save that landed while the editor was open is reverted
today along with the reader's own edits, because the restore is a whole document taken at a moment.
Under the layers those are in the base and the base is not what is dropped.

**Leaving is still all-or-nothing, and that is correct.** Dropping a log drops every entry in it; keeping
some changes and discarding others is undo, per § Undo, not a property of closing. What does change is
the prompt: *unsaved changes* becomes the log being non-empty rather than a flag that is only ever set
true, so a reader who has undone their way back to the base is not asked, and a what-if in `scratch`
never arms it at all.

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
| The stored derived setup fields | **Removal only.** Nothing needs an upgrader — the writer stops writing them and stored copies age out. `rawData` and `skills` are **not** among them: § Stored derived figures come out says why they stay |
| `build.sale.brokersFee` folded onto its market order as one `fee` | **migrate-required**, in the same step, and it moves figures in two groups. 814 entries are dropped in favour of the oldest on their order — 210 duplicates (163.8M ISK) and 604 differing (326.0M ISK). Five fees whose order is gone are dropped outright (45.3M ISK). Every affected archived job's statistics row follows on the rebuild |
| `build.costs` and `build.sale` removed, observations moved to `esi` | **migrate-required**, in the same step. Every path under either moves, so every SPA read of `build.costs.*` or `build.sale.*` changes with it — § The grouping follows the write rule |
| `materialPriceOverrides` moving under `build` | **migrate-required** — rewritten in the same step as the row collections |
| `layout` removed, `localPricing` moved under `build` | **migrate-required** for the move, and for the fold: Stage 2's conversion reads `localMarketDisplay` / `localOrderDisplay` into `localPricing` by `jobPricingOverride`'s rule rather than moving them, and the SPA stops echoing them in the same deploy. The three view-state fields are removals needing no upgrader |
| An invention entry carries `version` | **additive**. Client-visible, and every stored row is stamped v1 by the conversion. A row carrying none is read as v1 on both sides, so a client that has not been deployed yet still round-trips |
| A hand-entered sale's `transaction_id` | **No shape change.** The 217 rows carrying zero or nothing are minted a negative id in the shape the SPA already mints, so the field stays an `int64` and `IsMarketTransactionID` keeps reading it |
| `ArchivedJobFeeLine.FeeID` on the archived statistics row | **Removal only**, but client-visible as `feeID` in JSON. Nothing reads it on either side; a reader that decodes the row by field sees one fewer |
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

`Purchase.TypeID` out, with the three found by the row-key gate below. Cheapest first because removals
need no upgrader — the writer stops writing them and stored copies age out.

**A field nothing reads is what this stage is for.** Every field here is written and never consulted, so
removing it changes no figure anywhere. Two groups were originally listed here and are not that:

- **The derived setup figures.** Two no longer exist to remove and two are deliberately stored — § Stage 1b.
- **`esiJobTab`, `setupToEdit` and `resourceDisplayType`**, per § `layout` stops existing. That section
  reasons about where each field belongs, which is right, and reads as though all three are unread,
  which is wrong. `setupToEdit` is read by `Job.selectedSetup` and `esiJobTab` by the building tab
  panel, which opens on the tab the reader left. Only `resourceDisplayType` has no consumer. They are
  deferred together rather than one at a time because they share the `Layout` struct and its
  marshalling, and because the draft store that is meant to own this state is Stage 3. Taking them
  before it exists would mean re-homing reader state twice.

`Purchase.TypeID` is write-only: `jobMaterial.js` stamps it from the parent material when a row is
created and nothing reads it back — every consumer reads the material's own `typeID`, and Go's
`countedPurchases` takes only `ItemCount` and `ItemCost`. Its model comment justifies it as a value the
frontend puts on each row, which is true and is not a use. 3,127 of 14,834 stored rows carry `0`, which
is what a field nothing checks looks like.

Worth landing on its own even if nothing else does: it removes four figures that can disagree with their
inputs, and shrinks every write and every websocket frame by them.

Three more go with them, all found by the row-key gate: `ArchivedJobFeeLine.FeeID`, written by
`buildFeeLines` and read by nothing, and the `complete` and `CharacterHash` fields stored broker fee rows
carry that no model and no class reads.

### Stage 1b — The derived setup figures

§ Stored derived figures come out names four: `materialCount`, `estimatedTime`, `rawTime` and
`estimatedInstallCost`. Against the code they are not one group, and none of them is the removal Stage 1
describes.

**Two of them are already gone from the writers.** Neither `estimatedTime` nor `estimatedInstallCost`
exists on `models.JobSetup` or is assigned by `jobSetup.js`. The only place all four are named together
is `derivedSetupFields` in the Stage 2 conversion, which prunes them from *stored* documents — where
legacy copies do still sit, 45,385 setups' worth per [overlay.md](./overlay.md) § Stage 2. So for these
two the work is already done twice over: nothing writes them, and the conversion clears the residue.
Nothing is owed here beyond not re-listing them as work.

**The other two are read, and they were costed as one piece of work.** Measured against the code after
Stage 4 landed, they are not one piece of work, and neither should be done.

**A setup is meant to be passable on its own, and that is why it carries these.** `calculateTimeForSetup`,
`timeForSetup` and the material calculations all take a setup and nothing else. Both figures duplicate
something reachable from the job, and that reads as redundancy only until the call sites are looked at:
take either off the setup and every caller has to hand the parent job in beside it, coupling calculations
that currently answer from one argument to the whole job they happen to belong to. The self-containment is
the design.

**`rawTime` stays.** `setupBuildHelpers.js` writes it as `job.rawData.time` and nothing changes it after,
so it is a copy — but not one that can go stale, because `rawData` is a snapshot written when the job is
created and never changed. Three SPA production files name it — the setup class, the time calculation
and the helper that writes it — and Go declares the field and reads it nowhere. Removing it is reading
`rawData.time` at the four sites that multiply by it, across `skillsTimeEffect.jsx`,
`productionStats.jsx` and `useGroupScheduler.js` — which buys nothing and costs the coupling above.

**`materialCount` stays.** It is not a derivation from ME and run count, which is how § Stored derived
figures come out describes it. It is the output of `calculateMaterialsForSetup`, which needs the setup's
job type, run count, job count, ME, the structure it builds in, both rig slots and the system — through
`manufacturingMaterialCalculation` or `reactionMaterialCalculation`, `getStructureInfoFromID` and
`rigSlotBonuses`. Four SPA production files touch it: `jobSetup.js`, `jobSelectors.js`,
`useMaterialsSourcing.js` and `installCosts.js`. **Go has none of that**: `services/` carries rig-slot
release commands for stored data and no material formula at all, so deriving it server-side means porting
both formulas and the structure, rig and system bonus tables the SPA holds — a second implementation of a
rule this repo has only ever had one of. The cost of keeping it is that a setup's material list can fall
behind its setup, which is what `recalculateMaterials` exists to stop and what the conversion that pruned
it proved the hard way.

So § Stored derived figures come out does not reach these two. It wants figures derived rather than stored
where the derivation's inputs are in the document and the caller already holds them; neither condition
holds here, and `Material.quantity` — a getter over the setups' `materialCount`, absent from the document
— remains the model, because a material is read from a job that holds its setups. Should that change, a
server needing a material requirement without asking the SPA, the options are a Go port of both formulas
and their bonus tables, or moving the figure behind an API the SPA answers, and either is a stage of its
own rather than a removal.

**The conversion must not prune them, and once did.** Stage 2's `derivedSetupFields` listed all four, on
the assumption — true when it was written — that Stage 1 would stop the writers first. Stage 1 has since
landed and deliberately did not, because two of the four are read. A `prepareRelease` run against dev
converted 9,341 job documents and 9,270 archived jobs with the wider list, pruning `materialCount` and
`rawTime` from every setup in them. A setup loaded without a `materialCount` reads as calling for no
materials rather than as needing recalculation — `jobSetup.js` defaults it to `{}` and only
`recalculateMaterials` refills it, which nothing calls on load — so `MaterialRequirement` returns zero,
`countedPurchases` takes `min(ItemCount, 0)`, and every converted job's material cost computes as zero.
The run was reverted from the release's own `_pre_0_9_0` copies, and `derivedSetupFields` holds only
`estimatedTime` and `estimatedInstallCost`.

### Stage 2 — The reshape, in the release window

Row collections become id-keyed maps; `build.costs` and `build.sale` go and the observation rows move to
`esi`, per § The grouping follows the write rule; and the two fields that outlive `layout` move under
`build` — `materialPriceOverrides` and `localPricing`, the single-market pair folding into the latter as
it goes. `layout` itself goes with them, Stage 1 having already emptied the rest. The SPA and the API
read and write the new shape.

A `prepareRelease` step, inside the release's copy. **The conversion is built** — what it does, what it
reported against a restored copy of live and what proves it are [overlay.md](./overlay.md) § Stage 2.
The key count that gates it is re-run against live before the step writes anything:
[measurements/row-key-uniqueness.md](./measurements/row-key-uniqueness.md) is a snapshot's, and the
corpus at release time is not that snapshot.

**What remains of this stage is the SPA and the API reading the new shape**, and five of the eight row
collections now do. `skills`, `build.materials`, each material's `purchasing`, `build.costs.extrasCosts`
and `build.costs.inventionEntries` are keyed in `models.Job` and in the SPA, which holds the same shape
the document does rather than converting at the class boundary. The three ESI-linked collections —
linked jobs, market orders and transactions — and the broker fee fold are what is left.

**The fold widens this stage beyond a conversion.** Moving the fee onto its order changes the cost
calculation, the archive row builder, the SPA class and their tests, which the array-to-map conversion
on its own does not. `stripConflictedLinks` is in that set and owes a case asserting a stripped order
takes its fee — the defect § A fee belongs to its order names, which the fold is what actually fixes. It
rides this stage rather than waiting because it moves a stored path, and a stored path moves in a
window.

**The step counts what it collapses and refuses what it cannot explain.** Built, and this is what it
does. Every "loses nothing" in this
plan is a statement about a snapshot, and the corpus at release time is not that snapshot: rows written
between the measurement and the window are unmeasured, and `$arrayToObject` keeps the last value for a
repeated key without saying it did. So the conversion does not trust the count — it compares each array's
length against its key count as it goes, writes the document only where they agree, and reports every one
where they do not. A release that finds none has proved what was measured; a release that finds some has
found the row the measurement could not see, instead of discarding it.

**One ordering rule covers the lot: a row's id is settled before anything is keyed by it.** Key first and
the map is addressed by a value about to change, which is the invariant § Settled states — a row
collection is addressed by the row's own identifier — broken by the step that builds it. Three instances,
and the third is the one that crosses a stage boundary:

- A hand-entered sale is minted its id before the transactions array becomes a map, or the rows carrying
  nothing collapse onto a single key and the mint arrives too late to matter.
- A fee moves onto its order before the orders are keyed.
- **§ Stage 2c's uuids are minted before `extrasCosts` and `inventionEntries` are keyed** — 245 invention
  entries still carry a numeric id, so keying first would file each under a number and then rewrite the
  `id` beneath it to a uuid, leaving the key and the row disagreeing. Either 2c's mint runs ahead of this
  conversion for those two collections, or this conversion re-keys them afterwards; running the mint
  first is one pass rather than two.

**This is the only stage with a deadline.** It ships with the shared-planners release or it waits for the
next release that migrates documents.

**The keying stops at the document boundary, and that is the whole of this stage.** The `Job` class
reads a keyed document into the arrays its readers already walk, and `toDocument` keys them again on the
way out. The in-memory shape does not change here.

That is not a shortcut taken to save call sites. It is where the keyed form is actually needed: the
stable paths
[document-write-granularity](../document-write-granularity/plan.md) § Stage C sends are produced from
the draft, which § How a job is held while it is open holds as plain data and Stage 3 builds new. This
class is not that store — Stage 5 deletes it. Pushing maps through a shape being replaced would rewrite
roughly 155 component call sites, including eighteen `.length` reads that would silently become
`undefined` rather than fail, and none of it would reach the projects downstream any sooner.

So: the document is keyed, the draft will be keyed, and the class in between is left alone until it goes.

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

**Counted against a live snapshot, and the two halves are not alike** —
[measurements/extras-and-invention-ids.md](./measurements/extras-and-invention-ids.md). Not one of 1,389
extras rows carries a numeric id or lacks one, so that half of the step has nothing to convert: every
extras row in the corpus has been saved since the generator moved to `crypto.randomUUID()`. Every one of
245 invention entries carries a numeric id, so that half is the whole of the work, and it is small.

The other shapes the step was written to absorb are not there either: no numeric `category`, no numeric
`extraText`, no string `extraValue`, no epoch-milliseconds `deletedAt`. What **is** there is 865 extras
rows carrying no category, which [document-defaults](../document-defaults/plan.md) § Track B owns and
files under `unassigned`. Re-measure against live before the step runs; a snapshot is not the moment the
step executes in.

**The step must normalise the row, not patch the field.** The trap is the shape
[`release_extras_labels.go`](../../../services/core/commands/release_extras_labels.go) uses: it reads
extras rows as `[]bson.M`, stamps one key, and `$set`s the array back, which preserves every other
value's original type. A step written that way fixes what it targets and carries the numeric ids
through untouched. Decoding each row through `models.ExtraCost` and writing the struct back normalises
the whole row by construction, and cannot miss a field.

It covers more than the id. The same two types tolerate `category`, `categoryLabel` and `extraText`
arriving as numbers, `extraValue` arriving as a string, and `deletedAt` arriving as epoch
milliseconds — all of which the same rewrite settles.

**A stored corpus being clean is not the whole test.** `UnmarshalBSON` reads what Mongo holds, which the
step normalises; `UnmarshalJSON` reads what a client sends, which it does not. A browser holding an
already-loaded bundle keeps sending whatever that bundle mints until it reloads, so retiring the two
paths is two decisions rather than one: the BSON side is answered by the step, the JSON side by how long
a stale client may still be writing. Judge that before either comes out.

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

**The stage is a rebuild of the edit session, not a layer fitted under the reducer.** The editor is
built to the design in §§ How a job is held, Undo and A what-if is not a change and the reducer it
replaces is deleted, rather than the layers being seeded underneath it and the old shape kept working
alongside. What that buys is that no call site is written twice — a component converted onto a draft
selector is converted once, not once onto a compatibility shim and again when the shim goes — and no
intermediate design has to be justified or documented. What it costs is that the page is rebuilt before
it runs again, so the stage is taken in slices for tracking and testing rather than for each slice
leaving a working page behind. § Stage 3's slices records what those are and what proves each one.

**The editor follows the document from this stage on**, per § Settled. `base` is replaced as documents
arrive rather than seeded once, which is what stops a member who takes a vacated lock editing the copy
they opened with. It is the rebase in § A change arriving mid-edit doing ordinary work, so it costs this
stage the wiring rather than a mechanism: the guard in `useEditJobInitialState` that returns early for a
job already active is what currently makes the editor deaf, and the inbound coalescer already delivers
every document the store needs.

#### Stage 3's slices

Each is landed and tested on its own. Only the last leaves a page a reader can open, because the stage
rebuilds the edit session rather than fitting the layers under it.

| Slice | What it is | What proves it |
|---|---|---|
| 1 — the layers · **landed** | `base`, `log`, `scratch` and the draft derived from them, as a pure module nothing imports | Its own tests: the base is never written to, an arriving document keeps the reader's changes, a question stays out of the save, an untouched subtree keeps its identity |
| 2 — commands · **landed** | Every way of changing a job becomes a command that records what it changed. The mutation methods on `Job` become the recipes those commands run | Each checked against the method it replaces: both run over one document and the results compared |
| 2a — the selectors a command needs · **landed** | A derived figure a call site must read to build a command's input, taken early rather than waiting for Stage 4 | Each checked against the getter it replaces, the same way the commands are |
| 3 — undo · **landed** | The log read backwards, per command rather than per path, with typing coalesced | Undo of each command restores what it changed and nothing else, a question is taken back like a change, and a run of typing is one step |
| 4 — the session · **landed** | The reducer is replaced by the store: `jobModified` becomes the log being non-empty, discard becomes dropping it, and the base follows the document | Both edges of a session over the real store: opening a job into it, and saving or closing out of it. The seven end-to-end mutator suites press what a reader presses; a document arriving for a job an editor holds keeps the reader's changes over it, including in the middle of a run of typing |
| 5 — the panels · **landed** | Each panel reads what it needs from the draft instead of taking the whole job as a prop. Broken into five steps of its own — § Slice 5's steps | The mutators that already press what a reader presses, plus a render count per panel |

**Comparing against what is being replaced is what has found the defects.** Every divergence so far was
in the new code and none would have failed a test of the recipe alone: a new extras row and a new
invention entry stored raw were missing the defaults their classes fill in, which is why a command that
stores a row builds it through the row's own class. The exception proves the rule from the other side —
`attachNewSetupToJob` on the class stores whatever it is handed, so a plain row breaks the job's own
`toDocument` later, and only the command tolerates both.

**`addNewSetup` is not a command, and does not become one.** What a new setup holds — the player's
default structure, their main character, the best blueprint they own — is not a property of the job, so
a method on `Job` reaching into the users store and the blueprint cache was always the wrong home for
it. The caller builds the setup and dispatches `attachNewSetupToJob`, which is the pure half and is
already a command. That also settles the uuid: the setup is minted before the command runs, so the
recipe is pure and the patch carries the id it was given.

What the call site needs in exchange is `setupToBuildFrom`, a figure it reads off the job — which is a
Stage 4 derivation arriving early. Those land in `jobSelectors.js` as they are needed, rather than being
held back: a selector taken to unblock a command is the same work Stage 4 does, done in the order the
rebuild asks for it.

Slice 1 landed with the module and its tests. `speculativeChildJobs` is absorbed by slice 2, which is
where a question becomes an ordinary command written to `scratch`.

**What is being replaced stays until what replaces it is proved.** The reducer and the mutation methods
on `Job` are left in place while the commands are built, rather than going as each command lands. The
reducer went in slice 4. **The mutation methods could not**, and this plan said they would: `jobArray`
holds `Job` instances app-wide, and the planner, the group pages and the save path all still call those
methods on jobs that never came from an edit session. They go with the lens, in Stage 5 — § What
happens to the classes has the blast radius that makes that so. That is not a forwarding wrapper of the kind the engineering rules bar — nothing new
calls the old path, and the old path is not kept as an alternative for callers to choose. It is kept so
that a command can be tested **against** the method it replaces: run both over the same document and
assert the results agree, which is a far stronger test than asserting a recipe writes the paths its
author expected. Where the two disagree, one of them is wrong, and the old one is what runs today.

That also gives the key-stringification inconsistency and the unbounded step a place to be settled
deliberately: a comparison test states the difference as a difference rather than letting new code
silently inherit or silently drop it.

#### What slice 4 settled

**The session is a slice of the app's store**, `editSession`, beside the others in
`frontend/src/Zustand`. It holds the three layers, the intent sets that are carried out at close
time — the ESI rows to link, the parent and child links, the temporary child jobs — and the loading
flag. A per-editor store in context was the alternative; the slice wins because the SPA has one
store pattern and the narrow selectors the stage exists for come with it.

**`useEditJobSession` hands the page the same shape the reducer did**, with `activeJob` a lens
rebuilt from the layers. That is what lets slice 4 convert the 49 call sites that *change* the job
without touching the hundred that only read it — those are slice 5's.

**A control says what the reader did.** `actions.run(command)` replaces `updateActiveJob(mutatedJob)`
everywhere; nothing mutates the lens, because a write into it reaches nothing and the before-image an
undo step needs would be gone.

**Three commands were owed** that slice 2 had no method to convert: `addCustomTransaction`,
`setJobLayout` and `setJobPricing` existed only as reducer actions. `toggleReadyForSaleFromGroup`
joins them — the reducer stepped the job on a stage as well as marking it, and one thing the reader
did is one step.

**Marking a job finished within its group no longer marks the job changed.** It writes the group's
completion set, which is queued and written on its own path; the job document is untouched. Under a
flag that could be raised without a change, both happened; under a log, a marker with nothing to
record is unrepresentable. `editJobMutators.setups.test.jsx` states it that way now.

**An arriving document reaches the editor through the inbound coalescer**, which hands every job it
applies to `jobArray` to the session too. That is § Settled's requirement — an open editor follows
the document — and it is what makes the leave path below correct rather than merely differently
worded.

**The job the page reads is frozen, and anything that needs to change one takes a copy.** `Job`'s
constructor takes some of the document's own objects rather than rebuilding them — `build.childJobs`
above all — so a control that changes the job in place is writing into what the session holds.

The first answer was to copy the document before building the lens, which made such a write harmless.
It was the wrong way round: it cost a walk of the whole document on every recorded change, against
§ What a component actually reads, and it made the mistake **silent** — the write landed on a copy
nobody read again. Three screens shipped that way before a reader found them.

So the mistake is loud instead, and it takes two freezes to be loud in every case:

- `setBase` freezes the document as it is seeded. Immer freezes what `produce` returns, but a job
  nobody has edited yet has never been through `produce` — without this, the guarantee would start at
  the reader's first change and the first render of every opened job would still be silent.
- `jobLens` freezes the instance built around it. The document being frozen stops a row being written
  to; the instance is a new object, so a field set straight on the job — `job.displayOnPlanner = true`
  — would otherwise still be lost quietly.

The callers that legitimately need a job they can change take one through `workingCopyOfJob`: the save,
which rewrites links and recalculates the tree on the way out, and the two leave paths, which put a job
back into `jobArray` where the planner changes jobs in place all over the app. One copy per save or
close, rather than one per keystroke. Turning Immer's freezing off was the other alternative and is
worse than either: it would make the same mistake silent everywhere, and corrupt the base rather than a
copy.

**None of this is scaffolding for the stages below.** When Stage 5 deletes the lens and `jobArray` goes
plain, the save still takes plain data and builds what it needs; the boundary stays where it is.

**Undo has no control on the page yet, and that is the stage's own wording** — § Stage 3's slices says
undo's decision is taken here "whether or not the UI ships in it". `undoStep` and `redoStep` are
reachable on the session and nothing presses them, so they are provision for a control rather than
dead code. Whoever adds that control is what makes undo testable end to end; until then it is proved
as a pure module.

**Leaving without saving no longer restores an open-time copy.** `backupJob` is gone: the session
already holds the document as the server last stated it, so a close writes that back and keeps
whatever arrived while the editor was open — the defect § Settled describes.

#### Slice 5's steps

Measured before scoping, against the tree as slice 4 left it: **52 files** under `Edit Job` read
`state.activeJob`, **25** receive `{...props}` spread down from `EditJobStepContentSelector`, and there
is **no `memo` anywhere** — so an edit re-renders all of it.

**A panel cannot be held still by narrowing what it reads alone.** A child re-renders with its parent
whatever it subscribes to, which `tests/renderCounts.test.jsx` pins as a rule. So while
`EditJobStepContentSelector` reads the job, every panel beneath it re-renders however well it
subscribes.

**The frame still goes last, because it cannot go first.** The panels reach the job through the props
spread that comes down through the frame, so a frame that stops passing them leaves forty of them with
nothing to read. Holding the chain still by having it subscribe instead only moves the subscription: the
chain then re-renders on every edit, and a panel below it can never reach zero however well it selects.

So each panel is converted once and proved **on its own** — mounted directly over a real store and
counted through a change it reads nothing of, which answers the same question as the page-level count
without waiting for the page. It keeps being handed `state` and `actions` while its neighbours are
converted, and ignores them. The frame drops the spread and narrows its own reads when nothing below
needs it, and that is when the page-level count follows.

**And 18 files read a derived figure** — `buildCost`, `totalMaterialCost`, `totalJobSlots`,
`selectedSetup` and about fifteen more. Fourteen of them are among the 52; the other four reach the job
through a parameter rather than through `state`. A derived figure is a getter, and a getter needs an instance,
so those panels cannot drop the lens until their figures are functions. That is Stage 4's work, and it
means **slice 5 and Stage 4 are the same pass for those panels**: converting a panel's reads without
its figures writes it twice, which § Stage 3's slices forbids. Stage 4 stops being a stage after this
and becomes the second half of each conversion here.

| Step | What it is | What proves it |
|---|---|---|
| 5a — the primitive · **landed** | `useJobDraft(selector)`, reading the open job's draft out of the store and handing the result to the store's own equality check. Nothing converted yet | Its own tests: an unchanged subtree gives the same reference twice, a changed one does not, and a selector building a new object each render is caught rather than tolerated |
| 5b — a panel, and the way to prove one · **landed** | The first plain panel onto `useJobDraft`, and the shape every conversion after it follows: reads through `useJobDraft`, writes through `useJobActions`, no props, and the panel mounted on its own over a real store and counted through a change it reads nothing of. The extras editor, which both the Planning and Complete stages render | Its own render count, 0 through a change to the rest of the job, and red when the selector is widened to the job. Its behaviour is read off the draft that came out rather than off the commands it ran |
| 5c — the plain panels · **landed** | The rest of the panels that read only stored fields. The document-lock hooks went first and are worth their own line: seven of them took the whole `state` to read a job's id and its group, so converting the one file dropped the prop from twenty call sites. They had no tests; they have eleven now, including the cascade that makes a job in the group being worked in answer to the group's lock. Then the Complete stage's three buttons, and the parent-link badge with the dialogue body it mounts — which go together, because the badge was the only thing handing that body the job. Then four of the Selling stage's: the market prices panel, the manual transaction dialogue, and both market-order tabs. Then five of Planning's: the setup panel and its cards, the blueprint library's switcher and its reaction layout, and the archive panel. Then three of Purchasing's: the setup summary, the material cost form and the child-job dialogue's body. Then the three tutorial overlays, and the Selling stage's market order panel with the hook that gathers its orders, which reads the job and the marked links itself rather than taking five arguments. Last, Planning's remaining four — the invention editor, the plan chip, the child-job drawer's hook and the button that opens one — and Purchasing's material card, which a first reading of the count had missed because what it reads of the job it reads through two helpers rather than by name. What is left reading `state.activeJob` is 23 files: 16 derived readers for 5d and the seven the frame is made of, for 5e. Reading the session narrowly is what found the one duplicated rule in the area — which child jobs a material counts, written twice and differing by whether an unsaved child job counts. It is `childJobsAfterEdits` now, with the unsaved job an argument, so the difference between the two screens is stated where the rule is rather than in a second copy of it, and `childJobIDsAfterEdits` beside it for a reader that already holds one material's links. Narrowing also reached `useEffectiveMarketHub`, which took a whole build to read one field off it and now takes the field. The session's own fields are read the same way the job is: `useParentLinkIntents` is the first, named for what it holds rather than one hook taking a path, and narrower than the object the session keeps — parent and child links share one, so a reader of parents would otherwise be woken by every child link taken on. Thirty-eight files read no derived figure; twelve are not panels — `editJob.jsx`, `EditJobStepContentSelector`, the two step layout selectors, the save and delete icons, three tutorial overlays, and three hooks — which 5e takes, leaving 26 | The mutator suites unchanged, plus a render count per panel: editing a material leaves the setup panel at zero |
| 5d — the derived panels · **landed** | The 16 files that read a figure, converted together with the figures they read: each getter becomes a selector in `jobSelectors.js`, checked against the getter it replaces. The figures came first — the ESI id sets, the four costs and the build total over them, the two counts and what a job produces, then the selling side: the fees, the tax still to come, the sales and what they averaged, the job's whole cost and both figures per item. The panels follow: the Purchasing stage's invention card, the Building stage's information panel and both of its tabs, the Complete stage's cost summary and archive button, the Selling and Purchasing stages' figure panels, and the Planning stage's setup editor and blueprint list. Last, the Planning stage's economics, which is the largest join on the page: `useMaterialsSourcing`, `useJobEconomics`, `useJobCommitment` and `useJobSellingContext` each read the draft themselves rather than taking the session, and the panels over them — Materials & Sourcing, Cost Breakdown, Returns, Skills and Production Stats — take nothing. Both Planning layouts now hand their panels nothing at all, which is the first stage to reach that | The comparison tests slice 2 used for commands — both run over one job, results compared — plus the same render counts |
| 5e — the frame, and the props with it · **landed** | `editJob.jsx` narrows to what it draws, the step chain stops reading the job and stops spreading `state` and `actions`, and the lens is read by nothing under `Edit Job`. Every command returns a new `editSession`, so a frame still taking `state` as a prop would re-render however little it reads — the reading and the props go together | The page's render count: an edit the frame reads nothing of stops re-rendering the step content. `editJob.session.test.jsx` holds that number today, before the change. Then `grep` for `state.activeJob` under the page returns nothing, and the whole suite passes untouched. Landed: the count is zero, `useEditJobSession` is deleted, and nothing under `Edit Job` takes `state` or `actions` as a prop. The lens it exported lives in `jobLens.js`, for the two callers that still want a class at the edges. `saveOpenJob` is the one helper the four closing paths share, and the Sentry hints the step boundary attaches read the session themselves rather than being handed it |

**A count is only read over a real store.** The suite's usual stand-in subscribes every caller to the
whole edit session, so a component re-renders on any change to it however narrowly it selects — which a
test asserting on what is drawn cannot tell, and which would leave every count in slice 5 reading the
stand-in rather than the panel. `usersStoreOverSession` in `tests/usersStoreHarness.js` is the store
itself instead: the stub slices as its state, the real session slice over them, and selectors that
subscribe the way they do in the app.

**The defect this stage makes is found by sweeping, not by reading the diff.** Three times a converted
panel has handed stored data to something that wanted a class, and each time the reviews of the diff
passed: the read is somewhere else, in a helper or a child or a row's own class. What finds it is asking
of the whole page, at once, which reads name a member the classes declare and the document does not —
collect those members from `Classes/*.js`, take out what a constructor assigns, and grep the files that
have been converted. What comes back is short, and every entry is either a job from `jobArray`, which is
still a class, or a callback the caller hands an instance to, or a defect. Run it before each batch
rather than after.

**A material card reads its figures through a hook, because its requirement is not on its row.** Every
figure on a Purchasing card — what is needed, what is bought, what it cost, what is excess, whether it
is done — was a getter on `Material`, and the moment the stage handed those cards the stored rows they
all read `undefined`: with completed materials hidden every row vanished, and the sort that puts
unbought materials first stopped sorting. `useMaterialFigures` is the one place that reads the setups
and answers all of them.

Their tests did not catch it because each built a row shaped like the class's own output — carrying
`quantity` and `quantityPurchased`, fields a stored row never has. A fixture that is a document, and a
setup that says what the job needs, is what makes those tests able to fail.

**A figure the job never had.** The available-runs tab gated its bulk link on `activeJob.jobCount`,
which `Job` does not define — so the guard read `undefined`, "Link All" was never disabled however few
slots the job had, and the branch that says the limit is reached could not be entered. Converting it to
`jobSlotsOf` is what surfaced it: a selector has to be named, and there was no figure of that name to
call.

**Two panels drawing the same figures share a hook rather than the six selections.** The information
panel and the cost summary both read what a build cost and what that is per item, which is six narrow
selections and four sums each. `useBuildCost` holds them once. A panel that only draws figures ends up
with one line, and the parts it subscribes to are stated in one place rather than copied beside every
panel that wants them.

**Every figure has a narrow form, and the panels call those.** A panel that had selected the four parts
of a build was still assembling a job-shaped object to ask what they cost, which is the same smell as
passing a fake build to read one field off it. `costOfMaterials`, `costOfInstalls`, `jobSlotsOf` and
`quantityProduced` join the two that existed, and the job-level figures are wrappers over them. Nothing
under the page now builds a job to ask a question about a part of one.

**The rows have derivations too, not only the job.** A linked ESI run is a class as well, and the tab
that lists them draws a progress bar off `progressPercent()` — so converting the panel that reads
`esi.industryJobs` meant `linkedRunSelectors.js` first: what a run says about itself, as functions of the
row. The same will be true of a market order and a transaction when the Selling panels convert. Stage 4
was scoped as the job's getters; it is every class the job holds.

**Every figure a panel can hold the rows for has both forms now.** The ESI id sets, the extras and
invention totals, and the sales in order: each is a function of the rows, with the job-level figure a
wrapper over it. The rule is the one the guard enforces — a set, a list or a sum built fresh each call
cannot be what a panel selects — and the pair is how a panel obeys it without building a job-shaped
object to ask its question.

**A figure a panel already holds the rows for takes a narrow form.** `totalInventionCost(job)` reads the
entries off the job; a card that has just selected those entries would have to build a job-shaped object
around them to ask. So the total is `costOfInvention(entries)` with the job-level figure a wrapper over
it, the same shape `childJobIDsAfterEdits` took. A selector that can only be asked about a whole job
pushes its callers into making one up.

**The class reads the rule from the selector now, rather than holding a second copy.** Which purchases a
job is charged for — cheapest first, ties by id, the rest excess — was written twice the moment the
selector existed, and two copies of a tie-break are how two screens come to disagree about what a
material cost. `Material` calls `countedPurchases` and keeps none of its own. The import runs the wrong
way for a class, into the hooks folder; it goes when the class does, and one rule now is worth more than
a tidy dependency arrow.

**A document arriving mid-edit is normalised like one being opened.** Opening a job seeds the base
through the class, so the draft holds the shape `toDocument` defines. A document arriving over the
socket was written into the base raw — and a job stored before the reshape names its ESI rows elsewhere,
so every figure read off it would have answered nothing until the reader closed the job and opened it
again. The inbound coalescer builds the class for the planner's list anyway, so it hands the editor what
that says. The slice cannot do it itself: the class reads the store, and the store holds the slice.

**A material's requirement is not on the material.** How many of one a job needs belongs to its setups,
so the row carries purchases and nothing else and there is no stored figure to fall behind a resize. The
class hides that behind a getter reading a function it was constructed with; a selector cannot, so every
figure about a material takes the requirement as an argument and `materialRequirement` is where callers
get it. That is the first place in this stage where converting a figure has changed how it is asked for
rather than only where it lives.

**A panel is only plain if what it calls is plain too.** The 18/26 split was measured from what each
file reads of the job itself, and that is not the question: `passBuildCosts` reads a cost per item off
the job it is handed, and `findOrderTransactions` reads the linked transaction ids, so the Complete
stage's cost button and the Selling stage's available transactions are derived readers that name
nothing derived. The button is converted and hands the class over until those figures are selectors;
the transactions panel is 5d's. Before converting a panel, follow what it passes the job to.

**Four call sites close the job the same way.** The save icon, both leave paths and the button that opens
a child job each handed `closeActiveJob` the same six pieces of the session. They call `saveOpenJob`
now, which reads those six out of the store at the moment the reader presses: none of the four draws any
of it, and a control that subscribed to the session to have it ready would re-render on every edit made
anywhere on the page.

**A function that insists on the class is where a conversion goes quiet.** The install cost estimate
opened with `if (!(setup instanceof Setup)) return 0`, so the moment the setup panel read its setups as
stored data every card on the page priced the build at nothing — on screen, correctly formatted, and
wrong. Nothing it reads is a getter, so the gate was a type check standing where a data check belongs.
`calculateTimeForSetup` carried the same gate, and the silence did return one panel over: Production
Stats reads its setup as stored data, and the time per slot went blank. It guards on `rawTime` now — the
figure everything below it multiplies — rather than on what the setup is, and the panel's test lets the
real calculation run over a stored setup, which is what makes the gate visible.

The gate had been hiding a second one: the watchlist has always passed `toDocument()` output to that
estimate, so its build costs have been zero for as long as the gate has been there. They are figures now.

**A test that hands a component what the page no longer hands it stays green while the page throws.**
The Purchasing stage's layout was the one file slice 5 missed: it still read `state.parentChildToEdit`
and `state.temporaryChildJobs` off a prop, and once the step chain stopped spreading the session, the
stage threw on mount. Nothing caught it, because its own test rendered it as
`<Purchasing_StandardLayout_EditJob state={state} actions={actions} />` — props the app had stopped
passing. Three more had the same shape: the material card's cost chips, and both halves of the
child-job dialogue, each calling `actions.run(...)` on a prop their only caller no longer supplied, and
each with a test that supplied it. The rule is that a test mounts a component the way the page mounts
it; where a test passes a prop, that prop has to come from somewhere real.

**A store rebuilt on every read hides a missing dependency.** `usersStoreMock`'s reader form —
`usersStoreMock(() => usersStoreState(...))` — builds its slices afresh each time the store is read, so
a panel selecting `store.jobData` gets a new object every render and every `useMemo` keyed on it
recomputes. Under that harness a memo with a missing dependency cannot be told from one without.
The Purchasing stage's list had exactly that: it filters and sorts on what the setups call for, and
`setups` was not in its dependency array, so resizing a run count left the list as it was until
something else happened to change. The test that proves it had to move the store to the eager form
first. Where a test is about what a memo follows, the store it runs over has to be built once.

**A selector pair is a pair so that nothing has to build a job to ask a question.** Four call sites had
gone the other way — `childJobsAfterEdits({ build: { childJobs } }, …)`,
`completedMaterialCount({ build: { materials, setup } })` — assembling a throwaway document around
parts they already held, to reach the job-level form of a figure whose narrow form takes exactly those
parts. They call the narrow form now. A literal `{ build: … }` under the editor is the smell: the page
holds parts, so it should be asking the question that takes parts.

**A page that reads the job in parts stops redrawing itself.** The number slice 5 was written to move
is one render: an extra cost recorded on the Complete stage re-rendered the step content on every other
stage too, because the frame held the whole job and passed it down. The frame reads nine narrow things
now — the name, the item, the step, the group, the pricing and the three fields the step rules are made
of — and that render is zero. It is held there by `editJob.session.test.jsx`, which fails if any one of
those reads is widened back to the job.

**The harness is where the old shape survives, on purpose.** `editJobHarness.jsx` still assembles
`{ state, actions }` and hands a test a `Job`, because a test asserts on the whole of a job while the
page reads it in parts — `activeJob.salesByDate`, `activeJob.totalJobSlots`, `activeJob.esiJobIDs` are
what a test asks for, and they are the figures the page itself now reads through selectors. That is the
one place left that builds the lens per render, and it is test-only.

**A quantity on a material row is the trap this stage keeps setting.** A stored material carries no
quantity: what a job takes of it is stated by its setups, and the class exposed the sum as a field. Four
separate readers were still asking the row — the sourcing rows, the order type comparison, the row's own
Build control and the bulk costing behind it — and each would have built or priced against `undefined`
in silence. They read `materialRequirementOf(setups, typeID)` now. `materialCostByOrderType` takes the rows
the panel has already built rather than the raw materials, because those carry the requirement and the
raw ones cannot. Any remaining reader of `material.quantity` under the editor is the same defect.

**An action that takes "one or several" has to say so in one place.** `recordSpeculativeChildJobs`
iterated its argument, and the row's own Build control hands it a single job — so pricing one row threw,
where pricing all of them worked. It is the second of these in the same slice, after
`forgetSpeculativeChildJobs`; both fold through `asList` now. The two had been hidden by tests that
stubbed the action, and both surfaced the moment the test moved onto the real store. A session action is
worth testing through the store rather than through a spy for exactly this reason.

**A component and the dialogue body it mounts convert together.** Taking the props off a component
takes them off whatever it renders, which is how the parent-link badge broke the dialogue it opens: the
body still read `state.activeJob`, and it threw the moment a reader pressed the control. Every test
passed, because each one mocked the other half — the badge's test stands in the body, the body's test
mounts it directly, the page's test stands in the badge. The pair is covered end to end now, and the
rule is the general one: what the conversion breaks is the hand-off, so the test has to cross it.

**What could go wrong quietly.** A selector returning a new value each render — `Object.values(...)`, a
`map`, an object literal — subscribes to everything and looks correct. Nothing on screen differs, and
the mutator suites pass either way. The render counts are the only thing that would notice, which is
why they are the proof for every step rather than a closing measurement.

`useJobDraft` refuses one instead of tolerating it: in development it asks the selector twice and throws
when the two answers are not the same object. A selector that cannot settle does not merely re-render
too often — React reads it more than once per render and the page loops. So a conversion selects the
stored value and builds the shape it wants in the component: `Object.values(materials)`, a sort, a
`new Date(...)` are all refused where the selector is, and all fine one line later.

#### What slice 5a settled

**The draft is a field, not something a reader works out.** `draftFor` was a derivation: it replayed the
layers with `applyPatches`, which copies the job it returns, so every call built a new one. A selector
reading anything a change had touched then never returned the same object twice, and a panel subscribing
through the store does not merely re-render too often — the store is asked for its value more than once
per render, and a value that never settles loops. The page died with *Maximum update depth exceeded* the
first time it was measured.

So the layers carry the draft they derive. Every function that returns a changed state returns it
through one rebuild, `draftFor` is a field read, and the state is what holds the identity a reader
compares against.

Holding the answer against the state in a cache beside the module was the alternative, and it is a worse
version of the same thing: it cannot go stale, but it makes a reader's identity depend on something the
state does not say, and the replay still happens — once per state on first read rather than once per
write. What the field costs instead is a discipline, that nothing returns a state around the rebuild,
which is one function to route through and a test per writer that replays the layers itself and compares.

**The render counter counts the panel, not its parent.** `renderCounts().watch` calls the component it
is given rather than rendering it as a child, so what the component subscribes to re-renders the thing
being counted. Rendered as a child, a panel re-rendering itself off a badly chosen selector counts zero
— which is exactly the reading that would make an unconverted panel look converted, and it is the proof
every step below leans on.

### Stage 4 — Getters become functions

Costed as a panel-by-panel conversion, and it is not one any more. Stage 3 took every panel off the
lens: `jobLens` is reached by two controls on the Complete stage — the archive and the cost a finished
job passes up to its parents — and by the two test harnesses, and by nothing else. What is left is the
class itself, measured member by member in
[measurements/inventory.md](./measurements/inventory.md) § Re-measured 2026-09-21.

Three slices, in this order, because each shrinks the one after it.

**4a — what nothing calls comes off.** Twenty members have no caller outside their own tests: the
mutation methods Stage 3 replaced with commands, and the figures only those methods fed. This is not
tidying — every one of them is a second way to change a job that the undo log does not see, and leaving
them is how one gets called again. A member whose only reader is another member of the class stays, and
stops being public.

**What holds them in place is that the tests use the class as their oracle.** `jobCommands.test.js`
runs each command and the class method of the same name over one job and compares the documents, through
its own `agree` helper; `derivedFigures.test.js` asserts that each selector "agrees with the class". That
is deliberate and it is why the conversion has been safe so far, but it means not one of the twenty can
be deleted as unreferenced: the reference is the proof. So 4a is a decision before it is a deletion, and
§ The oracle the tests are written against states it.

`lastRunToFinish` is the one member with no reader at all, and it is **not** removed: it is named as an
input by [building-stage-panels](../building-stage-panels/plan.md) § Stage C, beside `nextRunToFinish`,
which the group job cards already read. Planned work is not dead code.

**4b — the id lists become functions of the document.** `esiJobIDs`, `parentJobIDs`, `childJobIDs`,
`materialIDs`, `esiOrderIDs`, `esiTransactionIDs`, `relatedJobIDs`, `setupSystemIDs` and
`totalQuantityProduced` are each one line over stored fields, and between them they are most of the
class's remaining reach — `totalQuantityProduced` alone is read at 35 sites. They convert as a group
because they share a shape, and the call sites are mechanical.

**4c — the figures with arithmetic in them.** `buildCost`, `totalInstallCost`, `buildCostPerItem`,
`totalExtrasCost`, `totalInventionCost` and their internal summands. Each is read at three or four
sites, so the risk is in the arithmetic rather than the breadth, and each is a selector with a test
that pins the figure before it moves.

Incremental by construction, and the stage that can be paused without leaving anything half-built —
4a on its own is worth landing.

**Stage 1b does not travel with this stage.** It was expected to, on the reading that `materialCount`
and `rawTime` needed a derivation at the same call sites 4b and 4c convert. Measured against the code,
both stay stored — § Stage 1b.

#### What live SoT owes at promote

[`frontend/technical-rules.md`](../../frontend/technical-rules.md) § Class members: getters and methods
teaches the convention from `job.buildCost`, `job.childJobIDs`, `job.materialRequirement(typeID)` and
`job.buildCostPerItem()`. Stage 4 removed all four, and the first two are functions in `jobSelectors.js`
now. The section is not edited while this project runs; it is rewritten in the promotion drafts, and
this is the note that stops it being missed — the promote checklist reads the project's own list, and a
live doc the project never named is not on it.
[`planning-stage-panels/promote/frontend/editjob/cost-breakdown.md`](../planning-stage-panels/promote/frontend/editjob/cost-breakdown.md)
cites `job.buildCost` for the same reason and is a draft bound for the same place.

#### A fixture that names a figure is a fixture nothing reads

The defect 4b kept finding, in three separate bites and a dozen files: a test builds a job stub
carrying the figure as a literal — `totalQuantityProduced: 40`, `materialIDs: [34]`,
`relatedJobIDs: [...]`, `esiJobIDs: new Set()` — rather than the document shape a real job has. While
the class had a getter of that name the stub was at least the same shape as the thing; once the figure
is a function of `build.setup` or `build.childJobs`, the stub names nothing the code reads, and the
selector answers zero or empty without the case noticing.

Two of those cases were hiding a real defect rather than merely being inert. `pricesWanted.js` asked
for the job's output on the buying side as well as the selling one, because `materialIDs` carried what
the job makes as well as what it is made of; the fixtures that should have caught it named their
materials as a flat array, so the loop ran over nothing. The fetch was wasted rather than read, so no
figure was ever wrong on screen — but nothing in either test would have said so.

The rule that follows, for 4c and for anything after it: **a stub stands in for a document, not for the
class's surface.** When a conversion makes a fixture's assertion pass for a new reason, that is the
finding, not a detail of the conversion.

#### The oracle the tests are written against

The class is what the commands and the selectors are proved against, so Stage 4 cannot remove it without
saying what proves them instead. Two ways, and the stage takes the first.

**Each assertion states its own expectation.** A parity assertion becomes the document, or the figure,
written out. It is more to write and it is the only form that survives the class, so it is the one that
matches where the project is going — Stage 5 deletes the class outright, and a test still comparing
against it would have to be rewritten then anyway.

**Or the class stays as a test-only oracle until Stage 5.** Cheaper now, and it keeps a proof that the
new path and the old agree, which is worth something while the conversion is in flight. What it costs is
that the class cannot shrink at all in Stage 4: every member stays reachable, and "unreferenced" stops
meaning anything until the very end.

Taking the first means 4a's work is mostly in the tests, and the deletions fall out of it.

### Stage 5 — `jobArray` goes plain and the lens is deleted

The stage that touches the rest of the SPA. It is what makes inbound deltas applicable to the store
rather than only to an open editor, so it is only worth taking if
[document-write-granularity](../document-write-granularity/plan.md) Stages C and E are being taken.

The lens does not survive as a forwarding wrapper: this stage finishes the cutover or it has not
happened. That is true of the cutover, not of the stage: what a job *is* changes in one step, but what
the rest of the app asks of it can be moved off the class first, a member at a time, while `jobArray`
still holds instances. Taking it in that order is what keeps the cutover itself small.

**Step 1 — the figures that already had a selector.** Their getters were duplicates. The work is in the
tests: the class was the oracle they were written against, so each assertion states its own expectation
before the member it compared against can go — § The oracle the tests are written against.

**Step 2 — the figures that did not.** Write the selector, test it, move the call sites, then take the
getter off. Two of these read the `JobMaterial` class rather than plain data, so they want a material
selector underneath them first, which the row's own getter then delegates to.

**Step 3 — the mutation methods.** Commands of the same name already exist from Stage 3, reachable only
through the draft. A caller outside the editor gets at them through `applyCommands(job, ...commands)`,
and runs the same command the editor does rather than a second statement of the rule. A call-site file
with no test gets one *before* it is converted, written against the method it is about to lose, so the
test passes unchanged either side of the change rather than recording what the conversion produced.

**Step 4 — the cutover.** `jobArray` stops holding instances, the reader and the writer become
functions, and the class and the lens are deleted. This is the step that cannot land in pieces.

The reader is `jobFromDocument`, not `buildJob` as this plan first said: `Functions/JobPlanner/buildJob.js`
already owns that name for the planner's build action, which is the app's own word for adding a job, so
two different things would have read alike.

#### What the setups needed, which was less than it looked

Storing a setup as a plain row looked like a step of its own, because the creation path
(`buildSetupOptions`, `recalculateJobForNewTotal`) stores what `buildSetupFromQuantity` returns, and that
is a `Setup`. The editing path was already converted and had been for a while: `applySetupChange` takes
either shape, wraps it, applies the change and stores the row through the `storeSetup` command, and every
mutator call in the Edit Setup Panel and Blueprint Options goes through it. `useSelectedSetup` reads the
draft, so the setup those calls mutate is already a plain row today.

What is left is three things: `buildSetupFromQuantity` returns the row rather than the instance, which
makes its four callers right without touching them; two `.toDocument()` calls on a setup read off a job in
the watchlist dialogue's frame; and the watchlist dialogue itself, which is the one flow that mutates a
setup held on a job in place — seven call sites of the same shape, needing the wrap-mutate-store that
`applySetupChange` already does, and a helper of its own because it has no edit session to run a command
through.

#### What the material rows needed, which the plan did not say

Step 4 assumed the row classes were already off the job. `Material` never was: after the class went,
**fourteen production reads of its getters** were left across seven files — the shopping list, the Price
Entry dialogue, material pricing, `estimatedMaterialCost`, `jobCostSoFar`, `childJobCostWalk` and
`childJobSupplyForMaterial`. Every one of them is a figure a reader sees, and every one was answering
`undefined`.

Each needs the material's requirement, which lives on the owning job's setups. Where the caller holds
the job that is a lookup; where it does not, the requirement now travels with the material:
`materialCostThroughChildJobs(material, requirement, childJobIDs, rules, ancestry)`, with
`rules.buyCost` becoming `(material, requirement)` and the recursion deriving each child material's
requirement from the child job it already holds. `estimatedMaterialCost` gained the same second
parameter.

#### A second defect, in what an estimate multiplies

`estimatedMaterialCost`'s buy-cost fallback reads
`(market price || purchasedCost(material, requirement)) * requirement`. The market price is per unit, so
multiplying it by the requirement is right; `purchasedCost` is a **total**, so multiplying that by the
requirement charges a part-bought material its whole spend once per unit it needs. A material needing
five units with three ISK already spent is costed at fifteen.

**Recorded rather than taken**, for the same reason as the rig requirement: the cutover is meant to
change no figure, and this one is a pricing decision — whether the fallback should be the spend so far,
the spend per unit bought, or the market price of what is left. It was in the code before this project
and is preserved exactly.

#### Two defects in the install cost, one fixed

Checking the requirement tables against ESI turned up two faults in
`Functions/Installation Costs/installCosts.js`, neither of them this project's work.

**Fixed: an alpha clone was charged a hundredth of its surcharge.** `ALPHA_CLONE_TAX` is `0.25`
meaning 25%, the way `SCC_SURCHARGE` is `0.04` meaning 4%, but `findCloneValue` divided it by 100 and
charged 0.25%. The install cost is derived at read time and stored nowhere, so correcting it moves no
saved figure — it was taken here rather than recorded. Its test had pinned the wrong rate
(`1000 * 0.0025`) and now states the real one in its name.

**Recorded: `findFacilityTax`'s NPC-station branch cannot fire.** It compares `structureType` against
`structureTypeMap[jobTypes.manufacturing].id` and returns
`structureTypeMap[jobTypes.manufacturing].defaultTax / 100`, but that map entry is the *collection* of
manufacturing structures keyed by id, so both reads are `undefined` and the branch answers `NaN`.
`defaultTax` is named once in the codebase, here, and defined nowhere. It is unreachable today because
`Setup` defaults `structureID` to `0`, so it is dead rather than harmful — but it is the only trace of
an intended rule, that an NPC station charges a fixed tax rather than the setup's own `taxValue`.
Deleting it would erase that intent, so it wants deciding rather than tidying.

#### A defect this found, which the cutover does not fix

`Setup.gatherRequirements` asks for three sources of requirements and only ever gets two. It calls
`this.getObjectRequirements(this.getRigObject)`, and **`getRigObject` is not a member of the class** —
`getObjectRequirements` guards on `typeof getObjectFunction !== "function"` and answers null, so a
requirement carried by the rig is never gathered and the guard hides it.

It is not inert. `structureOptions.manRigs[9]` — "Faction - ME - All" — carries `requirementID: 1`, and
that requirement holds an `alternativeSystemValue`. `calculateMaterialsForSetup` reads that through
`getSystemData`, so a setup using that rig should take its system multiplier from the requirement — 0.1
in high sec — and instead takes the system's own value of 1. The figure it feeds is the material
quantity.

**Recorded rather than taken.** `materialCount` is stored on the setup, so correcting this changes saved
figures for every affected job rather than only what is shown, which makes it a data question and not a
tidy-up. It wants deciding on its own terms — whether the requirement was meant to apply, and what
happens to setups already stored against the wrong multiplier — rather than riding a cutover that is
meant to change no behaviour at all.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | **Done** |
| Stage 1 — the removals | **Landed.** `Purchase.TypeID` and `ArchivedJobFeeLine.FeeID` are gone from the models, their writers and the parity fixtures. `complete` and `CharacterHash` on stored fee rows needed no code change — neither was on the broker fee in either language, so they are stored residue Stage 2's fold drops. `esiJobTab` / `setupToEdit` / `resourceDisplayType` are **deferred to Stage 3**, two of the three being read; § Stage 1 says why |
| Stage 1b — the derived setup figures | **Closed, nothing to do.** Split out of Stage 1, which had costed it as a removal it is not. `estimatedTime` and `estimatedInstallCost` no longer exist to remove. `materialCount` and `rawTime` are deliberately stored: a setup is meant to be passable on its own, `rawTime` cannot go stale against a snapshot, and Go has no material formula to derive `materialCount` from. Stage 2's conversion must not prune either — § Stage 1b says what happened when it did |
| Stage 2 — the reshape, in the release window | **Landed, awaiting the window.** `tasks reshapeJobDocuments` converts a document and is a required `prepareRelease` step, proved against a restored copy of live — 42,065 documents, none refused, 1m32s, see [overlay.md](./overlay.md) § Stage 2. All eight collections are keyed on both sides, the observations sit under `esi`, and the broker fee is folded onto its order. The SPA's `Job` constructor reads the pre-reshape paths as well, so a document written before the window still loads. Behind it the row-key gate has run against a live snapshot: five collections key cleanly, linked jobs repeat only as identical duplicates, and the rest have a rule each, per § The grouping follows the write rule |
| Stage 3 — base, log, scratch and draft | **Landed — slices 1, 2, 2a, 3, 4 and every step of 5.** The layers hold a job and derive a draft; every way of changing a job is a command; two derived figures are selectors; a step can be taken back and put again; and the editor now runs on the store rather than its reducer, which is deleted. Immer is settled and declared, pinned to the version already resolved. §§ How a job is held, Undo, A what-if is not a change and A change arriving mid-edit carry the shape, and § Settled that an open editor follows the document. Measured rather than assumed — [measurements/inventory.md](./measurements/inventory.md) § Re-measured 2026-09-20. Every panel that reads only stored fields reads them out of the
store and is proved by its own render count — the document-lock hooks, the extras editor, the Complete
stage's buttons, the parent-link badge and body, five of Selling's, five of Planning's, three of
Purchasing's and the three tutorial overlays. No file under the editor reads `state.activeJob`, where 52 did:
the page has no prop-drilled session left, and an edit the frame reads nothing of
re-renders nothing. Next: Stage 4 |
| Stage 4 — getters become functions | **Landed.** Re-scoped first: Stage 3 took every panel off the lens, so the panel-by-panel conversion it was costed as no longer exists. 4a removed twenty members — every mutation method the commands replaced, the figures only those methods fed, and `totalSales`, which lost its last reader inside the class when `averageItemSalePrice` went. Nineteen of the twenty measured; `lastRunToFinish` stayed, being named as an input by another project, and `totalSales` came off in its place. `materialRequirement` stayed and became private. `Classes/job.js` is 1,076 lines, from 1,405. The work was in the tests: the class was their oracle, and each assertion now states its own expectation — § The oracle the tests are written against. 4b took all nine id lists, in three bites: `setupSystemIDs` and `materialIDs`, then the three ESI sets, then `parentJobIDs`, `childJobIDs`, `relatedJobIDs` and `totalQuantityProduced`. `Classes/job.js` is 985 lines, from 1,405. What the conversion kept finding is below. 4c took the cost figures — `totalInstallCost`, `totalExtrasCost`, `totalInventionCost`, `buildCost` and `buildCostPerItem` — whose production reach was seven files, most of what looked like a call site being a JSDoc name or a figure on something that is not a job. `Classes/job.js` is 919 lines, from 1,405. What is left on the class is the four summands only its own members read, `totalCostPerItem`, and the mutation methods with live callers, which are Stage 5's. The measurement the three slices were cut from: [measurements/inventory.md](./measurements/inventory.md) § Re-measured 2026-09-21 |
| Stage 5 — `jobArray` goes plain | **Landed.** Nothing outside `Job` asks an instance for anything any more. The figures that were still getters are selectors — some already had one of the same name and the getter was a duplicate, the rest were written and tested before the getter came off — and `boughtCost` / `purchaseComplete` were added as material selectors first, because two of them reached into `JobMaterial` rather than plain data. The eleven mutation methods are gone in favour of the Stage 3 commands, reachable outside the editor through a new `applyCommands(job, ...commands)`, which moved 42 method calls across 14 files. The work was again mostly in the tests: the oracles that proved the new path by agreeing with the class member now state their own expectations, and the three call-site files with no tests were given them first, written against the old implementation so they pass unchanged across the conversion. `Classes/job.js` is 533 lines, from 929. **Step 4, the cutover, is landed**: `Classes/job.js` and the lens are deleted, `jobArray` holds plain documents, and the class's four remaining jobs are functions in `Functions/JobDocuments/jobDocument.js`. It reached further than this plan costed it, because the plan assumed the row classes were already off the job and `Material` never was — §§ What the setups needed and What the material rows needed say what that added. Five live faults came out of it: two deleted `Job` methods still called in production (`passBuildCosts`, `buildJob`), `applyLatestOrderData` calling a `MarketOrder` method on a row, fourteen `Material` getter reads across seven files, and a missing argument in `buildShoppingList` that made a shopping list quantity `NaN` — which had no test at all and now has one. See [overlay.md](./overlay.md) § Stage 5 |

## Settled

**An open editor follows the document; the lock decides who may write, not what is shown.** A member
with a job open sees changes as they land, whether or not they hold the lock. A reader holds no log, so
there is nothing to rebase and nothing of theirs to lose — § Two readers of one job already makes reading
and drafting one mechanism differing only in whether the log is empty, and this is that sentence applied
to the screen.

The case this answers is the ordinary one on a shared planner, and it is broken today: the editor seeds
from the store once, guarded by `if (jobID === currentActiveJobID) return;` in `useEditJobInitialState`,
and never reads it again. So a member watching a job another member is editing keeps the copy they
opened. When the holder saves and the lock frees, the watcher takes it and **begins editing a document
that is already stale**, then writes it back over the holder's work on close. The lock machinery
announces the hand-over — `useLockVacancySnackbar` says *"You now hold the edit lock"* — while nothing
re-seeds what the editor is showing.

**So the concrete requirement is that `base` is replaceable while the editor is open**, which is the
rebase in § A change arriving mid-edit rather than anything additional. A watcher's base is replaced as
documents arrive; a drafter's log re-applies over the new base and is reviewed per command when they take
the lock, per § The merge, when the lock frees.

**What this removes from the design.** With the lock held for the whole session and released on save, two
members never hold overlapping logs against one job, so a member-versus-member collision on a locked job
has no producer. Per-field inline accept-or-reject for competing edits is not built, and nothing prompts
mid-edit. What remains inbound to a held job is the observation zone — an ESI refresh rewriting linked
jobs, orders and transactions — which is disjoint from what the player is typing and absorbs into the
base silently.

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

**`build.materials` keyed by `typeID` holds, and the gate found its trouble elsewhere.** The reaction
case this was raised against is answered by a count rather than an argument: 224,995 material rows
across a live snapshot, no job carrying two of one type, because a restacked formula is one row with a
larger quantity. Skills, purchases, extras costs and invention entries are equally clean, and linked ESI
jobs repeat only as identical duplicates the map collapses. What the count did find is two collections
whose key does not identify a row, and one of those is a collection this project stops having: a broker
fee folds onto the order it was charged for, per § A fee belongs to its order.
[measurements/row-key-uniqueness.md](./measurements/row-key-uniqueness.md) carries the numbers.

The gate stands for Stage 2 regardless: it is re-run against live, not the snapshot, before anything is
written, because the two sale collections are the ones that grow.

**That makes it a `prepareRelease` step rather than a fan-out command.** An array-to-map conversion is
expressible as an update pipeline — `$arrayToObject` over a `$map` producing `{k, v}` pairs, with
`$toString` on numeric keys and `$ifNull` for an absent array — so the server rewrites each document
without the migration reading it. Mongo 8 is what runs, and both update-with-pipeline and
`$arrayToObject` are long established there. That expressibility is what made an in-window step look
affordable, and § Why the window decides the order is why it goes inside the release's own copy.

**In the event it did not need to be a pipeline at all**, and the step reads each document instead —
which is what lets it refuse one it cannot account for. § A row collection whose key does not identify a
row has the timing that settled it.

**Settled by running it: the step reads and rewrites, and the window does not notice.** The whole
question of whether the conversion had to be a server-side pipeline was about window time, and 42,065
documents convert in 1m32s. So the reshape is a `prepareRelease` step that reads each document — which
is also what lets it refuse one it cannot account for, something a pipeline cannot do. The fee fold, the
minted id and the `layout` fold all stop being awkward the moment reading is allowed.

**Its own step, not folded into the owner stamp.** They write to overlapping collections, so merging them
looks like a free saving of one pass. It is not, and the reason is the stamp's filter: it selects
documents carrying an account id and no owner, which is what makes it resumable and repeatable, and it
excludes every document already stamped — which, after the rehearsals, is all of them. A reshape sharing
that filter skips exactly the documents it exists to rewrite and reports success. Widening the filter to
cover either condition then makes the step's own `ModifiedCount != eligible` assertion unwritable,
because `eligible` counts two different populations.

Four smaller reasons point the same way. The stamp covers seven collections and the reshape three. The
stamp is `required` because the steps after it read its output, so a reshape bug would halt the release
at the step everything else is built on. The reshape has a precondition the stamp has no equivalent for
— the repeated-key count in § Settled, which has to pass before anything is written. And they are not the
same kind of operation: the stamp is a server-side pipeline that never reads a document, where the
reshape reads each one so it can refuse the ones it cannot account for.

**The alternative worth weighing is pre-window, not merged.** If the window's length is the concern, the
lever is the fan-out shape § Why the window decides the order describes. Its cost is not recorded there:
a rewrite running ahead of the window means the SPA and the API read both shapes until the deploy, which
the in-window step avoids by construction.

**A market order holds one broker fee, and the oldest is the one it holds.** 42 archived orders carry
more than one entry, and what the extras are was never established — § A fee belongs to its order has the
measurement and the two readings it could not choose between. Rather than carry the ambiguity into the
shape, the conversion keeps the entry the listing was charged and drops the rest: 814 rows, 489.8M ISK,
whose statistics follow on the rebuild. Most of that is duplicate rows the cost paths have been summing
more than once, so the consolidation corrects figures as much as it drops them. A single field then makes a second entry
unrepresentable, which is what stops the question arising again.

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

**What does a collision do to a drafter at merge time?** Narrowed by § Settled, which decides that an
open editor follows the document and that a member-versus-member collision on a *held* job has no
producer. What is left is the drafter who built a log without the lock and takes it later: § The merge,
when the lock frees gives them four outcomes per command, and *conflicts* is the one needing a surface.

*Leaning: mark the command with both values and let the drafter choose, per command rather than per
path.* Per command is what § Undo's grouping already gives, and reviewing *set run count to 40* is a
question a player can answer where reviewing eleven paths is not. This stays shared with
[document-write-granularity](../document-write-granularity/plan.md) § Stage B, which faces the same
question for a refused write.

**Does a watcher need telling what changed, or only showing it?** § Settled decides they see changes as
they land. Whether an arriving change is also announced — a marker on the panel that moved, a line saying
the holder saved — is not decided.

*Leaning: show, do not announce.* A watcher is reading, and a document that quietly stays current is what
every other surface on the planner already does. An announcement earns its place only where the reader
would otherwise act on something stale, which for a watcher with no log they cannot.

## Non-goals

- **Undo after a save.** § Undo says why.
- **Changing which documents the close-time cascade reaches.** The cascade is inherent to how jobs
  relate. This project makes its output field-scoped per document and leaves its reach alone.
- **A UI redesign of the edit page.** The panels are readers of the draft. What they ask and how they are
  laid out belongs to [planning-stage-panels](../planning-stage-panels/contents.md).
- **Removing the document lock.** How broad it needs to be is
  [document-write-granularity](../document-write-granularity/plan.md) § Stage D.
