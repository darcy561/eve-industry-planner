# Purchasing stage panels — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and — for the surfaces this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
and [`../../backend/technical-rules.md`](../../backend/technical-rules.md).
Phase 1 (project folder and docs) before any product work.
For the Go surface in scope only — the one field Stage F2 adds to `models.JobMaterial` — `go fix -diff`
before that stage, and again on the package edited.
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

The Edit Job Purchasing stage answers one question — **what is left to get, and what will it take** —
in its first line, prices every figure the way the rest of the app prices it, and keeps a record of
what the build was planned at rather than re-deriving a guess.

## Starting position

Every material gets the same 240px `ContentPanel`, and the stage tiles them four across. A card is
five things at once:

| Job | Where it lives now | What is wrong |
|-----|-------------------|---------------|
| Sourcing | `childJobsAvatar.jsx`, `Child Job Dialogue/` (3 files) | A count in a 30px circle is the whole child-job surface |
| Quantity | `materialQuantityInfoSingleRow.jsx`, `…DoubleRow.jsx` | Two components for one figure, at `SMALL_TEXT_FORMAT`, with the supply range in a tooltip |
| Ledger | `materialCostsFrame.jsx`, `totalMaterialCost.jsx` | Purchases are chips; the rule that gives the job its cost is a parenthesis and a hover |
| Status | `awaitingCostImportBox`, `materialExcessBox`, `materialCompleteBox` | Three components that each render or return `null`, stacked in a fixed order |
| Entry | `addMaterialCosts.jsx` | A live form per material, mounted for all of them at once |

**The card holds a readout and an input, and the input is why it cannot compress.** A finished
material still takes 240px because a card that might grow a form has to be sized for it — so the
longer a job's material list, the further the unfinished materials are pushed below the fold by the
finished ones. The design gets worse exactly as the job gets bigger.

Four further problems are not about layout:

**Prices on this stage skip two rungs.** `addMaterialCosts.jsx` calls `useEffectiveMarketHub` and then
`getMarketPriceForType` directly, which answers the job, account and global rungs and nothing else. The
material's own override and its market group default — the two rungs that make a price specific to an
item rather than to a job — are not applied. The same material, on the same job, in the same session,
can be quoted one price on Planning and another in the Purchasing form.
[`useMaterialsSourcing.js`](../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Materials%20And%20Sourcing/useMaterialsSourcing.js),
`shoppingList.js`, `useWatchlistPricing.js` and `OutputCard.jsx` all run the full ladder. Purchasing is
the last consumer that does not.

**Nothing records what the build was planned at.** `totalMaterialCost` is what was paid, and any
estimate beside it is re-derived at whatever order type is current — so a job bought last week is silently
compared against this morning's market. There is no figure the stage can show that means "against
plan".

**The stage's own summary counts the wrong unit.** "Total Complete Items: 9 / 16" counts materials, so
a job one Tritanium short of finished and a job with nothing bought read the same, and a long material
list and a short one are scored out of different totals. Nothing anywhere states the ISK still to
spend. The Shopping List and multibuy buttons are also hidden by `totalComplete < materialCount`, so
they vanish at the moment a player might want to correct a price they typed wrong.

**Recording a purchase is implemented twice.** `jobCommands.js` has a local `recordPurchase`, and
both SPA paths reach it — the row's entry form through `importPurchaseToMaterial` and the multibuy
paste through `importPurchasesToMaterials`. Only `passBuildCosts.js`, importing a child's cost, goes
through `Material.importPurchase` on the class. The two disagree:

| | `Material.importPurchase` | `recordPurchase` |
|---|---|---|
| Rejects a malformed row | `isValidPurchase` guard | no guard — the row is written |
| Default `availableToBuy` | `quantityRemaining` | `0` |
| Keys the row | `keyPurchasesByID` | `String(purchase.id)` inline |

