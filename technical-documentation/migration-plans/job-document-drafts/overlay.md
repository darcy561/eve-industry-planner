# Job document drafts — behaviour overlay

How the job document and the edit page behave **while this project is in flight**. On overlap with live
SoT, this file wins for the surfaces below until the project promotes.

Stages 1 and 2 have landed. Everything else is as [plan.md](./plan.md) § Starting position describes:
the edit page still rebuilds a `Job` instance on every change.

## Stage 1 — The removals

*Landed.*

A purchase row no longer states a type. Which material it bought is the material it sits under, so
`models.Purchase` has no `TypeID` and `jobMaterial.js` no longer stamps one onto a row it creates. Every
consumer already read the material's own `typeID`; nothing read the row's copy.

An archived fee line no longer carries `FeeID`. `buildFeeLines` wrote it from the journal entry id and
nothing read it back — and that id is shared between orders listed together in one multi-sell, so it was
never an identity for the fee in any case.

Two fields the row-key gate named needed no code change: neither `complete` nor `CharacterHash` was on
the broker fee in either language. They exist only on stored rows, and Stage 2's prune is what clears
them — as it now clears the fee row itself, which Stage 2 folds onto its order.

`esiJobTab`, `setupToEdit` and `resourceDisplayType` still sit under `layout` — deferred, two of the
three being read. [plan.md](./plan.md) § Stage 1 says why. `materialPriceOverrides` and `localPricing`
no longer do: Stage 2 moved them, below.

## Stage 1b — The derived setup figures

*Closed with nothing to do.* Split out of Stage 1, which had described all four as removals — see
[plan.md](./plan.md) § Stage 1b.

`estimatedTime` and `estimatedInstallCost` are already absent from the writers, so what remains for them
is the stored residue the Stage 2 conversion clears. `materialCount` and `rawTime` stay stored: a setup
is meant to be passable to a calculation on its own, `rawTime` cannot fall behind a snapshot that never
changes, and Go has no material formula to derive `materialCount` from.

Nothing is owed here beyond the conversion continuing not to prune those two.

## Stage 2 — The reshape, in the release window

*Landed on both sides. All eight row collections are keyed, the observations sit under `esi`, and the
conversion writes what both languages read.*

### Which collections are keyed

`skills`, `build.materials`, each material's `purchasing`, `build.extrasCosts` and
`build.inventionEntries` are maps in `models.Job` and in the SPA, keyed by the id each row carries — a
type id for skills and materials, an app-minted id for the rest.

The SPA holds the same shape the document does rather than converting at the `Job` boundary. A reader
asks the collection for a row by its id instead of searching for one, and a row is removed by deleting
its key. [plan.md](./plan.md) § Stage 2 says why the keying does not stop at the document.

### What ESI observed moved to `esi`

The three ESI collections left `build.costs` and `build.sale` for a top-level `esi`, keyed by the id
ESI itself assigns: `industryJobs` by `job_id`, `marketOrders` by `order_id`, `transactions` by
`transaction_id`. Rows are values, like the other five keyed collections. `linkedJobs` is the one
field the plan renames as it moves, for the reason [plan.md](./plan.md) § The grouping follows the
write rule gives.

**`models.Job` now splits on who said so, and only two levels deep.** `build` is what the player
decided — `setup`, `materials`, `extrasCosts`, `inventionEntries`, `sellerCharacter`,
`saleLocationID`, `localPricing` and `materialPriceOverrides`, each flat on it. `esi` is what the
world reported back. `JobCosts` and `JobSale` are both gone, along with the `costs` and `sale` levels
they described: each held a decision beside an observation, so neither told a reader which write rule
its contents followed.

`layout` keeps `esiJobTab`, `setupToEdit` and `resourceDisplayType`, which are the SPA view state
Stage 3 retires. Its hand-written decoders stay for the `marketLocation` and `orderType` keys some
stored rows carry.

**Keying these three needed `protectedfields` to change, not the model.** `jobidentity` takes the
address of each row's identity fields so encryption writes refs back in place, and a map value is not
addressable. A `protectedfields.Target` may now carry a `Store`, so a row held in a map points at a
copy and files that copy back under its key — and `jobidentity` is that package's only consumer, so
the change reaches nothing else. The alternative, `map[string]*T`, was built first and reverted: it
put nil checks in every loop and made a row shared rather than copied when a job is, which is a
footgun on the most-copied document in the app.

**A broker fee stopped being a row.** It carried no identity of its own — the journal id it arrived
with is shared between orders listed together in one multi-sell — so it folds onto the order it was
charged against as `fee`, `salesTax` and `feeDate`, and `models.BrokerFee` is gone. Three fields
rather than a row nested under `fee`: what is left once the identity goes is three scalars, and
nesting them would leave every total reaching through an object for a number.

*This one moves money, and is the only part of the reshape that does.* Against a restored copy of
live, 3,340 fees folded: **814 were dropped in favour of the oldest on their order (489.8M ISK), and
5 dropped for having no order at all (45.3M ISK)**. A job whose fees were duplicated across one order
gets cheaper by the difference. The rule is that a fee belongs to an order and an order has one fee,
so rows beyond the first were the same charge observed more than once — but the figures above are
what a reader should check before the release, not after.

