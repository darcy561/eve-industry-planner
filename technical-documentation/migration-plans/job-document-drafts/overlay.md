# Job document drafts — behaviour overlay

How the job document and the edit page behave **while this project is in flight**. On overlap with live
SoT, this file wins for the surfaces below until the project promotes.

Stage 1 has landed. Everything else is as [plan.md](./plan.md) § Starting position describes: the edit
page still rebuilds a `Job` instance on every change.

## Stage 1 — The removals

*Landed.*

A purchase row no longer states a type. Which material it bought is the material it sits under, so
`models.Purchase` has no `TypeID` and `jobMaterial.js` no longer stamps one onto a row it creates. Every
consumer already read the material's own `typeID`; nothing read the row's copy.

An archived fee line no longer carries `FeeID`. `buildFeeLines` wrote it from the journal entry id and
nothing read it back — and that id is shared between orders listed together in one multi-sell, so it was
never an identity for the fee in any case.

Two fields the row-key gate named needed no code change: neither `complete` nor `CharacterHash` is on
`models.BrokerFee` or the SPA's `BrokerFee` class. They exist only on stored rows, and Stage 2's prune
is what clears them.

`materialPriceOverrides` still sits under `layout`, and so do `esiJobTab`, `setupToEdit` and
`resourceDisplayType` — deferred, two of the three being read. [plan.md](./plan.md) § Stage 1 says why.

## Stage 1b — The derived setup figures become derivations

*Not landed.* Split out of Stage 1, which had described all four as removals — see
[plan.md](./plan.md) § Stage 1b.

`estimatedTime` and `estimatedInstallCost` are already absent from the writers, so what remains for them
is the stored residue the Stage 2 conversion clears. `materialCount` and `rawTime` are still persisted
beside the fields they are derived from, and still read: the cost calculation and the time calculation
consult them in both languages.

Owed here: where each of the two is now derived from, and what a setup carries once neither is stored.

## Stage 2 — The reshape, in the release window

*The conversion is built and wired in. All eight row collections are keyed in `models.Job`; five of the
eight are keyed in the SPA as well.*

### Which collections are keyed

`skills`, `build.materials`, each material's `purchasing`, `build.costs.extrasCosts` and
`build.costs.inventionEntries` are maps in `models.Job` and in the SPA, keyed by the id each row
carries — a type id for skills and materials, an app-minted id for the rest.

The SPA holds the same shape the document does rather than converting at the `Job` boundary. A reader
asks the collection for a row by its id instead of searching for one, and a row is removed by deleting
its key. [plan.md](./plan.md) § Stage 2 says why the keying does not stop at the document.

### What ESI observed moved to `esi`

The three ESI collections left `build.costs` and `build.sale` for a top-level `esi`, keyed by the id
ESI itself assigns: `linkedJobs` by `job_id`, `marketOrders` by `order_id`, `transactions` by
`transaction_id`. `JobSale` is left holding only its selling plan.

**Their rows are pointers.** `jobidentity` takes the address of each row's identity fields so
encryption writes refs back in place, and a map value is not addressable — so `map[string]*T` is what
makes the keying possible at all here, and the type carries a comment saying so. The cost is that a
row is shared rather than copied when a job is: anything filtering one of these collections into a
new job hands on the same rows. `client_shape_parity_test.go` copies row by row for exactly that
reason, and `targets` skips a nil row rather than dereferencing one, because a stored `null` decodes
to one.

**A broker fee stopped being a row.** It carried no identity of its own — the journal id it arrived
with is shared between orders listed together in one multi-sell — so it folds onto the order it was
charged against as `fee`, `salesTax` and `feeDate`, and `models.BrokerFee` is gone. A fee with no
order has nowhere to live, which is what the conversion's 5 dropped fees (45.3M ISK) already
reported.

**The SPA still reads all three as arrays under the old paths**, across 55 production sites — more
than the other five collections together. So a converted document and the SPA disagree about these
three until that lands, which is what keeps the reshape a single cutover rather than something that
can ship in pieces.

### What keying changed beyond the shape

**Two orderings had to be stated rather than inherited.** A map holds no order, so anything reading one
that was relying on the array's had to say what it wanted. The `Job` constructor sorted materials by
name; the panel that lists them sorts at render instead. `countedPurchases` — the SPA's and
`models.JobMaterial`'s — sorted purchases by cost alone, so equal-cost rows were free to swap and each
row's own counted share moved with them; both break the tie on id, the same way.

**Stored lists had to become deterministic.** `extraCategories` builds the category list written onto
an archived job's statistics row. Ranged over a map it would write a different document on each
rebuild, so it walks the rows in id order. The same row's transaction and fee lines do too, now they
come from keyed collections. `LinkedESIJobIDs`, `LinkedOrderIDs` and `LinkedTransactionIDs` sort for
a related reason: the group shape stores them, and `esilinks` compares them with `slices.Equal`.