Neither divergence is live today: both call sites pass `availableToBuy` explicitly, and an invalid row
would be stored but never counted, because `countedPurchases` filters by `isValidPurchase` before it
totals. So the visible effect of writing a bad row is a purchase that appears on the card and adds
nothing to the cost, with nothing saying why. The reachable case is the multibuy paste: a cost cell
that does not parse arrives as `NaN`, and nothing between the parse and the store refuses it. This project inherits the duplication rather than
introducing it, and Stage F2 cannot be built on top of it — which is what Stage F1 is for.

**The multibuy paste writes with nothing shown first.** It matches on exact name, applies every match,
and reports the result as a snackbar — so a line that matched nothing because of a misspelling is
indistinguishable from a paste that was simply redundant. It also caps a line at what is still required
and drops the rest, while the manual form passes `recordExcess` and keeps it: same units, two outcomes.

## Target shape

Three surfaces replace the grid, and the material list stops being a grid at all.

| Surface | Answers | Absorbs |
|---------|---------|---------|
| **Purchase Summary** | How far has this job got, and what has it cost against plan | The three-figure strip, the hide switch, both action buttons, the two market selects |
| **Materials** | What is left to get, and where is each one coming from | The card grid; the two quantity components; the three status boxes |
| **Job costs** | What this build costs besides its materials | The invention card; the setup strip; the Complete stage's Extras rows |

Everything a card held that is not a readout — the ledger, the entry form, the child-job lists — moves
into a **drawer** that opens under the row being worked. One form exists at a time, on the row it
belongs to.

**The drawer's two zones are not interchangeable.** *What was paid* is a form and a ledger; *where it
comes from* is a bordered block of its own. Recording a cost and changing what feeds a row are
different acts with different blast radii — an unlink discards the reason a material was covered and
cannot be undone from this screen — so the unlink is a small muted icon held away from the action
beside it and confirmed inline before it fires.

## Ordering

**The price ladder runs first**, and for a reason stronger than convention: Stage F2 writes a resolved
price into the job document permanently. Freezing a figure that came from the short ladder would make
the wrong number the record, in the one place that is meant to be evidence, and nothing afterwards
could tell a bad frozen price from a good one.

After that the row model is the spine — the worklist computes it once, and the drawer, the summary
totals and the frozen price all read the same resolved rows.

Stage F is two stages for the same reason. **F1 makes one place that records a purchase**; F2 writes
the plan price there. Done the other way round, the plan price lands on the paths that happen to go
through the class and is silently missing from the one that does not — and because the record is
written once and never overwritten, there is no later pass that could fill the gap.

## Stages

### Stage A — the price ladder on this stage

**SPA. Correctness fix, almost no visible UI.**

The worklist's row model runs `useEffectiveMarketHub` + `useMaterialGroupPricing` +
`getEffectiveMaterialPriceHub`, the same three calls `useMaterialsSourcing` makes, once per panel
rather than once per row component, and hands each row a resolved hub. The drawer's Price field
pre-fills from that row's resolution rather than the job's.

The panel header keeps writing rung 2 — it is the job's own choice and setting it still sets that.
What changes is what it claims: it is the job's default, not the answer, because two rungs above it can
say otherwise. Each row names the rung that answered, and where a row's own override disagrees with
the job default the drawer states both, since nobody remembers an override they set on Planning weeks
ago.

**Done when:** a material priced by an override or a group default on Planning is quoted the same
figure here; the resolution happens once per panel; a row states which rung answered; a test fixes the
agreement between the two stages so it cannot drift again.

### Stage B — the materials worklist

**SPA.**

One row per material, in the table shape Planning's Materials & Sourcing uses, so a player meets the
same list twice and it looks like the same list. Columns are needed, covered, still to get, paid,
average, source and status.

The three status boxes collapse into one chip plus the row's left accent stripe, four states with a
stripe as well as a chip so the list reads without colour alone: part bought, to buy, waiting on a
child job, covered. The "N extra" chip rides alongside a status rather than replacing it, because a
material can be both covered and over-bought.

`getMaterialStatus` currently runs inside the sort comparator, so the pass over `jobArray` happens
O(n log n) times per render. The rows are built once, then sorted.

