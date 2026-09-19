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

A setup stores `materialCount`, `estimatedTime`, `rawTime` and `estimatedInstallCost`, all recalculated
from the run count, ME, structure and system index it sits beside. Stored, one changed run count has to
write five paths, any of the four can disagree with its inputs, and two members can hold different
values for a number neither of them chose.

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
pricing basis is a decision about the job. So this part of the bag is not view state at all.

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

The stored derived setup figures out; `esiJobTab`, `setupToEdit` and `resourceDisplayType` out, per
§ `layout` stops existing; and `Purchase.TypeID` out. Cheapest first because removals need no upgrader —
the writer stops writing them and stored copies age out.

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

**What remains of this stage is the SPA and the API reading the new shape.** The conversion moves the
documents; nothing yet reads what it produces.

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
| Stage 1 — the removals | **Not started, and unblocked.** Scope is settled: the four derived setup figures, `esiJobTab` / `setupToEdit` / `resourceDisplayType`, and `Purchase.TypeID`. No window, no dependency, no upgrader |
| Stage 2 — the reshape, in the release window | **Built and wired in; not run against live.** `tasks reshapeJobDocuments` converts a document and is a required `prepareRelease` step, proved against a restored copy of live — 42,065 documents, none refused, 1m32s, see [overlay.md](./overlay.md) § Stage 2. What remains is the SPA and the API reading the new shape, which is the rest of this stage. Behind it the row-key gate has run against a live snapshot: five collections key cleanly, linked jobs repeat only as identical duplicates, and the rest have a rule each, per § The grouping follows the write rule |
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

**What does a collision do to the reader?** § A change arriving mid-edit detects one; what the editor
*does* is a product decision shared with
[document-write-granularity](../document-write-granularity/plan.md) § Stage B, which faces the same
question for a refused write. Neither should answer it alone.

*Leaning: mark the field with both values and let the reader choose inline; never prompt.* A modal
arriving mid-edit interrupts work over a case that is rare and usually uninteresting, and taking the
inbound value silently is the loss this whole design exists to stop. Marking also matches what § The
merge, when the lock frees already does — the same choice, made in the same shape, in the two places it
arises.

## Non-goals

- **Undo after a save.** § Undo says why.
- **Changing which documents the close-time cascade reaches.** The cascade is inherent to how jobs
  relate. This project makes its output field-scoped per document and leaves its reach alone.
- **A UI redesign of the edit page.** The panels are readers of the draft. What they ask and how they are
  laid out belongs to [planning-stage-panels](../planning-stage-panels/contents.md).
- **Removing the document lock.** How broad it needs to be is
  [document-write-granularity](../document-write-granularity/plan.md) § Stage D.