A sum or a minimum is left ranging the map, where order cannot change the answer —
`earliestLinkedJobDate` and the cost totals say so on themselves, so the distinction is not mistaken
for an oversight.

**A job with no materials holds an empty collection rather than null.** The null was a second way of
saying the same thing, and nothing read it.

### What performs it

`tasks reshapeJobDocuments` converts stored job documents to the reshaped form. It reports and writes
nothing unless given `-write`, which is the opposite of the release steps and deliberate: it rewrites
every job a planner holds, so the outcome is read first and applied second. `-database` points it at a
restored copy, which is where reading it first is worth anything.

The same conversion is step `reshape every job document` in `prepareRelease`, marked required. It sits
after `stamp extras category labels onto jobs`, which writes into the extras rows while they are still
an array, and before `queue every account for rebuild`, which derives its figures from what the reshape
leaves behind. `releaseTouchedCollections` folds in the reshape's own collection list, so the
`_pre_0_9_0` copies cover the job collections and `revertRelease` restores them by the same suffix.

### What it does to a document

Row collections become maps keyed by the id their rows carry; `build.costs` and `build.sale` go, with
the observations moving to `esi`; a broker fee folds onto its market order as one `fee`, the oldest
kept; a hand-entered sale with no id is minted a negative one before the keying; two rows for one order
collapse into whichever observed more history; and `layout` empties into `build`. Anything the reshaped
shape does not hold is dropped and counted by name.

Two rules the conversion enforces rather than assumes. **A row's id is settled before anything is keyed
by it** — mint first, or the rows carrying nothing collapse onto one key. And **a collapse is only
allowed where the rows are identical**: rows that differ under one key refuse the document rather than
converting over whichever was visited last. A refused document is left exactly as it was, and
`alreadyReshaped` skips a converted one, so a failed run is resumed rather than repeated.

### What it reported against a restored copy of live

42,065 documents, none refused: 433,562 rows keyed, 58,393 purchase `typeID`s dropped, 217 transactions
minted, 245 invention entries stamped v1, 3,668 duplicate rows collapsed, and 3,340 fees folded — with
814 dropped in favour of the oldest on their order (489.8M ISK) and 5 dropped for having no order
(45.3M ISK). Also dropped, by name: `apiJobs`, `apiOrders`, `apiTransactions` and `build.products` from
every document, `archiveProcessed` from 9,129, and the derived setup figures from 45,385 setups.

**That last figure was four fields and is now two.** The conversion pruned `materialCount` and `rawTime`
as well, which a later `prepareRelease` run against dev showed it must not: both are still read, and a
converted job's material cost computes as zero without them — [plan.md](./plan.md) § Stage 1b has the
mechanism and the counts. That run was reverted. `derivedSetupFields` now holds only `estimatedTime` and
`estimatedInstallCost`, so the figures above are a report of what the wider list did, not of what the
step does today.

**It took 1m32s**, which settles what § Settled left open: a conversion that reads and rewrites each
document does not cost the window anything worth avoiding, so the reshape did not need to be expressible
as a server-side pipeline, and the fee fold — the one operation correlating two sibling arrays — did not
have to be either.

### What proves it

Unit tests over the conversion as a pure function, a live Mongo test for the write path and a second run
over the same document, and three guards in `prepare_release_test.go`: the step's position, the backup
covering its collections, and its required flag.

## Stage 3 — Base, log, scratch and draft in the editor

*Not landed.*

The edit page still holds one `Job` instance in a reducer, still marks the whole job modified on any
change, and still keeps a second copy of the job in a ref for discard.

Owed here: what the draft store holds, how a component subscribes to part of a job, what one undo step
is, what separates a change from a what-if and what each is allowed to reach, what the `Job` lens is
still used for, what happens to a reader's edits when another member's change arrives, and which surfaces
show uncommitted changes and which show what is committed. Also owed: what a member without the lock can
do, and what their draft is reviewed against when the lock frees.

## Stage 4 — Getters become functions

*Not landed.*

Derived figures are still getters on `Job`, and reading one still requires an instance.

Owed here: which figures have moved, what a converted panel reads instead, and what is still reached
through the lens.

## Stage 5 — `jobArray` goes plain and the lens is deleted

*Not landed.*

`jobArray` still holds `Job` instances, the inbound coalescer still reconstructs them on delivery, and
`toDocument()` is still the persistence contract.

Owed here: what the store holds, how a job reaches the save path, and confirmation that the lens is gone
rather than kept as a wrapper.