**Done when:** the grid is gone from the standard layout; the sort order is unchanged; a covered
material costs one row; the row model is computed once and covered by a test that counts the child-job
walk.

### Stage C — the drawer

**SPA.**

The ledger in full, with what each row is charged for stated rather than hovered; one entry form,
pre-filled from the row it belongs to; and the child-job dialogue's two lists, in a zone of their own.
The dialogue's rule comes with it — its body renders when the row opens, not when the row renders with
a closed flag.

The entry form **stays when a material is covered**. Today it is removed, which leaves a player who
wants to buy ahead, or who mis-typed and needs a second row, nowhere to do it. It starts at zero
instead.

**Done when:** the child-job dialogue is retired; several rows can be open at once and survive
scrolling; the drawer body does not render while the row is closed; the destructive control is
separated and confirmed.

### Stage D — when a child's cost may be taken

**SPA, small behavioural addition.**

A child's cost-per-item is only meaningful once the child has finished acquiring what it is built from.
The readiness signal already exists: `jobStatus`, with `isReadyToBuild` as the softer line, and the
existing flow is a push from the child's own Complete stage where `passBuildCostsToParentJobs` fires.

A pull on the parent runs that same distribution for one child and is offered **only at that
readiness**. The gate is hard rather than a warning, because the purchase row is keyed by the child's
job id and a second import from that child is refused — so a provisional figure sticks, with no way to
replace it but deleting the row by hand.

While a child is not ready the row says which one, what stage it is in, and what is blocking it, with a
way to open it. That is information the parent already holds; nothing new is read. The supply range
stays the figure a parent relies on, because a child can be ready and still be feeding two parents.

**Done when:** a pull is offered only for a ready child; an unready child's blocker is named; tests
cover a ready child, an unready one, and a second import being refused.

### Stage E — Purchase Summary

**SPA.**

Leads with **what is still to get in ISK**, not a count of materials. A coverage bar weighted by value
shows where the job's cost has come from — paid, built by child jobs, awaiting a child's cost, still to
buy — so one Tritanium short reads differently from one Morphite short. The material count survives as
the caption on the hide switch, which is the one place it is the right unit.

Both action buttons stay at completion. A price typed wrong is corrected after the fact more often than
during, and a job's requirement moves whenever a setup is added.

**Done when:** the ISK figures replace the counts; the bar segments sum to the job's planned cost; the
actions are present in every state; the two market selects are the one order type control in the header.

### Stage F1 — one place that records a purchase

**SPA. Correctness and deduplication, no visible UI.**

`recordPurchase` folds into `Material.importPurchase` so every path — the entry form, the multibuy
paste and a child's cost — writes a purchase the same way. The class already has the fuller
implementation: the validity guard, the `quantityRemaining` default and the id keying. What the command
layer keeps is what it is for — naming the change for the undo stack and reporting what was taken.

**How the fold happens matters, because a command has no class instances.** A recipe is handed the job
as plain data and changes it under Immer, so `job.build.materials[materialID]` is a plain row with no
methods on it; calling `.importPurchase` on it would throw. The convention is already written at the
top of `jobCommands.js` — *a command that stores a new row builds it through the row's own class and
stores what that says* — and every other command follows it, building an `ExtraCost`, an
`InventionEntry` or a `Setup` and writing back `.toDocument()`. `recordPurchase` is the one that does
not, which is why it is a second statement of the row's shape: exactly what that comment exists to
prevent. So the command rebuilds a `Material` from the draft row, calls `importPurchase` on it, and
writes `toDocument()` back.

The guard changes behaviour where today nothing does: a malformed row is refused at the point of
writing rather than stored and silently skipped by `countedPurchases`. That is the intended outcome and
a test says so.

This is a prerequisite rather than a nicety. Stage F2 writes a figure into the job document on the
first purchase, and a second implementation that does not write it means the plan price lands on some
purchases and not others, permanently, with nothing to tell the two cases apart afterwards.