**The SPA holds the same shape**, across the 17 files that reach these collections. Its `Job`
constructor still reads the old paths as well as the new ones, which is what lets a document written
before the release load unchanged; nothing else in the SPA knows the old shape.

**A fee with no date is read the same way in both languages.** A row that cannot be shown to be the
older one does not displace a row that can — the conversion compared the two dates as strings, where
a missing date sorts before every real one, so it had been keeping the undated row while the SPA kept
the dated one. A job's cost moved depending on which language last wrote it.

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
the observations moving to `esi`; a broker fee folds onto its market order as `fee`, `salesTax` and
`feeDate`, the oldest kept; a hand-entered sale with no id is minted a negative one before the keying; two rows for one order
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

## Stage 2c — An extras id is a string, in the documents too

**Built, and a `prepareRelease` step directly after the reshape.**
[`release_extras_invention_rows.go`](../../../services/core/commands/release_extras_invention_rows.go)
walks the three job collections the reshape walks, and runs after it, so every row it reads sits in a
keyed `build.extrasCosts` or `build.inventionEntries` map.

**A row is rewritten only where a value it holds is stored in a type its model does not write.** Each row
is read through `models.ExtraCost` or `models.InventionEntry` and written back as that model writes it,
which settles the whole row rather than patching the id — but only for a row where some field it holds
reads differently once the model has written it. A correctly typed row is left exactly as stored. That
matters for the 865 extras rows carrying no category: rewriting them all would file each under the
unassigned category, which is what every reader already resolves them to, but is not this step's change
to make. A row that *is* rewritten does come back filed there, because that is what the model writes.

Against the live snapshot that is the 245 invention entries, whose ids are all numbers, and nothing
else. Each is written back under the key the reshape already filed it under: the reshape keys a numeric
id by its integer digits, and the model reads it to the same digits, so the key and the id agree. A row
whose id reads differently from its key is refused rather than written as a row the map cannot find.
Every collection is walked before the step answers, as the reshape does, so a refusal in one leaves the
others normalised and the step then fails naming each refused row beside what each collection did.

It is not a required step: nothing after it reads what it writes, so a refusal is reported without
stopping the release. A dry run reports the count, which is the re-measurement the plan asks for before
it writes.

**What proves it.** Unit tests over one document cover a numeric id and one stored as a double, a
correctly typed row left alone, a string `extraValue` rewritten, a disagreeing key refused, and a job in
the shape live holds today put through the real reshape and then this step. Live tests run it against
scratch collections in real Mongo: a second pass finds nothing, and a refusal in one collection leaves
the next one's rows normalised. Disabling the
type check, or the key check, fails the cases written for each.

**Still to do after it runs against live:** retire the read-side coercion — `extraCostScalarString`,
`extraCostScalarFloat64`, `stringFromDocumentValue`, both `UnmarshalBSON` methods — once live is clean,
and the `UnmarshalJSON` methods once no stale client can still send a number, per [plan.md](./plan.md)
§ Stage 2c.

## Stage 3 — Base, log, scratch and draft in the editor

*Slices 1 to 4 landed; the panels are slice 5.* The editor runs on the store — [plan.md](./plan.md)
§ Stage 3's slices says what each slice was, and §§ What slice 3 settled and What slice 4 settled the
decisions taken while building them.

**Where the job lives.** `editSession`, a slice of `usersStore`, holds the job as three layers: the
document as the server last stated it, what the reader has changed, and what they have asked about.
`jobDraftStore.js` is the pure module those layers are worked by, and `useEditJobSession` derives the
draft and wraps it in a `Job` for the panels to read. The reducer, its hook and its tests are gone.

**How a control changes the job.** It runs a command — `actions.run(setJobStatus(3))` — and the store
records which paths moved and what puts them back. Nothing writes into the job it was handed. The
commands live in `jobCommands.js`, one per thing a reader can do, and each is named for the step it
is in an undo list.

**What "unsaved changes" means.** The log being non-empty. A what-if written to `scratch` does not
count, and neither does an action that changes something other than this job — marking a job finished
within its group writes the group and leaves the job alone.

**The job the page reads cannot be changed.** The session freezes each document as it is seeded, and
the job built over it is frozen too, so both a row written to and a field set straight on the job throw
where it happens rather than appearing to work. A control says what the reader did —
`actions.run(command)` — and anything that genuinely needs a job it can change takes one through
`copyOfJob`: the save, which rewrites links and recalculates the tree, and the two leave paths,
which hand a job back to the planner.

**How an arriving document reaches an open editor.** The inbound coalescer hands every job it applies
to `jobArray` to the session as well. A job the session is not holding is ignored; one it is holding
has its base replaced, and the reader's own changes re-apply over the new document. So a member
watching a job somebody else is editing sees their work land, and a member who takes a vacated lock
starts from the document as it now stands rather than the copy they opened.

