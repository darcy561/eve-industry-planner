# Job document drafts — behaviour overlay

How the job document and the edit page behave **while this project is in flight**. On overlap with live
SoT, this file wins for the surfaces below until the project promotes.

Nothing has landed. A job document still carries every field it carries today, and the edit page still
rebuilds a `Job` instance on every change, as [plan.md](./plan.md) § Starting position describes.

## Stage 1 — The removals

*Not landed.* Stage 2's conversion prunes these fields from stored documents, but that is the storage
half only: the writers still emit them, so a document saved after the release carries them again until
this stage lands.

The four derived setup figures are still persisted beside the fields they are derived from, and
`materialPriceOverrides` still sits under `layout`.

Owed here: what a job document carries after the removals, and when a derived setup figure is now
computed.

## Stage 2 — The reshape, in the release window

*The conversion is built and wired in. It has not run against live.*

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
every document, `archiveProcessed` from 9,129, and the four derived setup figures from 45,385 setups.

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