**One thing to check while doing it: undo granularity.** Undo steps merge when consecutive edits carry
the same command name and the same patch paths, and only when every patch is a `replace`. Recording a
purchase today writes a new key into `purchasing`, which is an `add`, so two purchases never merge.
Replacing the whole material row makes the patch a `replace` at `build/materials/<id>`, which means two
purchases on the same material inside the coalescing window could collapse into one undo step where
today they do not. The inverse patch still restores the exact prior row either way — Immer diffs the
before and after state rather than recording what the recipe did — so nothing is lost; what changes is
how much one undo takes back. A test should say which behaviour is intended rather than leaving it to
whichever the fold happens to produce.

**Done when:** `recordPurchase` is gone; all three paths reach `Material.importPurchase`; the
command builds through the class and stores `toDocument()` as its neighbours do; the guard and the
`availableToBuy` default behave as the class defines them; undo still restores the prior rows and a
test fixes how far one undo step reaches; tests cover a malformed row being refused, and the
multibuy paste writing the same rows it writes today.

### Stage F2 — the frozen plan price

**SPA + one job document field. Additive on both sides of the wire.**

A small record on the material — the resolved **unit price**, the hub and order type it came from, which
rung answered, and when — written the first time a purchase lands on that material and **only when the
field is absent**. First purchase wins; nothing later overwrites it.

- **Unit price, not a total.** The requirement moves whenever a setup changes, so a stored total goes
  stale the moment someone adds a run; a stored unit price stays meaningful against whatever the job
  now needs.
- **Not a snapshot at the stage change.** Moving Planning → Purchasing would write prices for materials
  the player may never buy, and a job whose setups change afterwards would carry a plan for a
  requirement that no longer exists.
- **Not written for a cost imported from a child job.** A built material's plan is the child's planned
  cost, which is a different comparison.
- **The rung is part of the record.** The same figure means a different thing from a group default than
  from a hand-typed override, and a record that cannot say which is not evidence of anything.

With Stage F1 landed there is one funnel, so the price is resolved once in `jobCommands` — where both
SPA paths already dispatch — rather than in the components. A caller that passes no price freezes
nothing, which is what keeps `passBuildCosts.js` working unchanged and is also how the child-cost path
is excluded.

**Done when:** the record is written at the first purchase and never overwritten; it is omitted from
the document when absent; `models.JobMaterial` carries the twin with `omitempty` on both tags; a
material with no record shows no plan comparison rather than a wrong one; tests cover
first-purchase-wins, the omit shape, both SPA paths through the Edit Job harness, and a Go round-trip.

### Stage G — the multibuy paste, reviewed

**SPA.**

The same matching, with its result put in front of the player before it lands: every pasted line, what
would happen to it, and a tick. Matched and filling what is left, matched with more than the job needs,
already covered, covered by a child job, and no material of this job with that name are five different
outcomes that today are two snackbar strings.

The two import paths disagree about overage — the clipboard caps at what is required and drops the
rest, the manual form keeps it as excess. They agree before the review ships, or the review has to
explain a difference that should not exist.

**Done when:** one dialogue on the shared shell, mounted only while open; every line's fate is shown
and each is individually included or excluded; the two paths treat overage the same; a paste that would
change nothing says so rather than returning a bare error.

### Stage H — what a player already holds

**SPA, opt-in, no new read.**

The app does not fetch assets as a matter of course and this stage does not make it start. The choice,
the character-or-corporation and the **one location** are the shopping list's, unchanged; Purchasing
reads the cached index for that scope and renders nothing when the choice is off, which is the default.

The scoping has to agree or the two surfaces will disagree about how much of a material is still
needed, which is the failure to avoid because a player reads both. An asset figure never costs itself
into a job, never changes what the row says is needed and never marks a material covered: it pre-fills
a quantity and leaves the price blank, because stock in a hangar was bought at a price only the player
knows.

**Done when:** no asset read is issued on this stage's behalf; the figure is absent with the choice off
and signed out; the location scope matches the shopping list's for the same job; the clipboard-pasted
asset path is treated as an equal citizen.