**What leaving does.** It drops the log and writes back the document the session holds underneath it,
so a change that arrived while the editor was open survives a close without saving. There is no
open-time backup copy any more.

**What an undo step is.** A command, not a field: taking back an imported purchase takes back every
path it touched. Typing into one field inside 800ms is one step. Undo drops the newest step and
re-derives, so a document that arrived underneath is left standing; a redone step is dropped as soon
as the reader changes anything else.

**What the live rules still say, and owe on promote.** `technical-documentation/frontend/technical-rules.md`
§ Changing the job being edited describes the reducer this stage deleted — it names
`updateActiveJobLayout` and `toggleActiveJobReadyForSale` as reducer actions and says the reducer
rebuilds the job. The replacement is above: a control runs a command and the store records what moved.
That section is live SoT, so it is not edited while this project is in flight; it is rewritten from
this overlay when the project promotes.

**What has not changed yet.** The panels still take the whole job as a prop and read it through the
lens, so an edit still re-renders the page under them — the narrow selectors are slice 5. The job is
still written whole on save; the field-scoped write is
[document-write-granularity](../document-write-granularity/plan.md) Stage C.

## Stage 4 — Getters become functions

**Landed.** A figure is read by calling a function of the job rather than by asking an instance for it:
`buildCost(job)`, `setupCount(job)`, `parentJobIDs(job)`. They live in
[jobSelectors.js](../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Hooks/jobSelectors.js), with
a `…Of` form beside each that takes only the rows the figure is read from, so a panel holding those
rows reads its figure without the job.

## Stage 5 — `jobArray` goes plain and the lens is deleted

**Landed, all four steps.** `jobArray` holds plain job documents, `Classes/job.js` and the lens are
deleted, and nothing in the SPA holds a `Job`.

What has landed is everything that had to happen before it could be. Three steps:

**The figures that were still getters became selectors.** Some already had a selector of the same name
and the getter was a duplicate; the rest were written, tested and then taken off. The class now answers
no figure at all. Two of them reached into the `JobMaterial` class rather than plain data, so
`boughtCost` and `purchaseComplete` were written as material selectors first, and the row's own getters
delegate to them.

**The eleven mutation methods became commands.** Commands of the same name already existed from Stage 3
but were reachable only through the editor's draft. `applyCommands(job, ...commands)` runs one against
a job outside the editor, which is what let 42 method calls across 14 files move onto the commands the
editor already used, and the methods go. They became 38 calls: a caller that ran two methods in a row
names both commands in one.

**What the tests were written against had to change with it.** Much of the suite proved the new path by
agreeing with the class member it replaced, so each of those assertions now states its own expectation
— see plan.md § The oracle the tests are written against, which called this and chose it deliberately.
Three call-site files had no tests at all; those were written first, against the old implementation, so
that they pass unchanged across the conversion rather than recording whatever it produced.

`Classes/job.js` went 1,405 lines to 929 to 533 to nothing. Its four remaining jobs are functions in
[`Functions/Job/jobDocument.js`](../../../frontend/src/Functions/Job/jobDocument.js):
`jobFromDocument(json, buildRequest)` reads a job from a stored document or from what the SDE gives a new
one, `applyRecipeToJob` fills a new job in from its recipe, `toDocument(job)` says what a job stores, and
`copyOfJob(job)` is a job something may change without disturbing the one it came from.

### What a document may share with the job it came from

`copyOfJob(job)` is what a job is copied through: a merge, a delete, a mass build and a planner move each
take one before changing it, and every one relies on the copy leaving the planner alone until its writes
have landed. It is `structuredClone(toDocument(job))`, so the copy shares nothing — which is a stronger
guarantee than the class gave. Under the class, four members were handed out live — `parentJobs`,
`rawData`, `skills` and `materialPriceOverrides` — and were safe only because every mutator replaced them
rather than changing them in place. `copiedChildJobs` still copies the child job lists inside
`toDocument`, because a document handed out for reading must not share them either.

### What the row classes are for now

The row classes stay, and a job never holds one. `jobSetup`, `jobMaterial`, `marketOrder`,
`linkedESIJob`, `transaction`, `extraCost`, `inventionEntry` and `brokerFee` are where a row's defaults
and its shape live, so a caller that stores a new row builds it through the class and stores what
`toDocument()` says — the rule Stage 3 set for commands, now the rule everywhere. A caller that needs a
row's behaviour wraps it, acts, and stores the row back: `applySetupChange`, `recalculateSetupMaterials`,
`applyLatestOrderData` and the watchlist dialogue all read this way.

A figure derived from a row is a selector taking the row and the requirement — `purchasedCost(material,
requirement)` — because the requirement belongs to the setups and a row cannot know it. Where a caller
holds the job that is `materialRequirementOf(job.build.setup, typeID)`; where it does not, the
requirement travels with the material, which is why `materialCostThroughChildJobs` takes it as its second
argument and `rules.buyCost` is `(material, requirement)`.