### Stage I — Job costs, and the setups

**SPA.**

`buildCost` is `totalMaterialCost + totalInstallCost + totalExtrasCost + totalInventionCost`, and
`costParts.js` draws it as six named parts. **Bought**, **built** and **paid** are the materials;
**install**, **invention** and **extras** are not. The panel is those three and nothing else, with the
colour dots read from `costParts.js` so a figure here and its band in Planning's proportion bar cannot
drift apart. Broker fees and sales tax are `totalCost` rather than `buildCost` and stay off this stage.

Invention and extras pair because they are the same shape — a list of lines somebody typed, with a
total. Installing takes the full width beneath them because it is derived rather than entered, and
because it is the one that grows.

**Extras are a Complete-stage panel today**, and a courier contract is paid while the materials are
being moved rather than weeks later. Surfacing the same rows and the same editor on both stages is the
proposal; the one outcome to avoid is two places each holding half of what a build cost. Whether Extras
moves or is mirrored is a decision about Complete, taken with it.

#### Several setups

A setup is one blueprint's worth of runs at one structure, and a job may carry several. **Cards up to
two, a table from three**: one or two setups are objects a reader looks at, three or more are rows a
reader compares, and a table puts ME, runs and install cost in aligned columns. Past about six rows it
scrolls vertically inside the panel.

**Rows group, and a group of one is an ordinary row.** The objection to grouping is real — a roll-up
that collapses only while every field matches changes format under the reader the moment one setup
differs — and the answer is to group *always*, so a single row and a group of thirty are the same
construct, one just carrying a `×N` and opening. Grouping then hides sameness and never difference: a
setup disagreeing on any grouped field cannot join its group and stays visible on its own. Group on
structure, system, ME/TE, run count and install cost, and give the table a **Runs** column and an
**Each** column — the first is what tells two setups at one structure apart, the second is where the
difference becomes legible.

This reverses an earlier position in this plan, and the reason is recorded rather than the position
quietly swapped: the first version rejected grouping outright on the format-instability argument
above, which is sound about a conditional roll-up and does not apply to an unconditional one. The
same rule is what makes a thirty-slot job readable on the Building stage →
[building-stage-panels/plan.md](../building-stage-panels/plan.md) § Stage B.

Today's `JobSetupInfoFrame` does the opposite — `overflowX: auto` above five setups, so the only case
where comparing them matters is the one where they are pushed off the side of the screen one at a time.

Install cost is a **per-setup** figure and the current setup card does not show it at all. It is on the
card and in the table, because two structures charge differently and a single job-level total hides the
thing a player would act on.

The distribution this rule is built against is in
[measurements/setup-counts.md](./measurements/setup-counts.md).

**Done when:** the panel carries install, invention and extras and states which; the colours come from
`costParts.js`; the setup list switches shape at three and scrolls past six; the header totals whether
the list is open or closed; the horizontal scroller is gone.

### Stage J — mobile

**SPA.**

Purchasing has a `Mobile Layout` file and a layout selector, and the file returns nothing — a phone
gets the standard layout, with the card grid dropping to one across and the whole list becoming a 600px
scroll region nested inside the page. A scroll region inside a scrolling page swallows the flick
gesture, which is why the list is hard to move through on a phone.

The seam is where the mobile pieces mount: the worklist becomes the card variant of the row, the
drawer becomes a bottom sheet with the entry form first, and **the list scrolls with the page**.

**Done when:** the nested scroll region is gone; the row model is shared with the standard layout; the
drawer opens as a sheet; the summary panel keeps its bar and headline at phone width.

## Not in the sequence

**Passing excess to a sibling job.** Buying in round lots is normal, so over-buying is normal, and the
job keeps the extra on the row as a correct figure with nowhere to go — while a sibling job on the same
planner may need exactly that material. Offering it there **writes to a job the player is not editing**,
which nothing on this stage does today, and it raises questions the layout work does not answer: does
the receiving job take the units at the price paid, does the giving job keep the ledger line they came
from, and what happens when the receiving job is later resized.

It is described in the design reference and deliberately left out of the stage order. The excess chip
and its figure are correct without it.

## Handed from the reprocessing rebuild: ore as a source

**Not a stage here, and nothing in the sequence waits on it.** Buying a job's minerals as ore is
designed in [reprocessing-rebuild](../reprocessing-rebuild/plan.md) § Not in the sequence and drawn on
this project's worklist, not on today's cards. It needs that project's engine and solver (its Stages
C–E) and this project's Stages B, C, F1 and I, so it is built after both. What follows is what the
stages here must leave open so it slots in without reworking them.

**The ore is never a row in the materials list.** The minerals ore can produce stay ordinary rows,
sorted by name with everything else, carrying their usual status chip; only their **source** changes,
to *Ore · above*. The ore has a panel of its own **between Purchase Summary and Materials**:

| State | What it shows |
|-------|---------------|
| Collapsed — the default | One line: how many minerals it covers, the planned ore and tax, what is recorded so far, the ore count and where it is reprocessed, and **Show the ore ▾**. "Buy the minerals instead" sits in its ⋮ menu. The stage otherwise reads as plain Purchasing |
| Opened | Each ore with an editable quantity and price, the reprocessing tax, a chart of which ore supplies each mineral with each mineral's cost, and **Record on N minerals**, with **Hide ▴** in the header |
| Recorded | Collapsed again, with a *Recorded* chip on the summary line |

It is opened by the reader, never by the stage: a job that plans ore does not have the plan offered to
it every time Purchasing is visited.

What each stage here must allow:

- **Stage B — the worklist.** The row model's source admits a kind beyond a hub and a child job, so a
  mineral can point at the ore panel. The status chips are unchanged: a mineral planned as ore is *to
  buy* until its ore is recorded.
- **Stage C — the drawer.** A mineral row's drawer still opens and still records a purchase by hand; the
  ore panel is a second way to record, not a replacement for the row's own form.
- **Stage E — Purchase Summary.** Recorded ore lands as purchases, so it counts as *paid* in the
  coverage bar with no new segment.
- **Stage F1 — one place that records a purchase.** Recording the ore writes one purchase on each
  mineral it covers, at the cost the panel shows, **through `Material.importPurchase`** like every other
  path. The funnel F1 builds is what keeps this from becoming a fourth implementation.
- **Stage F2 — the frozen plan price.** Unchanged. A mineral's plan price is still its resolved market
  price at the first purchase, so a mineral bought as ore is compared against what buying the mineral
  would have cost — which is the saving the ore was chosen for.
- **Stage I — Job costs.** Hauling the ore is an **estimated** extra in the Hauling Service category:
  worked out from the plan, never stored, shown in the Extras zone with an *estimate* mark until the
  reader records what they paid. Recording writes an ordinary extra, and a category's recorded total
  then replaces its estimate. Whether Extras moves here or is mirrored, the estimate follows the rows.

The ore panel never holds Prismaticite, whose batches each give one random mineral and so cannot be
planned against a need. An Unrefined mineral can appear, planned at the amount it is guaranteed to give;
the opened panel's quantities are the reader's to correct once the ore is reprocessed and the real
amount is known.

The mineral costs on the opened panel start from the plan and are the reader's to change: each mineral
takes the ore and tax shared by its market value, and editing one moves the rest so the total stays
whole. That allocation is the reprocessing engine's (`valueOrePlan`), not this stage's.

## Inherited: the duplicated structure display

**The structure display this stage redraws is duplicated with the Planning setup card.**
`JobSetupInfoFrame`'s `UseCustomStructure` and `UseDefaultStructures` are copied into
`jobSetupCard.jsx` — the store read, the system-index calculation, the four table lookups, the rig
label and the deleted-structure notice are identical, and only the layout wrapper differs. The
derivation wants one owner; extracting it before this stage rewrites the frame would be discarded by
the rewrite, so it is handed here rather than done there. What both copies display is live in
[frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md).

Both copies already read one predicate for whether a setup uses a saved structure, and both show what
a job was built with plus a warning when that structure has been deleted — that part is landed and this
stage inherits the behaviour, not the decision.

## Wire compatibility

| Change | Shape |
|--------|-------|
| Stage F2 — the plan price record on a material | **Additive.** `omitempty` on both tags; an older client ignores it, an older document reads as unset |
| Every other stage | **Client only.** `material.purchasing`, `build.childJobs`, `build.inventionEntries`, `build.extrasCosts` and `build.localPricing` keep their meaning |

**No migration.** A material bought before Stage F2 ships has no plan price and shows no comparison,
which is true rather than a gap to backfill — nothing could reconstruct it anyway, because the price it
would need is the one that has moved.

## Design reference

The visual design these stages build to — every surface in both themes, the drawer's two zones, the
three candidate formats for several setups, the mobile layouts, a full-page view of the whole stage for
one real job, and the reasoning behind each — is the design proposal published for this work:
<https://claude.ai/artifact/2Qe97ViwBFTbAyZp3JqqHm>

It is a **design reference, not SoT**: where it and this plan disagree, the plan wins, and both are
superseded by live docs on promote. Sections worth reading before building the stage they cover:

| Section | Covers |
|---------|--------|
| §3, §4 | Purchase Summary and the worklist, each in light and dark |
| §3b | The frozen plan price, and what it costs to build |
| §4b | The five-rung ladder and the two rungs this stage skips |
| §5, §5b | The drawer's two zones; when a child's cost may be taken |
| §6–§8 | The reviewed paste, opt-in assets, and the excess that is not scheduled |
| §9 | What Job costs includes, and several setups drawn three ways |
| §9b | The whole stage at page width, for a real 20-run Ishtar |
| §10 | Mobile |

The companion proposal for the Planning stage, whose table shape and order type picker this one reuses, is
linked from [planning-stage-panels/plan.md](../planning-stage-panels/plan.md) § Design reference.

The ore panel and the hauling estimate in § Handed from the reprocessing rebuild are drawn on this
worklist in the reprocessing canvas, <https://claude.ai/artifact/5HovmoD6arBetuQ18GFuiE>, under
"Reprocessing elsewhere in the app": the panel collapsed, opened, and after recording, each in both
themes.

## Stage status

| Stage | Surface | Status |
|-------|---------|--------|
| Phase 1 — project folder and docs | docs | **Done** |
| A — the price ladder on this stage | SPA | Not started |
| B — the materials worklist | SPA | Not started |
| C — the drawer | SPA | Not started |
| D — when a child's cost may be taken | SPA, behavioural | Not started |
| E — Purchase Summary | SPA | Not started |
| F1 — one place that records a purchase | SPA | Not started |
| F2 — the frozen plan price | SPA + job document field | Not started |
| G — the multibuy paste, reviewed | SPA | Not started |
| H — what a player already holds | SPA | Not started |
| I — Job costs, and the setups | SPA | Not started |
| J — mobile | SPA | Not started |

## Start here

Phase 1 is complete and no product work has begun. **Stage A is the first thing to build**, and it is
the one stage that is worth landing even if the rest is deferred: it is a correctness fix on a live
surface, it is small, and Stage F2 cannot be trusted without it.

Two things this project depends on and does not own: the pricing ladder from
[market-pricing-defaults](../market-pricing-defaults/contents.md), which is built and firing, and the
Materials & Sourcing table shape and order type picker from
[planning-stage-panels](../planning-stage-panels/contents.md), which are done and awaiting promotion.
If either promotes before this project starts, read the promoted live docs rather than those project
folders.

One later consumer builds on this stage: buying minerals as ore, from
[reprocessing-rebuild](../reprocessing-rebuild/plan.md). It is not in this project's sequence, but
Stages B, C, E, F1, F2 and I each have a line in § Handed from the reprocessing rebuild saying what
they must leave open for it — read it before starting any of them.
