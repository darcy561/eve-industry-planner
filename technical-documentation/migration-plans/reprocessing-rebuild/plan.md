# Reprocessing rebuild — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer to,
and — for the surfaces this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
and [`../../backend/technical-rules.md`](../../backend/technical-rules.md).
Phase 1 (project folder and docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

The Reprocessing page answers its two questions plainly — **what are my items worth reprocessed**, and
**what is the cheapest way to end up with these minerals** — from an engine that gives the right answer
and that any other screen can call.

## Starting position

### The page

[`Components/Reprocessing`](../../../frontend/src/Components/Reprocessing) is on the old UI: a
`ContentPanel` holding an options bar, a right-hand column of inputs, and one of two result views.

| Job | Where it lives now | What is wrong |
|-----|-------------------|---------------|
| Direction | `optionsPanel.jsx` | A toggle that clears the paste every time it is pressed |
| Basic / Advanced | `basicMineralOutput.jsx`, `advancedMineralOutput.jsx` (789 lines) | Two renderings of one result; From minerals is forced into Advanced |
| Per-mineral detail | `Components/MineralCard.jsx` | A 280px card per mineral per ore; figures as `a \| b` pairs explained only in a tooltip |
| Ore selection settings | `reprocessingSettingsPanel.jsx` | Under the results, so it is only reachable after a run |
| Never choose | the same panel, and a `⋮` menu per ore row | Excluding an ore is two clicks behind a menu; the list is page state and is not saved |
| Empty page | `placeholderPanel.jsx` | A welcome screen in place of the panels |
| Recalculation | `Hooks/useAutoRecalculation.js` | A `useEffect` re-running the calculation when inputs change |

Figures the page does not show at all: lines it could not read (dropped silently by
`parseReprocessingInput`), units under one batch (an item below `batchSize` vanishes from both views),
reprocessing tax, selling fees, hauling volume, and the cost of buying the minerals outright. The tax is
not missing from the data: a reprocessing custom structure already stores `tax`, live and in the new
shape ([frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md)), and the
page neither shows nor reads it.

### The engine

The yield formula in
[`reprocessingFormulas.js`](../../../frontend/src/Functions/Reprocessing/engine/reprocessingFormulas.js) and the
bonuses in [`reprocessingBonuses.js`](../../../frontend/src/Functions/Reprocessing/engine/reprocessingBonuses.js)
match the game and are tested. Everything around them is page-shaped:

1. **Text in.** `reprocessIntoMinerals` and `reprocessFromMinerals` in
   [`reprocessingRuns.js`](../../../frontend/src/Functions/Reprocessing/reprocessingRuns.js) parse the
   paste themselves. A caller holding type ids has to write text to use them.
2. **Prices fetched inside.** Both call `fetchPrices` and `readMarketPriceForType` for one market and
   order type, which skips the pricing ladder every other priced surface resolves through.
3. **Inputs mutated.** [`ReprocessingItem`](../../../frontend/src/Classes/reprocessingItem.js) sets its
   own quantity and outputs; `oreSelector` decrements `remaining` on the caller's requirement objects
   and overwrites ore quantities.
4. **Store reads and console output.** `oreSelector` falls back to `useUsersStore.getState()` and calls
   `console.table` on every pass of its loop.
5. **Two output units.** Ore outputs are per batch; gas outputs are totals. `gatherMaterialTotals`,
   `advancedMineralOutput` (twice) and `MineralCard` each branch on gas.
6. **Value figures in components.** Totals, excess value, net cost and cost-as-this-ore are computed in
   the two output views, partly twice.
7. **Ore selection is greedy and scores units, not value.** It counts one Tritanium the same as one
   Megacyte, sizes each pick to cover a whole mineral, never revisits a pick, and is steered by three
   sliders, two of which only matter as a ratio. Against the cheapest answer it overspends by 20% to
   over 300% — [measurements/ore-selection-benchmark.md](./measurements/ore-selection-benchmark.md).

### Settings

`ReprocessingSettings` (`services/shared/models/accountDocuments.go`) is stored on the account and also
copied onto the planner settings document (`services/shared/models/planner/settings.go`), seeded once
by `EnsurePlannerSettings`. The page reads only the account copy. `planner.SettingsUpdate` carries
`ExtrasCategories` and `MarketLocations` only, so the planner copy cannot be written.

## Target shape

### The page

The full design, both directions and both themes, is on the canvas in § Design reference. Two columns
on desktop — inputs and setup on the left, answers on the right — stacking on a phone.

| Panel | Direction | Answers |
|-------|-----------|---------|
| **Reprocessing** | both | Which direction: two `SelectableCard`s, To minerals / From minerals |
| **Items to reprocess** / **Minerals you need** | each | The paste, what was read, what was not, and (opt-in) assets at a location |
| **Ore selection** | From | Shipping, buying outright, compressed ore, leftovers, never-choose |
| **Reprocessing setup** | both | Structure, rigs, implant, tax, character, skills, the yield they produce; pin a second setup to compare |
| **Reprocessing these items** / **Buying ore for these minerals** | each | The headline figures, the price and seller controls, one context line |
| **Comparing setups** | both, while pinned | Both setups side by side, and each item under both |
| **What you get** | To | The outputs, a share-of-value bar, fees and tax |
| **Item by item** | To | Each item's batches, kept-back units, yield and difference, a diverging chart, a drawer per row |
| **Where these sell** | To | The same items valued at several markets |
| **Ore to buy** | From | The chosen ore with volume, shipping and what each gives; never-choose on the row |
| **Mineral balance** | From | Need, hold, gives, left over, and where each mineral comes from |

The page states figures and relationships between them and grades nothing, as the Edit Job stages do.

### The engine

Pure functions under [`Functions/Reprocessing`](../../../frontend/src/Functions/Reprocessing): data in,
data out, no store, no network, no page state.

| Function | Takes | Returns |
|----------|-------|---------|
| `reprocessingSetupFrom(structure, skills)` | a structure document (its `tax` included), a skills map | the one setup object every function below takes |
| `reprocess(items, setup)` | `[{typeID, quantity}]` | per item: batches, kept back, yield, outputs as totals; combined outputs; what could not be reprocessed |
| `oreToBuy(needs, setup, options, priceOf)` | minerals needed, selection options, a price function | the plan: per candidate the units, batches, what it gives and what it was chosen for; leftovers |
| `valueReprocessing(result, priceOf, rates)` | a `reprocess` result, a price function, fee and tax rates | every figure the To minerals panels show |
| `valueOrePlan(plan, priceOf, rates, shipping)` | an `oreToBuy` plan | every figure the From minerals panels show |
| `typesToPrice(...)` | items or needs | the type ids a caller must price |

**Prices come in as `priceOf(typeID)`.** The page builds it from its market and order type; an Edit Job
panel would build it from the ladder. The engine never knows which.

**The page derives during render.** `useMemo(() => reprocess(items, setup))`, prices subscribed through
`useMarketPricesQuery` — the contract every priced surface already follows. `useAutoRecalculation` goes.

## Decisions taken

Taken by James during design; tasks build to them rather than reopening them.

| Decision | Where it lands |
|----------|----------------|
| Shipping applies to **From minerals only** | Stage E, Stage G |
| Shipping is **per m³ or a fixed amount**, chosen by the reader | Stage E |
| **No collateral** — it is not paid by whoever pays for the hauling | Stage E |
| Shipping is stored **on the planner** | Stage F |
| Compressed ore stays as **an extra level of control**: Prefer / Allow / Don't use | Stage E, Stage F |
| **Prefer** swings the *choice* towards compressed ore and never changes a reported cost; it has no strength setting | Stage E2 |
| Reprocessing tax comes from the structure's **existing `tax` field** — no structure shape change | Stage D2 |
| **Save as default and Revert** go: the settings are the planner's | Stage G2 |
| Output material volumes are **one lookup map** in the static file | Stage B1 |
| The page is **public**: every part works for a reader who is not signed in, and what needs a session says so rather than disappearing | Stage G8, and each stage it touches |
| Signed out, **every skill starts at level V** | Stage G8 |
| Module and scrap reprocessing is **in**, as Stage M, built to whichever delivery shape [static-data-delivery](../static-data-delivery/plan.md) Stage E settles on | Stage M |
| Reprocessing tax, selling fees, hauling volume, assets (to and from), setup comparison, market comparison, trimming, copy leftovers, per-mode paste kept — **in** | Stages C–K |
| Filling From minerals **from a job** — **out**: jobs are not always loaded in the SPA | § Not in the sequence |
| **Erratic ore (Prismaticite) is its own reprocessing style**: a batch collapses into one mineral picked at random, in a quantity from a range. The page works out and shows the expected yield, a likely range, and the bounds. Unrefined minerals are the same style with one possible mineral | Stages A4, B1b, C2b, D1, E2, G3 |

## Wire compatibility

| Surface | Change | Kind |
|---------|--------|------|
| `REPROCESSING_DATA` static file | The file becomes `{ items, materialVolumes }`: the item map moves under `items`, each entry gains `volume`, and output materials' volumes are one map beside it | **Breaking for its one reader pair**, which moved together in B1 and B3 — the worker's type-id collector and `Functions/Static/reprocessing.js`. The same contained shape as static-data-delivery Stage A's item-list change: every cached copy misses once, and the release's static data rebuild publishes the new file |
| `REPROCESSING_DATA` static file | Entries with random outputs carry `randomizedMaterials` with each mineral's `quantityMin` and `quantityMax`, and two new item kinds; eight Unrefined minerals join the file and Hiemal Tricarboxyl Vapor may leave it (A4) | Additive for the new field. An older SPA build reads Prismaticite as yielding nothing, which is what it reads today |
| `ReprocessingSettings` on the account document | `valueMultiplier`, `wastePenaltyMultiplier`, `compressionBonusMultiplier` and `preferCompressed` replaced by `compressedOre`; calculation and shipping fields move to the planner | **Migrate-required** — hard cutover with a `prepareRelease` step |
| `ReprocessingSettings` on the planner settings document | Gains shipping; becomes the copy the page reads and writes | **Migrate-required** — same step, merging from the account |
| `planner.SettingsUpdate` (`PUT` planner settings) | Gains `reprocessingSettings` | Additive request field |
| `defaultReprocessingCharacter` | Stays on the account | Unchanged |
| Module outputs (Stage M) | A new static output, or a new public lookup endpoint, per delivery Stage E | Additive |

Ships in **the shared-planners release** — the one window every open project rides — as a hard
cutover with the release script converting the data. F3's step goes beside the planner extras
categories backfill, and Stage B needs no step of its own because the static data rebuild already in
`prepareRelease` publishes it; both placements are in [shared-planners](../shared-planners/plan.md)
§ Every open project ships in this window. No schema version moves: the constants arrive with that same
release.

**Stage M decides whether it is in the window.** Its build waits on static-data-delivery Stage E's
decision; if that is not taken in time, M is deferred explicitly and the rest of the project ships
without it, rather than holding the window open.

## Ordering

**Facts, then data, then the engine, then the screen.** The engine is shared once it is rewritten, so
the rounding and gas questions are settled first (Stage A) rather than baked into every caller. Volume
lands in the static file (Stage B) before anything computes shipping. The engine (C, D, E) lands with
the old page still on top of it — the page is rebuilt last (G onward) against an engine that is already
right. Settings move (F) after the solver, because the solver decides which fields survive.

Stages H to K are independent of each other once G has landed and may run in any order or in parallel.
Stage M's measurement and in-game checks can run at any time; its build waits on
[static-data-delivery](../static-data-delivery/plan.md) Stage E, and its page work on G.

## Stages

Every task below names the files to read first, what to build, what not to do, and what proves it.
Tests ship with the task; a task is not done until its tests pass and `npm run lint` and
`npm run format:check` are clean for the files it touched.

**Rules that bite on every task** — the owning files win where they differ:

- **One comment, two lines.** The only comment is a doc comment above a declaration, two lines at most,
  saying what it does. JSDoc annotations are not prose and stay. No comments in tests. Bring every
  touched file down to this. → [`../../technical-rules.md`](../../technical-rules.md)
- **Current behaviour only** in code, comments, commit messages and UI copy — no "previously" or "used
  to". History stays in this folder.
- **App-shell components, not their sx.** `AppShellPanel`, `SectionPanel`, `SelectableCard`,
  `ActionCard`, `EntityRow`, `InsetSurface`, `Figure`, `FigureRow`, `PanelHeadline`, `StatTile`,
  `Disclosure`, `ScrollingTable`, `ColumnHeaderRow`, `StatusChip`, `ItemMarketActions`, `ContentDialogue`.
  Reference → [`../../frontend/components/contents.md`](../../frontend/components/contents.md).
- **Flexbox, not MUI Grid**, for new layout; convert Grid in files being edited.
- **React 19 idioms**: derive during render, `use()`, `ref` as a prop. → [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
- **Store updaters return a partial**, never `...state`. Enforced by `store-partials/no-whole-state-spread`.
- **Tests sit beside the module**; shared fixtures and harnesses go in
  [`frontend/src/tests/`](../../../frontend/src/tests/) — look there before writing a helper.
- **Name things in EVE's vocabulary** — batch, yield, ore, mineral, kept back — never after the data
  structure.
- **Nothing reads job documents** from the Reprocessing page.
- **Assets are opt-in and scoped to one location**, never fetched automatically.
- **Do not commit.** Leave changes in the working tree; James decides what becomes a commit.
- **After each task**, update [overlay.md](./overlay.md) and § Stage status, then run the work-review
  agent scoped to the rule being changed as well as the files edited.

---

### Stage A — Settle the formula's open questions

**Needs a player.** An agent prepares the checks and records results; James runs them in game.

#### A1 — Rounding

`ReprocessingItem.reprocessMaterials` rounds each batch's output (`Math.round(base × yield)`) and
multiplies by batches. If the game rounds the total, figures drift — Scordite ×642 batches at 90.63%
gives 87,312 Tritanium one way and 87,276 the other.

- **Prepare:** two in-game cases with known skills and structure, chosen so the methods disagree by
  more than one unit. Write them into a new `measurements/formula-checks.md` with each method's
  prediction.
- **Record:** what the game produced, and which method matches.
- **Done when:** the file names the rule, and Stage C1 builds to it.

**Settled against live, not in game.** Live's figures are known to be correct, so live is the
reference: each batch is rounded for ore, moon ore and ice and multiplied by the batches, and gas is
rounded once on the run. `reprocessedQuantity` is that rule, and `liveParity.corpus.test.js` § what a
run gives holds it to live's own code — copied from `Public` — for ten real items of every kind,
batch sizes of 1 and 100, every structure shape live can hold, three skill sets and quantities from 0 to
3,999,999: 145,800 cases, no difference. Rounding the total instead was measured against the same
corpus and differs from live in 82,150 of them, by up to half a unit per batch. No in-game check is owed
for rounding.

#### A2 — Gas decompression

`gasDecompressionFormula` is `80 + structure gas bonus + skill level`. The parity corpus covers ore only.

- **Prepare:** one compressed gas case at a Tatara or Athanor, one at an NPC station.
- **Done when:** the formula is confirmed or corrected in the same file, with the case recorded.

#### A3 — Tax

Structure owners set a reprocessing tax; NPC stations charge a rate that falls with standings. The game
charges tax on the **estimated value** of the outputs, not their market price.

- **Prepare:** one NPC station case at a known standing, one structure case at a known rate.
- **Record:** the rate formula at NPC stations, and which price the charge is computed from.
- **Done when:** Stage D2 can compute tax without guessing.

#### A4 — Erratic ore and unrefined minerals

The SDE gives Prismaticite and Compressed Prismaticite eight outputs as `randomizedMaterials`, each a
`quantityMin` and `quantityMax` per batch of 100. CCP's
[Catalyst expansion notes](https://www.eveonline.com/news/view/catalyst-expansion-notes) state the
mechanism: *"each reprocessing batch will randomly become 1 of the 8 possible mineral types and provide
a variable quantity of that mineral"*, and *"Unrefined Minerals can be reprocessed into their respective
Minerals with variable output quantity."* The eight Unrefined minerals carry one output each.

**Neither source gives the odds, the shape of the variable quantity, the skills or the rigs** — the
notes are silent on all four, and the skills come only from the SDE (Erratic Ore Processing and
Unrefined Minerals Processing, 2% a level each, by attribute 790). What is left to measure decides
every figure Stages C2b and D1 show:

- **Per batch, confirmed** by the notes. Reprocessing 10 batches at once still records which mineral
  each came out as, for the odds below.
- **How likely is each mineral?** Equal odds are the working assumption, and nothing published confirms
  it. Record the mineral each batch gave across at least 100 batches; a count that clearly departs from
  1 in 8 needs weights in the static file, which the SDE does not carry.
- **Is the quantity uniform across its range,** and is the yield percentage applied to the rolled
  quantity (Erratic Ore Processing and Unrefined Minerals Processing each give 2% a level)?
- **Which structure rigs and bonuses apply** to each kind — ore's, or none. Until this lands, the SPA
  treats erratic ore exactly as ore — the ore formula with its own skill, the structure's ore bonus and
  ore rigs — which is what the worked example and the design assume; an unrefined mineral keeps what
  live gave its kind, the ore formula and ore rigs with no structure bonus. Whatever this records
  replaces both in `reprocessingFormulas.js`, `structureBonusFor` and the rig tables.
- **Hiemal Tricarboxyl Vapor**: a Harvestable Cloud that CCP files under the Veldspar market group, with
  materials but no reprocessing skill. Can it be reprocessed at all?
- **Done when:** `measurements/formula-checks.md` records each answer, and the odds the engine uses are
  either confirmed equal or recorded as weights.

---

### Stage B — The reprocessing static file

**Go, worker.** Additive. Volumes, what the file holds read from the SDE, and random outputs.

**Read first:**
[`services/worker/tasks/sde/update/conversion/output_reprocessing_data.go`](../../../services/worker/tasks/sde/update/conversion/output_reprocessing_data.go),
the `ReprocessingItem` struct in
[`conversion/types.go`](../../../services/worker/tasks/sde/update/conversion/types.go) (the SDE type
already carries `Volume`), [`frontend/static-data/reprocessing.md`](../../frontend/static-data/reprocessing.md),
[`frontend/src/Functions/Static/reprocessing.js`](../../../frontend/src/Functions/Static/reprocessing.js).

#### B1 — Write volume into the file

- Add `volume` to each reprocessing entry, from the SDE type's `Volume`.
- Output materials (minerals, ice products, gas) are not entries, so the file needs their volumes too:
  one `materialVolumes` map keyed by type id, so each type's volume is stated once rather than in every
  ore that yields it.
- **The file becomes `{ items, materialVolumes }`.** The item map was the whole file, keyed by type id,
  so a volume map beside the entries would have been read as an item by every reader that walks the
  values. Weighed against a key mixed in among the items and a separate file; a file that says what it
  holds won, with its one reader pair moved in the same change (B3, and `addReprocessingTypeIDs` in the
  recipe diff stage).
- `omitzero` on the field, matching how the conversion types already tag `Volume`.
- **Tests:** beside the conversion package — an ore carries its volume; a mineral's volume is in the
  map; an entry for a type with no volume omits the field.
- **Run** `go fix -diff ./worker/tasks/sde/update/conversion/` after editing.
- **Done when:** a rebuilt file carries volumes for every entry and every output material.

#### B1a — What the file holds is read from the SDE

Three hand-typed maps in `output_reprocessing_data.go` decide what goes in the file and how it is
labelled, and the SDE already says all three. Measured against SDE build 3326071 they have drifted:
Tyranite, Prismaticite and Compressed Prismaticite are given Scrapmetal Processing, where the SDE says
Simple and Erratic Ore Processing.

| Map | Replaced by |
|-----|-------------|
| `marketGroupsToSkills` (39 market groups) | The type's `reprocessingSkillType` dogma attribute (790). Gas has none, being decompressed rather than reprocessed, so compressed gas keeps one named constant: Gas Decompression Efficiency |
| `parentMarketGroupsToInclude` | A published type with a market group and materials, which either carries attribute 790 or sits in the Gas Clouds Materials branch |
| `marketGroupsToItemTypes` | The type's **whole** market group ancestry, walked to one of four top-level groups (Standard Ores, Moon Ores, Ice Ores, Gas Clouds Materials). Today's code looks one level up, which is why a deeper group fell through. Erratic ore and unrefined minerals are kinds of their own (B1b) |

The derived file matches today's for 453 of its 457 entries. It corrects the three skills above, adds
the eight Unrefined minerals, and drops Hiemal Tricarboxyl Vapor, subject to A4.

- **No new dataset.** The conversion already reads `typeDogma` for the industry bonuses, and compressed
  gas is found by its market branch, so `compressibleTypes` is not needed.
- **Tests:** beside the conversion package, against fixture types: an ore's skill from attribute 790; a
  compressed gas given the decompression skill; a moon ore three groups deep labelled moon ore; an
  unpublished type and a type with no market group left out; Prismaticite labelled erratic.

#### B1b — Random outputs are written, not dropped

`createReprocessingItem` reads `quantity` from every list it finds, and a `randomizedMaterials` entry
has `quantityMin` and `quantityMax` instead, so **Prismaticite is written with every output at 0** and
the page reads it as yielding nothing.

- An entry with random outputs carries `randomizedMaterials`, named as the SDE names it, each mineral
  with its `quantityMin` and `quantityMax`, and no `materials`.
- `ItemTypesForReprocessing` gains `unrefinedMineral` (5) and `erratic` (6). Kind 5 was already in the
  SPA as `unrefinedOre`, wired into the ore rig families and ore yield but never written by the server;
  it is renamed to the game's word and now means the Unrefined minerals. A parity test keeps the two
  copies of the numbering in step. The kind is read from the outputs: several possible minerals is
  erratic, one is an unrefined mineral, so neither needs an id typed by hand.
- An item with random outputs carries `"materials": {}`, so the current page, which reads only fixed
  materials, sees an item that yields nothing — what Prismaticite already showed — until C2b reads the
  ranges. Ore selection leaves both kinds out.
- **Tests:** Prismaticite carries eight ranges and no fixed materials; Unrefined Morphite carries one
  range; an ore with fixed materials is unchanged.

#### B2 — Get it rebuilt on release

Derived data is rebuilt, not patched. `prepareRelease` already has a "rebuild the current SDE version"
step ([`services/core/commands/prepare_release.go`](../../../services/core/commands/prepare_release.go));
confirm it runs every release and regenerates `REPROCESSING_DATA`. If it does, nothing is added. If it
does not, the release gains the trigger — not a migration that edits the file.

This matters more once [static-data-build](../static-data-build/plan.md) Stage B lands: its relevance
gate skips a build when none of the SDE datasets the conversion reads has changed, and adding volume
changes the conversion, not the SDE. The forced rebuild on release is what publishes it. If
[static-data-delivery](../static-data-delivery/plan.md) Stage B has landed by then, the content hash
republishes only the reprocessing file, and clients re-download only that.

**Confirmed — nothing is added.** The step is in every release, unconditionally. It publishes
`rebuildCurrentSDEVersion` to the worker task stream, and the worker's `RebuildCurrentSDEVersion`
runs the whole pipeline — download, map build, conversion, blueprint sync, persist — on the build the
store says is current, then republishes it under a new version label so every client re-downloads it.
It builds its own "needs update" answer rather than asking the version check, so a relevance gate in
the check cannot skip it. The trigger waits in JetStream (24-hour retention) while the window has the
worker stopped, and runs when the worker comes back.

**One thing the operator must watch in this window.** The step is not `required`: if NATS is
unreachable, `prepareRelease` connects without it and the step reports its own failure while the
release carries on. For an ordinary release that costs nothing until the next build. For this one it
leaves the new SPA reading the old flat file as empty, so a failed step is answered with
`tasks forceSdeRebuild` — recorded in [shared-planners](../shared-planners/plan.md) § Every open
project ships in this window.

#### B3 — Read it in the SPA

- `Functions/Static/reprocessing.js` reads the `{ items, materialVolumes }` shape and exposes
  `volumeOf(typeID)` from the same file: an item's own volume, else the material map. No second home for
  volume. Landed with B1, since the shape changed under the reader.
- **Tests:** beside it, against `frontend/src/tests/cachedDataMock.js`.

---

### Where the reprocessing code lives

`Functions/Reprocessing/` is the subject folder, laid out as `Functions/MarketData/` is: `engine/` holds
what an item gives — the setup, the yield formulas and bonuses, `reprocess` and the value of random
outputs, with the live-parity corpus beside them; `valuation/` holds what it is worth, including the
selling fees; `selection/` holds which ore to buy; the folder itself holds the paste parsers, the reprocessing skill list and the current
page's calculation runs, which E3 and G retire. Three things stay with their own families on purpose:
the static file's owner in `Functions/Static/reprocessing.js` with every other static owner, the kind
numbering and rig tables in `Context/defaultValues.jsx` with the app's other constants (the Go parity
test reads it there), and page hooks under `Components/Reprocessing/Hooks/`. Shared test fixtures are
`frontend/src/tests/reprocessingFixtures.js` and, for ore selection, `oreSelectionFixtures.js`. New modules go where their kind already sits.

### Stage C — The engine core

**SPA.** No behaviour change on the page; the old page is moved onto the new functions in C4.

**Read first:** every file in [`Functions/Reprocessing`](../../../frontend/src/Functions/Reprocessing)
and [`Classes/reprocessingItem.js`](../../../frontend/src/Classes/reprocessingItem.js);
[`../../frontend/reprocessing/contents.md`](../../frontend/reprocessing/contents.md) and its topics;
[`../../testing/frontend/reprocessing.md`](../../testing/frontend/reprocessing.md).

#### C1 — One setup shape

- `reprocessingSetupFrom(structure, skills)` resolves, once, everything a yield needs: rig value and
  rig security per item type, structure bonus per item type, implant value, the skills map, the tax rate.
  The bonus functions in `reprocessingBonuses.js` stay its inputs. The tax is the structure's own `tax`
  field (D2), so it is not a separate argument.
- A setup carries what its calculations need, so it can be passed on its own.
- `yieldFor(setup, item)` returns the percentage, from `reprocessFromItemType` with Stage A's rulings.
- **Tests:** the parity corpus (`liveParity.corpus.test.js`) must pass unchanged through the new setup.

**Landed.** `Functions/Reprocessing/engine/reprocessingSetup.js` holds `reprocessingSetupFrom`, `yieldFor`,
and the two skill ids every yield reads (Reprocessing, Reprocessing Efficiency), which
`getAllReprocessingSkills` now imports rather than restating. `ReprocessingItem.reprocessMaterials`
takes a setup, and both calculations in `reprocessingRuns.js` build one per run instead of resolving
the structure per item. The parity corpus runs through the setup, its implant read from an implant
id, and fails when the setup's implant read is broken.

#### C2 — `reprocess(items, setup)`

- **In:** `[{typeID, quantity}]`. **Out:** a new object; nothing passed in is changed.
- Per item: `batches`, `keptBack` (units under a batch), `yield`, `outputs` as **totals** for every item
  type, gas included, using Stage A1's rounding rule. Combined outputs across items. Items not in the
  static file returned as `notReprocessable`.
- `ReprocessingItem` either becomes an immutable class with getters for its derived values, as
  [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md) § Class members describes, or
  is retired for plain results. **Recommendation:** retire it — nothing outside the engine holds one,
  and a result object is what other screens will pass around. Move every caller in the same change; no
  forwarding wrapper.
- **Tests:** the worked example in [measurements/worked-example.md](./measurements/worked-example.md)
  as golden figures; gas and ore through one path; an item under one batch is all kept back; a pasted
  type that is not reprocessable is returned, not dropped; the input array is deep-equal before and after.

**Landed.** `Functions/Reprocessing/engine/reprocess.js` holds `reprocess(items, setup)` and
`reprocessedQuantity(base, batches, yieldPercent, itemType)`, the one rounding rule every figure goes
through: each batch rounded for ore, moon ore and ice, the whole run rounded for gas — live's rule,
held to live's code by the parity corpus (A1). The worked example's output column predates that and
assumed a floor of the total, so the tests hold its batches and units kept back exactly and its
outputs to live's rule.

**`ReprocessingItem` is not retired here.** Its callers are the current page's components, which Stage G
replaces (C4 was taken logic only). Until then it computes through the same
`reprocessedQuantity`, and a test holds the class and `reprocess` to the same yield and outputs, so the
rule exists once.

#### C2a — What ore can produce is read from the data

A material can come from ore when some selectable item (ore, moon ore, ice) lists it in its outputs.
`producibleByReprocessing(typeID)` answers that from the static file, as a view beside
`selectableItems()`. It replaces the four hand-typed id sets in `reprocessingInput.js`
(`mineralIDS`, `moonMineralIDS`, `iceProductIDs`, `unrefinedMineralIDS`), which have already drifted:
they name 36 types, one of which (90289) nothing produces, and they miss three types the file's ore does
produce (48927, 76374, 88087). Minerals, moon materials and ice products all fall out of the one rule.

- **Tests:** every output of every selectable item is producible; a component, a PI material and
  Construction Blocks are not; no hand-written id list remains.

**Landed.** `producibleByReprocessing(typeID)` and `producibleTypeIDs()` in
`Functions/Static/reprocessing.js` are a view over the fixed outputs of ore, moon ore and ice — the
kinds ore selection admits, so gas and the random outputs of erratic ore and unrefined minerals are not
counted. `parseInputMineralString` reads a pasted list against them (it primed both files itself until G1 moved that to the route); the
four id sets are gone. Against SDE build 3326071 after Stage B the rule gives 37 materials: the old sets
named Unrefined Isogen, which is an input rather than anything ore gives, and missed Neo-Jadarite and
Eleutrium. (Chromodynamic Tricarboxyls, missed by the sets as well, came only from Hiemal Tricarboxyl
Vapor, which Stage B removed.)

#### C2b — Random outputs

An item with `randomizedMaterials` gives one mineral per batch, at A4's odds, in a quantity from that
mineral's range, at the item's yield. `reprocess` returns it as a **range result**, not as totals, and
every caller handles both kinds:

- **Per mineral:** the expected units, and the range — 0 to every batch giving it at its maximum. For
  an unrefined mineral there is one mineral, so its range is batches × minimum to batches × maximum.
- **For the item's value**, given prices (D1): the expected value, a **likely range** (10th to 90th
  percentile), the share of outcomes that beat selling as-is, and the **bounds** (every batch giving the least valuable outcome at its minimum, and
  the most valuable at its maximum). The bounds are shown, muted, because they are what is possible, but
  the likely range is what a reader plans with.
- **How the likely range is worked out.** Each batch is independent, so the expected value and spread
  of one batch are exact, and the total's are batches times each. From 30 batches the total is close to
  normal and the percentiles come from that; checked against 100,000 simulated runs of the worked
  example's 40 batches, the two agree within 0.2%. Below 30 batches a seeded simulation is used, so the
  figure is right for a few batches and the same on every render. An exact calculation was weighed and
  not taken: it is far more code for a difference no reader would see.
- Combined outputs across items add the expected units; a combined total that includes a range result
  is itself a range.
- **Tests:** the worked example's Prismaticite figures; one batch's likely range from the simulation is
  stable across calls; an unrefined mineral's range is its minimum and maximum times batches; mixing
  Prismaticite with Veldspar gives a ranged total.

**Landed.** `reprocess` gives an item with random outputs its expected units per mineral as its
`outputs`, an `outputRanges` entry per mineral (each batch rounded by live's rule at the least and most
amounts), and the `randomizedMaterials` it drew from; the combined result adds the expected units and
carries `outputRanges` for every output a random item touched, fixed contributions counted at both ends.
The value side is `randomOutputValue(item, priceOf)` in `Functions/Reprocessing/engine/randomOutputValue.js`:
expected value, likely range, bounds and `shareAbove(value)`, normal from 30 batches and a 20,000-run
seeded simulation below. It treats each batch's amount as continuous; rounding moves a run by under a
unit a batch. Erratic ore reprocesses as ore until A4 says otherwise, so it has a yield to range over.

#### C3 — Parsing returns what it could not read

- `parseReprocessingInput` and `parseInputMineralString` return `{ items, unread }`, where `unread` is
  each line that matched nothing or had no quantity, as pasted.
- Parsing stays the page's front door; the engine never sees text.
- **Tests:** beside `reprocessingInput.js` — a module line, a misspelt ore, a line with no number, tab
  and space separators, thousands separators.

**Landed.** Both parsers return `{ items, unread }` — the ore parser's `items` an array of
`ReprocessingItem`, the material parser's an object keyed by type id, empty input giving
`{ items: {}, unread: [] }` where it used to give an array — and `reprocessingRuns.js` hands `unread`
on in both directions' results, ready for G2 to list. The line splitting the two parsers each carried
is one function. A quantity with no digits still reads as zero, as before; a line with no quantity at
all is unread. Until G2 separates them, a line naming a real item no ore gives — Construction Blocks in
From minerals, a module in To minerals before Stage M — is in `unread` with the misspellings.

#### C4 — Move the page's logic onto the core

**Logic only, by James's decision.** The current page is old-UI markup that Stage G deletes and rebuilds,
and the live-parity corpus already holds the engine to live, so C4 consolidates logic and leaves the
markup alone — the rule for screens not yet on the app-shell.

- `reprocessingRuns.js` takes To minerals' totals from `reprocess`; `gatherMaterialTotals` goes.
- Remove `console.table` from `oreSelector`, and its `useUsersStore` fallback — settings are passed in.
- **Not here:** `ReprocessingItem` and the gas branches in `advancedMineralOutput.jsx` and
  `MineralCard.jsx` retire in Stage G with the page that reads them (§ G1). Meanwhile the class computes
  through `yieldFor` and `reprocessedQuantity`, so no rule exists twice.
- **Done when:** the page behaves as before, its totals come from the engine, and the selector logs
  nothing and reads no store.

**Landed.** As above; a first `oreSelector.test.js` covers a planned batch count, an excluded ore, and
that choosing logs nothing.

---

### Stage D — Valuation

**SPA.**

**Read first:** `basicMineralOutput.jsx` and `advancedMineralOutput.jsx` (the figures being moved);
[`Hooks/React Query/Character/useSellingRates.js`](../../../frontend/src/Hooks/React%20Query/Character/useSellingRates.js)
and [`Functions/MarketOrders/sellingRates.js`](../../../frontend/src/Functions/MarketOrders/sellingRates.js);
[`../../frontend/pricing/contents.md`](../../frontend/pricing/contents.md).

#### D1 — `valueReprocessing` and `valueOrePlan`

- Every figure the canvas shows for each direction, worked out from a result, `priceOf` and rates —
  nothing computed in a component.
- To minerals: as-is value, reprocessed value with kept-back units sold as they are, difference and
  percentage per item and in total, share of value by output, cost of each output as a given ore (the
  current `calculateReprocessingCosts`, moved), hauling volume as-is and reprocessed.
- From minerals: ore cost, shipping, delivered, buying the minerals outright delivered, leftovers at
  market and after fees, net of leftovers.
- A range result (C2b) is valued as expected, likely range and bounds, all the way to the totals: the
  difference against selling as-is is a range when either side is.
- **Tests:** the worked example's figures to the unit.

**Landed.** `Functions/Reprocessing/valuation/valuation.js` holds both. `valueReprocessing(result, priceOf, rates)`
gives, per item and in total, the outputs' market value, selling fees, tax, kept-back units sold as they
are, reprocessed against sold as they are with the difference and its percentage, the difference with
no tax, the value shared by output, each output's cost as the ore it came from, and hauling volume both
ways. `valueOrePlan(result, needs, priceOf, options)` takes the planned ore reprocessed — the shape E2's
plan will hand it — and gives each ore's cost, volume and shipping, ore delivered, the minerals bought
outright delivered, the leftovers at market and after fees, and net of leftovers. Both hold the
worked example to the unit; its "difference with no tax" was summed from rounded figures and is
corrected to 76,852.

- **Tax is the stand-in until D2**: the structure's rate on the outputs' market value, passed as
  `taxPercent`.
- **A price of 0 is no price.** A market with no orders reads 0, so both functions count it as 0 and
  name it in `unpriced` rather than presenting the figure as whole; a type with no volume is named in
  `withoutVolume` the same way.
- **Cost as the ore uses the units reprocessed**, not the whole paste — the kept-back units are valued
  separately as ore.
- **Ranged items** are valued through `randomOutputValue`, carried through fees and tax, and the totals
  carry a range: exact for one ranged item, the normal approximation over the summed spreads for several
  (`combinedValueRange`).

#### D2 — Reprocessing tax

- `reprocessingSetupFrom` reads the structure's existing `tax` — a percentage, already settled by
  `coerceTaxPercentage` in [`customStructure.js`](../../../frontend/src/Functions/Custom%20Structures/customStructure.js).
  No structure shape change, and no second home for the rate.
- The setup panel edits it with the shared `TaxPercentageTextField`, through `updateStructure`, like
  every other structure field the panel edits — on the page's copy, not the saved structure.
- Charged per Stage A3 on the value the game uses. At an NPC station, worked out from standings if
  Stage A3 gives a formula and the character's standings are available; the structure's `tax` if not.
- **Tests:** a saved structure's tax reaches the figures; editing it on the page leaves the saved row
  alone.

#### D3 — Selling fees for a seller

- Fees and sales tax are quoted for a **seller character**, chosen separately from the reprocessing
  character, through `useSellingRates` — the hook the Selling stage uses.
- Signed out there is no character: the rates are typed, defaulting to trained-skill values (G8).
- **Tests:** a seller with different skills from the reprocessing character changes the fees and not the
  yield; with no account, typed rates are used and nothing requests a character.

**Landed.** `useReprocessingSellingFees(marketID, sellerHash, typedRates)` in
`Components/Reprocessing/Hooks/` quotes the seller through `useSellingRates` at the sale location
`resolveSaleLocation` makes of the page's market. The hook takes the seller from its caller; G1 hands
it the account's default market character through `resolveSellerCharacter`, as the Selling stage reads
it, and the reader's own choice when they change it. With no seller
there is no character query at all: the rates are the reader's typed figures, or by default every
market skill at its highest with no standings — `signedOutSellingFees` in
`Functions/Reprocessing/valuation/sellingFees.js`, worked out through `sellingWhatIf` rather than a formula of
its own. That default is the worked example's 4.875% at a station. While a seller's rates load, the
hook says so and stands in with that default — including while the seller's skills and standings are
still arriving, when `useSellingRates` holds its query back — so the page shows its loading state rather
than a figure with no fees. Two copies were folded on the way: the sales tax formula is `salesTaxRateAt` in
`sellingRates.js`, which `sellingWhatIf` now reads, and the highest skill level is `maxSkillLevel`,
which the Planning skills panel's level marks now read too.

---

### Stage E — Ore selection as a solver

**SPA.** Replaces `oreSelector.js`.

**Read first:** [`oreSelector.js`](../../../frontend/src/Functions/Reprocessing/oreSelector.js);
[measurements/ore-selection-benchmark.md](./measurements/ore-selection-benchmark.md), which holds the
model and the three test lists.

#### E1 — Choose and add the solver

The problem is a small linear programme: minimise delivered cost over candidates, subject to each needed
mineral being covered.

| Option | For | Against |
|--------|-----|---------|
| **`yalps`** | Pure JS, ~240 kB unpacked, integer support, maintained (0.6.x, Dec 2025) | One new dependency |
| `highs` | Best-in-class solver | WASM, ~4 MB; far more than the problem needs |
| `javascript-lp-solver` | Familiar | Heavier than `yalps` for the same job |
| A hand-written simplex | No dependency | Numerical code that is easy to get subtly wrong |

**Recommendation:** `yalps`. Check its current release and changelog before adding it, per the
dependency rule.

**Landed.** `yalps` 0.6.4 (December 2025, MIT, ~240 kB, one dependency — `heap` 0.2.7) added to the
frontend, chosen by James after the check: native ESM with types, not deprecated, no advisories against
it or `heap`. `javascript-lp-solver` is now 1.0.3 but ten times the size; `highs` is ~4 MB of WASM.

#### E2 — `oreToBuy(needs, setup, options, priceOf)`

- **Needs may be any list of materials.** `oreToBuy` solves for the needs ore can produce (C2a) and
  returns the rest untouched as `notProducible`, so a caller holding a whole job's or shopping list's
  materials passes them all and gets back an ore plan plus what is still bought as it is. A need the
  solver covers outright, because no ore beats it delivered, is reported as outright, not as ore.
- **Candidates:** every selectable ore (`selectableItems()`), each yielding at the setup's yield;
  compressed ore per `options.compressedOre`; each needed mineral bought outright, one-for-one, when
  `options.buyOutright` is on.
- **Removed:** everything on `options.neverChoose`; compressed ore when `compressedOre` is Don't use;
  any candidate with no price; **erratic ore, always** — no batch of it is guaranteed to give any
  particular mineral, so it cannot be planned against a need.
- **Unrefined minerals are planned at their minimum.** Each gives one known mineral, so it is a
  candidate yielding its `quantityMin` at the setup's yield, which is what it is guaranteed to deliver;
  the expected extra above that is reported with the leftovers, not counted on.
- **Cost per unit:** price, plus `rate × volume` when shipping is per m³. A **fixed** shipping amount is
  added to the delivered total after solving and does not affect the choice.
- **Prefer** compressed is a switch that swings the choice towards compressed ore. It biases the
  objective only: compressed candidates are made to look cheaper to the solver, so compressed ore wins
  wherever it is close, and every reported figure still uses the real price. The bias is a constant in
  the solver, not a setting. Pick it so compressed ore beats its uncompressed equivalent whenever both
  are priced, and record the value and why in the overlay.
- **Leftovers are reporting only.** Crediting leftover minerals inside the objective at market value
  makes any ore priced below its mineral value free money, and the solver buys without limit. They are
  valued after the plan is chosen, at buy-order price after fees.
- **Whole batches:** round each candidate up to whole batches, then trim — reduce any candidate whose
  batches are no longer needed because others cover its mineral, repeating until nothing reduces.
- **Chosen for:** the mineral whose covering constraint the candidate is tight on — of the needs it
  gives, the one the whole plan covers with the least to spare against the need.
- **Tests:** the three lists in the benchmark, with and without shipping, each within 2% of the bound
  recorded there and below today's selector; never-choose and Don't use respected; outright chosen when
  ore is dearer delivered; fixed shipping changes nothing about the choice; no input mutated.

**Landed.** `oreToBuy` is in `Functions/Reprocessing/selection/oreToBuy.js`. It solves the fractional
programme with `yalps`, rounds each choice up to whole batches and trims, and returns the ores (with
batches, units and the need each was chosen for), what is bought outright, what no ore gives
(`notProducible`), any need nothing can cover (`uncovered`), the plan's delivered cost and the
fractional optimum at real prices (`bound`, a true lower bound when compressed ore is not preferred).
The plan goes to `valueOrePlan` through `reprocess` for its figures and leftovers.

- **The benchmark's original figures do not reproduce** — its per-ore price ratios were not recorded —
  so `frontend/src/tests/oreSelectionFixtures.js` carries real SDE ores with recorded ratios, and the
  tests hold each plan to its own fractional optimum; the comparison with the old selector is recorded in
  the benchmark rather than kept as a test, since E3 deleted it.
  Every plan lands within 0.5% of the optimum; the figures are in
  [measurements/ore-selection-benchmark.md](./measurements/ore-selection-benchmark.md) § Reproduced.
- **"0 is no price" is one rule**, `isPriced` in `Functions/MarketData/prices/isPriced.js`, a module with
  no imports so anything can read it without pulling in the price cache. `oreToBuy`, `valuation` and
  Planning's `returns.js` (its "no orders" flags) all read it; it was three inline checks.
- **Compressed ore is told apart by its name** ("Compressed" in it), as the old selector did. The file
  carries no compressed flag, and giving it one would mean the conversion reading `compressibleTypes`,
  which B1a avoided.
- **Prefer compressed** makes compressed ore look 5% cheaper to the solver (`PREFER_COMPRESSED_BIAS`):
  compressed ore trades at about a 2% premium in the benchmark, so 5% swings every close choice and is
  still small enough not to buy a clearly dearer ore. Reported figures use real prices.

#### E3 — Remove what the solver replaces

`valueMultiplier`, `wastePenaltyMultiplier` and `compressionBonusMultiplier` have no meaning to a
solver. Their controls go with Stage G; their stored fields go with Stage F. `oreSelector.js` is deleted
once `reprocessingRuns.js` calls `oreToBuy`.

**Landed.** `reprocessFromMinerals` calls `oreToBuy` and hands the page each chosen ore as a
`ReprocessingItem` holding its planned units, its price, and its run's outputs from `reprocess` divided
by its batches — the shape the current page draws until Stage G replaces it, since the page multiplies
back by the batch count. `oreSelector.js` and its test are deleted.

- **The three sliders went now, not in G.** Once the solver chose the ore they changed nothing, and a
  control that does nothing is dead UI. Their stored fields stay for F3 to drop. The panel keeps Prefer
  compressed (read as `prefer` or `allow`) and Sell excess; its helper text no longer claims compressed
  ore yields more.
- **The page plans with what Stage F has not yet given it:** no shipping, no buying outright and the
  page's own exempt list as never-choose. Needs nothing can cover and what ore cannot give are not shown
  until G4 draws them.
- **Prices are asked for every ore the solver may choose**, `choosableOre()` in `oreToBuy.js` — the pool
  `oreCandidates` reads — so unrefined minerals are priced beside ore rather than from a second list.
- **Outputs are read from the whole run, not from one batch scaled up.** An unrefined mineral's
  expected output is rounded once over the run, so one batch times the batch count misses it — 15,309
  against 15,214 Morphite in the test that holds this.
- **Parsed minerals lose `remaining`**, a counter only the old selector decremented.

---

### Stage F — Settings on the planner

**Go and SPA. Migrate-required.**

**Read first:** [shared-planners](../shared-planners/plan.md) § Settings split between the planner and
the account and § Every other planner setting is in the same insert-only trap;
[`services/shared/models/planner/settings.go`](../../../services/shared/models/planner/settings.go);
[`services/shared/mongo/planner_put.go`](../../../services/shared/mongo/planner_put.go);
[`services/api/v1endpoints/planners/putSettings.go`](../../../services/api/v1endpoints/planners/putSettings.go);
[`services/core/commands/release_planner_settings.go`](../../../services/core/commands/release_planner_settings.go)
(the backfill pattern); [`services/core/commands/prepare_release.go`](../../../services/core/commands/prepare_release.go);
[`frontend/src/Zustand/plannerSettings/core.js`](../../../frontend/src/Zustand/plannerSettings/core.js);
[`frontend/src/Zustand/applicationSettings/core.js`](../../../frontend/src/Zustand/applicationSettings/core.js)
and `preferences.js`.

#### F1 — The new shape

| Field | Lives on | Notes |
|-------|----------|-------|
| `defaultReprocessingCharacter` | Account | A character is resolved per reader on a shared planner |
| `compressedOre` | Planner | `prefer` / `allow` / `avoid`; replaces `preferCompressed` and `compressionBonusMultiplier` |
| `countLeftoversAsSold` | Planner | Replaces `sellExcessMineralTypes`, now reporting only |
| `buyOutright` | Planner | New |
| `shipping` | Planner | `{ mode: "perVolume" \| "fixed", amount }`; zero means no shipping |
| `neverChoose` | Planner | The never-choose list, saved rather than page state |

Fields whose zero means "not set" are omitted when zero. Empty collections are written empty, never null.

#### F2 — Write path

- `SettingsUpdate` gains `ReprocessingSettings`, validated (amount non-negative, mode one of two).
  Additive request field.
- The SPA's planner settings slice reads and writes it; the page reads the active planner's copy. A
  reader with no session has no planner, and reads and writes the browser copy described in G8.
- **Tests:** Go beside the model and endpoint; SPA beside the slice.

**F1 and F2 landed together.** They could not land apart: the account's settings are saved whole, so
the moment the account model lost the old fields the page had nowhere to keep them until the planner
could be written.

- **Go.** `planner.ReprocessingSettings` (`services/shared/models/planner/reprocessing.go`) holds
  `compressedOre`, `countLeftoversAsSold`, `buyOutright`, `shipping` and `neverChoose`, with its
  defaults (`prefer`, per m³ at zero, an empty list) and `Validate`. The switches and the amount are
  omitted when zero; `neverChoose` is always a list. `SettingsUpdate` carries it as
  `reprocessingSettings`. The account's `models.ReprocessingSettings` keeps
  `defaultReprocessingCharacter` alone, and a planner seeded from an account starts on the planner
  defaults. A parity test holds the choice and mode names to the SPA's `compressedOreChoices` and
  `shippingModes`.
- **Wire.** The planner settings PUT gains a field — additive. The planner settings GET and the
  account settings document change shape — migrate-required, converted by F3; the session surface
  fixture is regenerated.
- **SPA.** `defaultPlannerReprocessingSettings()` in `defaultValues.jsx`; the planner slice reads stored
  settings onto it (an unknown choice or mode reads as the default) and writes them with
  `writePlannerReprocessingSettings`. `usePlannerSetting(field, fallback)` is the one hook for reading
  an active planner's setting; `usePlannerExtrasCategories` and `usePlannerReprocessingSettings` are
  built on it.
- **The current page** seeds its settings and exempt ores from the active planner's copy, and reseeds
  once if the copy arrives after it opened. Save as default and Revert write the planner copy and are
  shown only once it is held. Prefer compressed became a three-way Compressed ore select, and Sell
  excess became Count leftovers as sold. Shipping and buying outright have no control until G2, and
  the page does not pass them to `oreToBuy` until G4 can show what they change. Signed out, the page
  runs on the defaults until G8.
- **Ore ids on the page are numbers**, as the planner stores them; the reducer turned the strings the
  output view adds into numbers so a saved list and an added id compare alike.
- **Tests:** Go beside the model (validation, defaults, seeding, and parity with the SPA's names and
  starting values) and the endpoint (refusals, and a live round-trip of exactly what Save sends, run
  with `scripts/testing/live-mongo.sh`); SPA beside the slice, the account settings, the page's state
  hook, the panel and the settings page's character picker.
- **Promotion owes two live docs:** `frontend/reprocessing/settings.md` § Calculation knobs and
  `testing/frontend/reprocessing.md` still describe the multipliers and the account's settings; the
  overlay's § Reprocessing settings is what replaces them.
- **Fixed in passing:** the settings page's default reprocessing character read the wrong path and
  always showed the main character; `updateExemptTypeIDs`, unused and adding its argument to the
  document as a stray field, is deleted; the solver and valuation read the choice and mode names from
  `defaultValues` rather than as literals.

#### F3 — The release step

- One `prepareRelease` step, written **against the shape live data is in** — compare with the `Public`
  branch, not this branch.
- Account documents: convert `preferCompressed` (true → `prefer`, false → `allow`), drop the three
  multipliers, keep `defaultReprocessingCharacter`.
- Planner documents: merge from the owning account what the planner is missing, leave what it holds —
  the `backfillPlannerExtrasCategories` shape. This would be its second copy, and both ship in the same
  window, so **write one step that merges every planner setting the account still holds** and retire
  the extras-only step into it, rather than adding a copy beside it.
- Dry-run support, a revert path, and a live-parity test, as the existing release steps have.
- **Run** `go fix -diff` on `./core/commands/`, `./shared/models/`, `./shared/models/planner/`,
  `./shared/mongo/`, `./api/v1endpoints/planners/` after editing. At planning time it reported one
  suggestion in `shared/models/job_test.go` (a struct literal fold) — review it by eye before applying,
  per the struct-literal note in the root technical rules.
- **Done when:** a rehearsal against a copy of live converts every account and planner, the SPA reads
  only the planner copy, and the revert restores both.

**Landed**, as the extras step widened rather than a second copy: `backfillPlannerSettings`
(`services/core/commands/release_planner_settings.go`) replaces `backfillPlannerExtrasCategories` in the
same place in the window, after `backfillAccountPlanners`.

- **Extras categories** merge by id as before.
- **Reprocessing settings** come from the account's retired fields — `preferCompressed` true or absent →
  `prefer`, false → `allow`; `sellExcessMineralTypes` → `countLeftoversAsSold` — read from the release's
  copy of `application_settings` (in a dry run, which copies nothing, from the collection itself; a real
  run with no copy refuses). The copy is the one source no earlier step can have rewritten.
- **A planner's own choice stands.** The planner is written only while its reprocessing settings are
  missing, in the retired shape, or still the seeded defaults, so a re-run in the window never undoes a
  member's change away from the defaults. A member who sets them back to exactly the defaults reads the
  same as the seed, so a re-run while the copy is held would give that planner its account's choice
  again — accepted, since only the window's re-runs can reach it.
- **The five retired fields are then unset** from every account still holding them.
- **Revert** is the release's existing one: both settings collections are in the copied set.
- **Tests:** unit tests for the conversion and the own-choice rule; live tests for the move, a re-run
  after a member's edit, the copy lookup and its refusal, and a dry run that writes nothing — run with
  `scripts/testing/live-mongo.sh`. What it will meet on live is in
  [measurements/reprocessing-settings-on-live.md](./measurements/reprocessing-settings-on-live.md):
  4,822 accounts cleared, 2 planners taking a reprocessing write.
- **Still owed to the window:** the full release rehearsal against a copy of live — the release's own,
  run once with every project's steps in — is where "converts every account and planner and the revert
  restores both" is checked end to end.
- **Comments in `prepare_release.go`** came down to the rule with this edit; the reason each step runs
  where it does is now the table in shared-planners' overlay § The release steps, and why each runs
  where it does.

---

### Stage G — The page on the app-shell

**SPA.** Builds to the canvas. Old components are deleted as their replacements land, and
`ReprocessingItem` goes with the last of them — the new panels read `reprocess` results, and no
forwarding wrapper is left (C4 left the class for this stage).

**Read first:** the canvas (§ Design reference) — every board; [`../../frontend/components/contents.md`](../../frontend/components/contents.md)
and each topic it lists; [`Components/Reprocessing`](../../../frontend/src/Components/Reprocessing) as
it stands; the Watchlist and Purchasing implementations for how app-shell panels compose.

#### G1 — Frame, direction and state

- Page frame: two flex columns, side `flex: 1 1 360px; max-width: 400px`, main `flex: 999 1 640px`,
  wrapping on narrow screens. No horizontal page scroll at 390px.
- Direction as two `SelectableCard`s. **Each direction keeps its own paste** across switches.
- The reducer holds only what the reader chose: pastes, direction, setup, pinned setup, prices, seller,
  expanded rows. Results are derived during render from the engine; `useAutoRecalculation` is deleted.
- **Tests:** an end-to-end test through the real reducer, in the area's existing structure — paste,
  switch direction, switch back, the paste survives; change the rig, the figures change with no button.

**Landed.**

- **The route loads what the page reads.** `routes/reprocessing.jsx` primes the reprocessing file and
  the item list in a loader, so the page waits on the router's pending screen and every read after is
  synchronous. Parsing a mineral paste no longer primes anything itself.
- **The reducer holds choices only:** the direction, each direction's paste as typed and as last
  reprocessed (`pastes[direction].text` / `.committed`), the view, the structure, character and skills,
  prices and the From minerals settings; the setup is derived from them. Results, the loading flag and "modified" are gone from it; "modified" is the typed
  paste differing from the committed one. The unused `setAllSkills`, `setSkillsManuallyModified` and
  `clearOreIDsToBeIgnored` went with it.
- **Results are worked out while rendering** by `useReprocessingAnswers`: the setup from the structure
  and skills, the committed paste's answer from `toMineralsAnswer` or `fromMineralsAnswer` (both now
  synchronous in `reprocessingRuns.js`), and the prices it reads asked for through
  `useMarketPricesQuery`. The From minerals plan is recomputed when prices land. A change to the setup,
  market or settings moves the figures with no button; only a changed paste waits for Reprocess.
  `useAutoRecalculation` and `calculateReprocessing` are deleted.
- **The frame** is the two flex columns, the direction two `SelectableCard`s in a radio group
  (`directionPanel.jsx`), and the paste a `SectionPanel` titled for its direction. The settings, output
  and structure panels are the old ones, given the page state with the answers beside it, until G2–G4
  replace them; the old direction toggle is gone from the options panel.
- **The loader primes the industry bonuses too.** Published rigs are read from that file, and the
  setup is derived once per structure or skills change, so a saved structure's rigs would give nothing
  if the file arrived after the page drew.
- **The From minerals plan waits for its prices** rather than solving against none first. A paste whose
  prices cannot be read shows the empty state for now; saying so is G4's answer panel.
- **Errors reach Sentry through the page's own `ContentErrorBoundary`**, since a calculation now fails
  while rendering rather than inside a caught call. The Reprocess event counts the items or minerals
  read, and a paste that read none records nothing.
- **Tests:** `reprocessingPage.e2e.test.jsx` renders the page over the real reducer and engine with only
  the files, prices and store faked, its files loaded by the route's own loader — the paste survives a
  switch there and back, fitting an ore rig raises the minerals with no button pressed, a changed paste
  waits for Reprocess, and From minerals plans its ore once the prices are in. The rig picker's virtualised list is replaced by a
  plain one in that test, since jsdom lays nothing out to virtualise.

#### G2 — Inputs

- **Items to reprocess** / **Minerals you need**: the paste, a chip for what was read, the unread lines
  listed (C3), Reprocess / Find ore. In From minerals a pasted shopping list is usually mixed: lines that
  name a real item no ore yields — a component, Construction Blocks — are listed apart from unread lines,
  as "No ore yields this; buy it as it is", and are not part of the plan. The current "Calculate changes" warning state goes: results follow
  the inputs.
- **Reprocessing setup**: the structure controls of `reprocessingStructurePanel.jsx` recomposed with
  `FormField`s, the tax field (D2), skills in a `Disclosure`, and a yield readout per item type. In From
  minerals the panel opens on a summary with the controls in a `Disclosure`.
- **The skill list has one source.** `getAllReprocessingSkills` hard-codes 16 skill ids beside the
  static file, which already carries each item's `reprocessingSkill`. Build the list from the static file
  plus Reprocessing and Reprocessing Efficiency, and delete the hard-coded copy.
- **Skills listed are the ones the input uses.** Reprocessing and Reprocessing Efficiency always; then
  the processing skill (`reprocessingSkill` in the static file) of each pasted item in To minerals, or of
  each ore in the chosen plan in From minerals. A "Show all reprocessing skills" control lists the rest.
  The skills the setup holds are unchanged — only which are listed. An item pasted later adds its skill
  to the list. **Tests:** pasting Veldspar and Clear Icicle lists Simple Ore Processing and Ice
  Processing and nothing else beyond the two always shown.
- **Ore selection** (From): shipping mode and amount, buy outright, compressed ore (three-way), count
  leftovers, never-choose chips. Saves to the planner (F). The save-as-default and revert actions are
  removed: the planner's settings are the default. Where the settings sit behind a `Disclosure`, it opens
  itself when the never-choose list is not empty and never shuts itself, as today's panel does, because
  a list the reader came to see is the reason to open it.

**Landed.**

- **The paste panel** names its direction ("Items to reprocess" / "Minerals you need"), shows a chip for
  what was read and one for what was not, lists the unread lines as pasted, and in From minerals lists
  each real item no ore yields under "No ore yields this; buy it as it is" — read by
  `parseInputMineralString` against the item list's new `itemRecordByName`. The button is Reprocess or
  Find ore, with Clear beside the title; the warning state is gone.
- **The skill list has one source:** `reprocessingSkills.js` builds it from the reprocessing file's
  `reprocessingSkill` plus Reprocessing and Reprocessing Efficiency, and `getAllReprocessingSkills` is
  deleted. The setup lists the skills the read input uses; "Show all reprocessing skills" lists the rest.
  Skill names come from the item list, which names the two the bundled skill list lacks.
- **Skills are worked out while rendering:** the page holds the character and the reader's per-skill
  changes, and the levels in force are the character's trained ones with those changes over them;
  choosing another character drops the changes. The effect that copied trained levels into state is
  gone with the old structure panel.
- **The setup panel** (`reprocessingSetupPanel.jsx`) composes the saved structure, structure, security,
  two rigs, implant, tax and character, the skills in a `Disclosure`, and a yield row for each processing
  skill the input uses — its kind from `reprocessingItemTypeLabels`, the skill and level beneath. From
  minerals opens on a two-line summary with the controls in a `Disclosure`. The tax field sets the
  structure's rate; charging it waits on D2.
- **The page reads the planner's reprocessing settings directly** once held, and its own copy only with
  no planner; every change goes through one change function to whichever is in force, and a held
  planner's is saved. G1's seeding from the planner is gone.
- **Ore selection** (`oreSelectionPanel.jsx`) sits in the side column in From minerals, as the canvas
  draws it: shipping mode and amount, buy outright, a three-way compressed ore choice, count leftovers,
  and the never-choose chips. Save as default and Revert are gone. The canvas draws it open, so it has no
  `Disclosure`. Shipping and buying outright now reach `oreToBuy` and change the plan, but the old output
  panel draws neither: minerals bought outright are missing from its rows and totals, and its ore costs
  leave out shipping, so with either on it under-reports the plan until G4 draws them. Both start off.
- **Reading the paste does not wait for prices.** The From minerals plan waits for its prices; what the
  paste read, what no ore yields and what was not read are shown at once.
- **The setup shows when a character's skills are still being read or could not be**, as the old panel
  did, rather than showing level-0 yields silently. Tax uses the shared `TaxPercentageTextField` and says
  it is not yet counted — charging it is D2. Label-and-value rows are `FigureRow`s.
- **Promotion owes the reprocessing topic docs:** `frontend/reprocessing/settings.md` and
  `frontend/reprocessing/structure-panel.md` describe the deleted settings and structure panels, and
  `testing/frontend/reprocessing.md` their tests; the overlay's § The page and § Reprocessing settings
  replace them.
- **Tests:** the page test lists Simple Ore Processing and Ice Processing for pasted Veldspar and Clear
  Icicle and nothing else beyond the two always shown, the rest once asked; a mixed From minerals paste
  shows what was read, what no ore yields and what was not read; From minerals folds the setup to a
  summary. Unit tests cover the ore selection panel, the settings source and its writes, skill
  overrides, the name lookup and the parser's three outcomes, the skill module, the setup panel (rig
  fields, structure type on a fresh copy, saved structures only signed in, tax, yield rows, skills
  status, the From summary), and From minerals reading its paste before its prices arrive.
- **Reuse review.** The input panels were rebuilt on the shared components they had hand-rolled —
  `SwitchField` for the two switches, `FormField` for labelled controls, `FigureCaption` for captions, and
  `InsetSurface`'s own padding — and two repeated patterns became shared components: `SegmentedChoice`,
  now also behind Planning's pricing model, the Accounts token storage choice and the Reprocessing view;
  and `EvenColumns`, now also behind Planning's exit routes. The wrapping chip row the paste and ore selection panels
  each wrote became `ChipRow`. Considered and left: a removable chip list — its other copies (blueprint
  exemptions, extras categories, the planner search, Add New Job) are all on screens not yet on the
  app-shell design; the Groups page's view toggle, a segmented choice on a screen not yet migrated and
  under other work; the add-a-row form grids of the extras and invention editors (their columns differ);
  and a captioned inset list (only these panels have it, and a caption plus `InsetSurface` plus
  `FigureRow` already composes it). Promotion owes the three new components their entries in
  `frontend/components/forms.md` and `surfaces.md`, and a chip row's in `figures.md`.
- **Crossover review against the redesigned screens.** The setup now renders Settings' structure field
  registry, moved to `Styled Components/Structure/` with a `useStructureFieldContext` hook both screens
  use, so it gains the app-shell field styling, the descriptions and the place constraints; the rig
  fields there now pass `appShellStyled`, which fixes Settings' rigs too. Skills use Planning's skill row,
  extracted as `SkillLevelRow` with `SkillLevelPips` moved beside it; the reducer clears a skill override
  given `null`. The saved structure and character pickers take the app-shell styling props; the market
  and order type pickers, the paste and the shipping amount carry the app-shell styling; the summary
  reads rigs through `rigSlotLabel`; `PanelFallBack` replaces the page's own loading box. Considered and
  left: a shared ISK amount field (its other candidates — the extras cost, the custom transaction — are a
  standard-variant row and an old-UI dialogue); an app-shell character picker with avatars (no drop-in
  exists; `assetScopePicker` mixes owners) and `PricingOrderTypeSelect` (needs a total per order type,
  which G3's answers can supply) — both for G3/G4; and the old Edit Job setup editor, which is not on the
  app-shell design.
  The review of this pass caught that the page's structure change skipped the place rules — an NPC
  station locked the tax field but kept the old tax and rigs, so the yield was wrong. Settings' rules
  (`blankStructure`, the release and fixing of place-forced fields) moved into
  `Functions/Custom Structures/structureChanges.js` as `changeStructure`, which both screens now call.
- **Open question for the A3 tax check:** the NPC station place rule applies to every kind of job, so a
  reprocessing structure at an NPC station is fixed at the 0.25% industry facility tax, on this page and in
  Settings alike. NPC reprocessing tax is not that figure. Charging tax waits on D2 and A3, so the rule is
  left shared until A3 says what the reprocessing figure is.
- **Promotion owes** `frontend/settings/custom-structures.md` and `testing/frontend/settings.md` the
  new paths of the structure field registry and its hook, and the Planning skills docs the new home of
  `SkillLevelPips` and `SkillLevelRow`.

#### G3 — Answers, To minerals

- **Headline**: `PanelHeadline` with the reprocessed figure, as-is, difference, haul volume; price and
  seller controls in the panel header; one `ContextRow` (tax effect).
- **What you get**: a share-of-value bar above a `ScrollingTable`; market value, fees, tax, net.
- **Item by item**: a diverging chart above the table; a row opens a drawer (`InsetSurface`) with per
  batch, totals, market value and cost as this ore. Kept-back items carry a `StatusChip`.
- **Erratic ore and unrefined minerals** (C2b) are marked as such on their row — *Erratic · one mineral
  per batch* — and every figure for them reads as a range: the expected figure first, the likely range
  beneath it. The headline's reprocessed value and difference carry the likely range when any pasted
  item has one, plus **how often reprocessing comes out ahead** of selling as they are ("67 in 100"),
  and a range bar beneath: the bounds as a muted track, the likely range solid, the expected value and
  the as-is value marked and labelled. A line under the headline states the odds the figures assume.
  The row's drawer lists each mineral with what a batch gives if it picks that mineral, the expected
  units, a **spread bar** — the likely span shaded and the expected units marked, on an axis that ends
  at 15 batches' worth so the span is readable (every mineral is expected from 5 of 40 at equal odds) —
  the likely units, and the *at most* figure if every batch picked it. In What you get, an erratic
  item's minerals show expected units with a ~ mark and their own column for the range.
- From minerals never shows erratic ore (E2); an unrefined mineral chosen by the solver shows the
  guaranteed units it was planned at, and the expected extra in the leftovers.


**Landed (G3a — fixed outputs).**

- **Headline** (`reprocessingHeadline.jsx`): "Reprocessed, after fees and tax" leads, with what was
  kept back beneath; beside it, sold as they are, the difference (signed and toned, with its percent)
  and the volume to haul each way. The tax effect is the `ContextRow`; a `StatusChip` counts unpriced
  types; the footer names the fee and seller and how old the prices are. The panel's header holds the
  market, the order side and the seller.
- **The order side shows what each comes to.** The header uses `PricingOrderTypeSelect`, its options
  built by `orderTypeOptions` (`Functions/MarketData/defaults/orderTypeOptions.js`), now shared with
  Planning's `materialCostByOrderType`. Each option is the reprocessed total on that side; the picker
  takes `higherIsBetter`, so a higher total reads as the better one here, and `totalsCaption`, its
  caption, which still defaults to Planning's.
- **What you get** (`whatYouGetPanel.jsx`): the top five outputs and "Everything else" as a
  `ProportionBar`, then a table banded by market group, ending with market value, selling fees,
  reprocessing tax, units kept back sold as they are, and after fees and tax — the headline's
  reprocessed figure. "Copy as list" copies the outputs as EVE reads a paste.
- **Item by item** (`itemByItemPanel.jsx`): a `RankedBarChart` of each item's difference, with a line
  at zero, above a table of quantity, batches, kept back, yield, as is, reprocessed and difference. An
  item under one batch carries a `StatusChip`. A row opens a drawer: for each output, base → per batch,
  total, market value, what it costs as this ore and the market price.
- **Shared parts added:** `ItemName` (`Styled Components/Item/`); `BandRow`, `ExpandRowToggle` (now
  `IconButton/ExpandToggle`),
  `DrawerRow` and `SummaryRow` in `tableParts`, with Settings' markets table moved onto
  `ExpandRowToggle`; `RankedBarChart`'s `markZero`; and `itemListText`
  (`Functions/Clipboard/`).
- **Left for Planning's own pass:** its materials table's expand control and item cell, its material
  drawer, its cost table's bands and subtotal rows, its output header's item name, and its resource
  list text could adopt the parts above, as could `Classes/shoppingList.js`'s list text, but those
  files are under other work. From minerals' `advancedMineralOutput.jsx` still copies its ore list and
  names its items by hand; G4 replaces it with `itemListText` and `ItemName`. That pass should also fix `useMaterialsSourcing`, which hands
  `readPriceRefreshedAt` to `priceAge` without a market, so its price age reads no market.
- **Review.** It caught "Copy as list" importing the clipboard writer by a name it does not export,
  the net in What you get leaving out units kept back, the headline calling those units extra, and the
  Total row's difference dropping its tone because `SummaryRow` toned only numbers; it now tones text
  as well.
- **Tests:** the page test covers the headline figures, the What you get totals with and without units
  kept back, copying the list, an item's drawer, an item under one batch, and choosing the order side
  from its totals. Unit tests cover `ItemName`,
  `itemListText`, the table parts, `markZero`, `orderTypeOptions` and the picker's new props.


**Landed (G3b — ranges).** G3 is complete.

- **Each mineral's spread** is `mineralSpreads(item)` in
  `Functions/Reprocessing/engine/mineralSpreads.js`. For each mineral it gives what one batch gives if
  it picks that mineral, and the expected, likely and possible units. The likely units are not the
  value range's normal approximation. For one mineral of eight, the number of batches picking it is
  lumpy (5 of 40 expected), so the normal figure sits 7% off. Instead each count of batches is weighted
  by its odds, and the percentiles are read from that mixture; it lands within 0.7% of the canvas's
  simulated figures. `likelyOutputUnits(result)` combines those spreads with any fixed units for What
  you get. `normalCumulative` is now exported from `randomOutputValue.js` for it. The per-batch
  amounts follow the engine's rounding, so Tritanium's top is 450,250 where the worked example and
  canvas truncate to 450,249.
- **The headline**, when any item varies:
  - the reprocessed value is marked expected (~), with its likely range beneath;
  - the difference shows its likely range;
  - a "Comes out ahead" figure gives the runs in 100 that beat selling as they are, and the haul
    volume is marked expected;
  - a `SpreadBar` shows the possible track, the likely span, the expected value and the as-is figure,
    with a `ChartLegend` key;
  - an inset line names the erratic ore and unrefined minerals and the odds assumed.
- **Item by item:** a varying item's row carries "One mineral per batch" or "Amount varies". Its
  reprocessed figure and difference are expected figures with their likely ranges, and the difference
  adds its runs in 100 ahead; the total is marked expected. The footnote explains the ~ and states
  each unrefined mineral's possible units. The row's drawer lists each mineral with what a batch gives,
  the expected units, a compact `SpreadBar` and its likely and most units, and its price. For erratic
  ore the bar ends at three times the expected batch count ("None to 15 batches" for 40 batches of
  eight, and never under one batch); for an unrefined mineral it spans the possible units.
- **What you get:** a Likely column appears when an output varies, and that output's quantity and
  value are marked expected.
- **Shared parts added:** `SpreadBar` and `spreadTrackColour` (`Styled Components/Charts/bars/`), and
  `ChartLegend` (`Styled Components/Charts/`), which `ProportionBar`'s legend now uses. `RangeBar` was
  considered and left alone: it places one figure in a padded span between two ends, while a spread
  bar draws how a figure could fall. Its only user is Cost Breakdown, which is under other work.
- **Review.** It caught a single batch of erratic ore reading "None to 0 batches", now at least one
  batch. It also caught the line under a figure, the "8 in 10" wording, the spread legend's keys and
  the span text each written in more than one place. They are now `FigureNote`
  (`Styled Components/Typography/FigureNote.jsx`), `LIKELY_SHARE`, `spreadLegendKeys` and
  `spanText`/`differenceSpanText`, and `ChartLegend`'s line swatch is `RangeBar`'s `rangeMarkSx`.
- **Tests:** the engine's spreads against the canvas's Prismaticite and Unrefined Morphite figures,
  the spread bar, the chart key and the range wording. The page test covers the headline's odds and
  odds line, both row chips, the erratic drawer and its reach, the Likely column, and its absence when
  nothing varies.


**Rechecked against the canvas.** The page was rendered headless at 1440px and 390px from the working
tree, against the local stack, and compared with the To minerals, first visit, signed out, phone and
erratic boards. Fixed:

- **A first visit read nothing.** The build check on load drops every static file when the browser
  has not seen the build, after the route loader has primed them, and nothing loaded the reprocessing
  file again or redrew the page. `staticFile` now takes subscribers, and the page reads the reprocessing
  file and the item list through `useHeldStaticFile`, which redraws when a file arrives or is dropped and
  loads a dropped one again.
- **The setup** is the canvas's compact grid: `StructureField`'s `compact` form drops Settings'
  descriptions and the controls' helper captions and takes short names, in the canvas's order. Yield
  rows are per kind (ore, moon ore and ice always, with tax), by `yieldKindsFor`, not one per skill.
  The skills open under a caption once something is read, through `Disclosure`'s new `heading` form,
  which also draws the From minerals summary's toggle. `ExpandRowToggle` moved out of `tableParts` as
  `IconButton/ExpandToggle` so `Disclosure` can use it.
- **The direction cards** use `SelectableCard`'s new `stacked` form, so the body runs the card's width.
- **The paste** has its label above the box and disables its button while empty. To minerals lists a
  real item that does not reprocess apart from unreadable lines, as From minerals already did.
- **The headline** keeps Planning's market select and order side picker, sized to sit on one line; the
  canvas's combined field was not built, since the other redesigned panels use these two. The footer
  names the market and order side. Signed out, the seller is no character, so fees are at every skill V;
  the store's placeholder character had been priced as a seller with no skills.
- **What you get** leaves out outputs that came to no units, and its legend gives each part's share;
  the unpriced chip no longer stretches.
- **Item by item** keeps paste order (the parser had keyed items by numeric id). Its drawer no longer
  widens the table, and the table, its ranged cells and the item caption wrap so it fits its panel at
  1440px.
- **Left, as decided:** ISK stays at full precision rather than the canvas's compact figures, as every
  other panel states it; compact figures are for G7's phone cards. The chart colours, legends and labels
  are G5, the first-visit panels G6, the phone layout G7, and the signed-out controls G8.
- **Review.** It caught the To minerals answer not following the item list when a new build drops
  both files, the skills toggle reopening on every market change in From minerals (now keyed on the
  committed paste), and comment-rule misses in `items.js` and the Settings markets table, now trimmed.
- **Promotion owes** `frontend/static-data/staticFile.md` the `subscribe` member and a section on
  `useHeldStaticFile` as how a reader that renders from a held file stays current, and the component
  docs the `Disclosure` `heading`, `SelectableCard` `stacked`, `StructureField` `compact` forms and
  `IconButton/ExpandToggle`.
- **The "called use() to suspend" warning** came from every route wrapping its page in
  `lazyRouteComponent` inside the chunk the router's `autoCodeSplitting` already makes, so the inner
  layer was never preloaded and suspended on first render. Every route file now imports its page
  directly; `frontend/navigation/spa.md` says so. Measured on `/reprocessing`: 2 of 6 fresh loads warned
  before, 0 of 12 after, and the production build still splits each page into its own chunk. A route's
  chunk now carries its page, so a test that navigates the real route tree was still loading it when
  the test ended; `tests/routerHarness.jsx` now waits for every router it built to settle after each test.
- **Tests:** a page reading its paste after the reprocessing file is dropped (checked to fail without
  the reload), what does not reprocess, paste order, legend shares, the signed-out footer and the empty
  button; unit tests for the hook, `staticFile` subscribers, `yieldKindsFor`, the compact field, the
  heading `Disclosure` and the stacked card.


**Units, not batches (James's correction).** "Batch" is not the player's word for raw ore: it has to
reach a full 100 before it reprocesses, and counting batches against it reads as
nonsense. The page now counts none. The Batches column is gone from Item by item (for compressed ore
and ice it only repeated the quantity); captions say "reprocessed 100 at a time" where that applies;
"Under one batch" is "Under 100 units"; the drawer reads "Per 100 units" and "From 64,200 units"; and
erratic ore's odds are worded per 100 units, its spread bars ending at three times the expected units
rather than at a batch count. The engine's result gains each item's `batchSize` (additive), and the
words come from `Components/Reprocessing/portionWording.js`. Internal names (`batches`, `batchSize`)
are unchanged. G4's From minerals answers follow the same rule.

The SDE bears the wording out. Raw ore and "Compressed X" both reprocess 100 units at a time and give the
same materials per 100, so compressed ore is one-for-one by count at a hundredth of the volume. Only the
legacy "Batch Compressed X" items, which predate regular compressed ore and are still in the game, give
from a single unit what 100 raw units give. They read as one unit reprocessed alone, with no "at a
time" note, and ore selection counts them as compressed ore because its name rule matches them.


**The paste box scrolls.** A long paste stretched the side column and the page with it. The box now
grows from five rows to twelve and scrolls past that.


**Trained skills no longer depend on the reprocessing file.** The page built a character's trained
levels only for the skills the reprocessing file names, in a memo that recomputed when the skills
changed but not when the file arrived. When the skills came first — likelier now the file is dropped
and reloaded on a new build — only Reprocessing and Reprocessing Efficiency were read and every
processing skill showed 0. The levels are now every skill the character's read returned, which already
carries all seventeen reprocessing skills; a test reads them with the file absent and fails on the old
code.

#### G4 — Answers, From minerals

- **Headline**: ore delivered, minerals delivered, leftovers after fees, ore less leftovers; a stacked
  bar of price against shipping for each route; one `ContextRow`.
- **Ore to buy**: volume, shipping, delivered, what each gives, chosen for; `ItemMarketActions` and a
  never-choose button on the row; Copy for multibuy.
- **Mineral balance**: need, hold (J), gives, left over, leftover value, outright delivered, a
  `StatusChip`; a stacked bar per mineral showing which ore supplies it against a need marker.

#### G5 — Charts

- Recharts, the SPA's chart library. Series colours come from **one** set of chart tokens in the theme
  ([`Context/ThemeContext.jsx`](../../../frontend/src/Context/ThemeContext.jsx)), light and dark —
  checked with the dataviz palette validator against both surfaces. The canvas used and validated
  `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4` (light) and `#3987e5 #d95926 #199e70 #c98500 #d55181` (dark);
  three light colours sit below 3:1 on white, so every chart carries direct labels and its table.
- Every chart has a legend or direct labels, a hover tooltip, and the table beside it as its accessible
  form.

#### G6 — First visit

The panels in their empty form — em dashes in the headline, a short how-to inside **What you get** — in
place of `placeholderPanel.jsx`.

#### G7 — Phone layout

The phone boards are a layout of their own, not the desktop columns stacked. Built through the page's
layout seam the way the Edit Job stages keep a `layoutSelector` and a mobile layout file.

- **Order:** direction, input, the setup (and in From minerals, ore selection) as one-line summary
  cards, then the headline and results. The answer follows the input.
- **Direction** is a two-segment control rather than two cards.
- **The setup and ore selection forms open as bottom sheets** from their summary cards' Edit buttons,
  built on the shared dialogue shell (`ContentDialogue`), mounted only while open.
- **Tables become cards**: each output, item, ore and mineral is a card with its figures in a two-column
  grid; an item card expands in place. Charts keep their labels and stack their legends.
- Touch targets at least 44px. No horizontal page scroll at 390px.
- **Done when:** the page matches the five phone boards in both themes.

#### G8 — Signed-out readers

`/reprocessing` is a public route (`staticData: { audience: "public" }`): a reader with no session uses
it anonymously, and a reader with a stored session is signed in on arrival and returned to the page.
Every stage's work has to hold for the first reader as well as the second. What changes without a
session, as drawn on the **Signed out** board:

| Part | Signed in | Signed out |
|------|-----------|------------|
| Structure | Saved structures, planner default | The same fields, no saved list; a line saying signing in adds them |
| Skills | Read from the chosen character | Every skill starts at V; set by hand, with **All to V** and **All to 0** |
| Selling fees | Worked out for a seller character (D3) | Broker fee and sales tax typed, defaulting to trained-skill rates |
| Ore selection and shipping | Saved to the planner (F) | Kept in this browser |
| Prices | Hubs, saved NPC stations, citadels | The public hub prices; citadels need a session and say so |
| Assets (J) | Opt-in, one location | The controls shown disabled, with "Sign in to load items from your assets" |
| Where these sell (I) | Hubs and the reader's markets | The hubs |

- **"Kept in this browser"** is `localStorage`, read and written defensively, for a convenience only.
  When the reader signs in, the planner's settings win and the browser copy is not merged into them.
- **Signing in from the page keeps the paste.** The sign-in round trip leaves the SPA, so each
  direction's paste goes into `sessionStorage` before the redirect and is restored on return.
- Nothing on the page may wait on a session, a character or a planner to render its figures.
- **Tests:** the end-to-end reducer test from G1 run with no account — every skill reads V on arrival,
  paste, change a skill, see figures, switch direction, nothing requests assets or planner settings.

**Done when (G):** the old components, `optionsPanel`, both output views, `MineralCard`,
`placeholderPanel` and `loadingPanel`, are deleted; the page matches the canvas at 1440px and at 390px.

---

### Stage H — Setup comparison

- **Pin to compare** copies the current setup; two cards at the top of the setup panel choose which one
  the fields edit. **Swap** and **Use pinned setup** in the comparison panel.
- **Comparing setups** panel: where, yield and tax, these items — then each item under both setups as
  paired bars. The engine runs once per setup; nothing else changes.
- **Done when:** the comparison board's figures reproduce from the worked example.

### Stage I — Where these sell

- The same items valued at the hubs and at the reader's saved markets: `fetchPrices` for each market, the
  engine run once per market's `priceOf`. Hauling is not counted, and the panel says so.
- Paired bars per market, then the rows.

### Stage J — Assets, opt-in

- **Load from assets** (To minerals) fills the paste with the ore, ice and gas held at one chosen
  location. **Take off what you hold** (From minerals) subtracts minerals held at one chosen location
  before solving, and fills the **You hold** column.
- Through the shopping list's asset hooks
  ([`Components/Dialogues/Shopping List/Hooks`](../../../frontend/src/Components/Dialogues/Shopping%20List/Hooks)),
  not a second reader. Nothing is fetched until a location is chosen.

### Stage K — Copying

- Copy as list (outputs), Copy for multibuy (ore), Copy leftovers — through
  `Functions/Clipboard/writeTextToClipboard`. The clipboard-permission probe in
  `advancedMineralOutput.jsx`, which writes `"test"` to the clipboard on mount, goes.
  [react-19-idioms](../react-19-idioms/plan.md) fixes the probe first as defect D2; this deletes it.

### Stage M — Modules and scrap metal

**Go and SPA. Waits on [static-data-delivery](../static-data-delivery/plan.md) Stage E's decision**
between per-id fetching and buckets. That decision is the delivery project's to take; this stage is
built so either answer slots in, and nothing here pre-empts it.

**What is missing is one fact per type.** The SPA's item list (`fullItemList.json`, 19,537 types)
already holds modules, faction modules, charges, ships and salvage by name, so a pasted loot line
already resolves to a type id. What it cannot say is what that type reprocesses into. The engine needs
nothing new beyond that: a module is an item of the existing `scrap` type, with materials and a batch
size like any ore, and `reprocess` takes it unchanged once the entry is found.

**This is the static data projects' problem, not a new one.** A large table read a few ids at a time
is exactly the shape [static-data-delivery](../static-data-delivery/plan.md) Stage E is solving for
recipes: `recipeList.json` is 10.1 MB and read a handful of ids at a time. That stage proposes a React
Query entry per id with one batching loader beneath, and leaves one question open before it starts —
**per id from the API, or the table split into buckets**, the second keeping the app usable offline at
the cost of a bucketing scheme that must stay stable across builds. Module outputs should use whichever
answer recipes get. Two mechanisms for one shape is the duplication the repo's rules exist to prevent.

How each delivery and build stage bears on it:

| Static data stage | Effect on module outputs |
|-------------------|--------------------------|
| Build Stage B — relevance gate | Module outputs come from `typeMaterials`, `types` and `marketGroups`, all already among the datasets the conversion reads. No new dataset, no wider fetch, and a build that changes them is not skipped |
| Build Stage C — partial archive fetch | Unaffected for the same reason: no file is read that is not read today |
| Delivery Stage A — compact output | Applies to whatever file or buckets module outputs are written as |
| Delivery Stage B — content-addressed manifest | **Needed first if buckets are chosen.** Without per-file hashes every build re-publishes, and every client re-downloads, every bucket |
| Delivery Stage C — precompressed, validated once | Applies per bucket; without it each bucket costs a parse and a compress per request |
| Delivery Stage D — edge cache | Buckets are cached at the edge under the existing rule; a per-id API response is cacheable only for its exact set of ids |
| Delivery Stage E — the per-id / bucket decision | **The decision module outputs follow.** It also moves the reprocessing file to being primed by this page rather than at boot, which this project's G1 relies on |

**Both answers work signed out.** Static files are public; a per-id endpoint has to be public too, as
`/api/static-data/*` is.

**Built to either answer.** Everything above the delivery mechanism is the same for both, so the
choice touches one loader and one worker output and nothing else:

| Layer | Per id from the API | Buckets |
|-------|---------------------|---------|
| Worker | One more SDE output, held by the API's SDE cache, keyed by type id | The same output split into N files by `typeID mod N`, through the SDE file definitions |
| Served by | A public, batching lookup beside `/api/static-data/*` — the recipes endpoint's shape | The existing static-data routes and edge cache; needs delivery Stage B first |
| SPA loader | Collects the ids a paste needs, fetches them in one request | Collects the buckets a paste needs, fetches them together |
| SPA read | **`reprocessingEntryFor(typeID)` — the same in both** | |
| Engine | **`reprocess` unchanged in both** | |

So the stage is written against `reprocessingEntryFor`: a synchronous read once loaded, a hook, and an
imperative reader, in the location-names shape. Whichever loader delivery Stage E produces for recipes
sits beneath it, reused rather than copied.

#### M1 — Measure

The size of every reprocessable type that is not ore, ice or gas, raw and compressed, from
`typeMaterials`, into `measurements/module-outputs.md`. It turns "too large" into a figure and, if
buckets are chosen, sets their count. **Can run now**, before the delivery decision.

#### M2 — The formula, in game

`scrapMetalReprocessingFormula` is `50 × (1 + 0.02 × Scrapmetal Processing)`. Check whether a structure,
its rigs, an implant or tax change it, and that damaged or assembled items are refused, so the page can
say so rather than guess. Recorded in `measurements/formula-checks.md` beside Stage A's. **Can run now.**

#### M3 — Worker output

A second output beside `output_reprocessing_data.go`: every type with materials that the ore output
skips, as `scrap`, with volume, in the shape delivery Stage E chose. **Tests** beside the conversion
package; `go fix -diff` on the packages edited.

#### M4 — The SPA read

`reprocessingEntryFor(typeID)` looks in the ore file first, then through the loader. `reprocess`
calls it; unread lines (C3) shrink to what is genuinely not reprocessable, such as a blueprint.
**Tests:** a pasted module and a pasted ore in one input produce one result; a blueprint is unread;
signed out, the read still works.

#### M5 — The page

To minerals only: From minerals never chooses a module. Pasted loot adds Scrapmetal Processing to the
scoped skills list, and **Load from assets** can include modules. Item cards show "Module · scrap metal"
and the scrap yield.

**Done when (M):** a pasted haul of mixed ore and loot reprocesses in one input, signed in or out, and
the delivery mechanism beneath it is the one recipes use.

---

### Stage L — Close

- Sweep the whole project together against the rules, duplication, dead code, comments, patterns and
  missing tests.
- The engine moved into `Functions/Reprocessing/engine/` and `valuation/` (§ Where the reprocessing code
  lives) while live docs still name the old paths: `frontend/reprocessing/structure-panel.md` and
  `testing/frontend/reprocessing.md` cite `Functions/Reprocessing/reprocessingBonuses.js`. Promotion
  rewrites them with everything else.
- Fill [`../../testing/frontend/reprocessing.md`](../../testing/frontend/reprocessing.md)'s replacement
  draft here, then promote: the engine topic `frontend/reprocessing` has never had, the page topics, the
  static file's new fields, the settings shape.

## Design reference

Canvas: **Reprocessing Redesign** — https://claude.ai/artifact/5HovmoD6arBetuQ18GFuiE

| Board | Shows |
|-------|-------|
| To minerals · dark / light | Every To minerals panel, one row open, with the charts |
| From minerals · dark / light | Every From minerals panel, shipping per m³, the trimmed solver plan |
| Comparing two setups · dark / light | The page with a setup pinned |
| First visit | The panels empty |
| Phone · To minerals, From minerals, Comparing setups (dark / light) | G7's phone layout, one item card open |
| Phone · Setup sheet, Ore selection sheet (dark / light) | The two bottom sheets, with the skills list scoped to the input |
| Signed out · To minerals (dark / light) | G8: no saved structures or characters, skills by hand, typed fees, assets disabled, hubs only |

**Reprocessing elsewhere in the app** — the sketches behind § Not in the sequence, each drawn on the
design its own screen's project plans:

| Board | Shows |
|-------|-------|
| Planning stage, planned frame · minerals bought as ore | The whole Planning stage inside the frame planning-stage-panels Stages P and Q plan: minerals as Ore rows, the ore panel collapsed beneath Materials & Sourcing, *Minerals bought as ore* and the hauling estimate in Cost Breakdown, the *Reprocessing the ore* skills group |
| Materials & Sourcing · the ore offer | The one offer line before ore is used |
| Planning · the ore panel opened | The ore plan, its editable prices and the mineral chart |
| Shopping List · buying ore | The shipped dialogue with an ore section and a copy that says what it copies |
| Purchasing worklist · ore panel collapsed, opened, recorded | The ore panel between Purchase Summary and Materials on the purchasing-stage-panels worklist, and the hauling estimate in Job costs |
| Mixed job · Materials & Sourcing, the offer and ice in use | A Helium Fuel Block job: ice products marked Ice among PI materials, sorted by name, with a collapsed ice panel |
| To minerals · erratic ore and an unrefined mineral (dark / light) | C2b and G3: Prismaticite 4,000 and Unrefined Morphite 1,000 — the ranged headline, how often reprocessing comes out ahead, and the Prismaticite drawer with each mineral's spread. Figures from the worked example § Erratic ore and a 100,000-run simulation |
| Mixed job · Shopping List, as it is and ice in use | The copy menu: everything, the ice only, everything but the ice, or the list as it was |

Every figure on the canvas comes from [measurements/worked-example.md](./measurements/worked-example.md).
The canvas is private until shared from its Share menu.

## Not in the sequence

- **Reprocessing on other screens.** Planning stage sourcing ("buy as ore"), the shopping list, the
  assets dialogue, the watchlist, and a yield preview in the custom structure editor. Each is a consumer
  of Stages C–E and belongs to the project owning its screen. Planning sourcing is the strongest: the job
  is loaded there, so the jobs-not-local problem does not apply. Where each is held: Purchasing's part
  in [purchasing-stage-panels](../purchasing-stage-panels/plan.md) § Handed from the reprocessing
  rebuild, which its stages leave room for; Planning's in
  [planning-stage-panels](../planning-stage-panels/plan.md) § Handed on: minerals bought as ore, which
  records the seams but scopes nothing, because that project is closing; and the Shopping List, which
  no project redesigns, only here. The section task map [`../contents.md`](../contents.md) carries a row
  for the unscoped part. Sketches of Planning, Purchasing, the Shopping List and a mixed job are on the
  canvas under "Reprocessing elsewhere in the app" (§ Design reference), each drawn on the design its own project plans:
  Planning's built panels inside the frame [planning-stage-panels](../planning-stage-panels/plan.md)
  plans in Stages P and Q (tabs, labelled controls, Output, and the Setups and Blueprint rows),
  Purchasing on its planned worklist, and the Shopping List as shipped, because no project redesigns
  it. What they rely on from this project, for jobs that
  need minerals and other things at once:
  - **Out of the way until it is chosen.** Reprocessing adds nothing to a screen until it would save
    something: then one line inside the offer box the screen already has (Materials & Sourcing's
    build offer, a line in the Shopping List's side column), and nowhere else. Producible rows look
    exactly as they do today until the reader uses it, and one control undoes it.
  - **Only producible rows change, and the ore is never a row.** In Materials & Sourcing and the
    Purchasing worklist, the materials ore can produce (C2a) stay ordinary rows, marked Ore (or Ice)
    with their cost as ore; components, PI materials, Construction Blocks and buildable rows keep their
    Buy / Build plan and their place in the list, which stays sorted by name. The ore itself has a
    panel of its own beneath the list, **collapsed by default** to one summary line, opened only when
    the reader wants the plan or wants to record it. The Shopping List keeps its ore section, because
    there the ore is what is bought.
  - **One plan per list, never one per row.** The solver runs once over all of a list's producible
    needs, because one ore covers several minerals. A mineral the solver buys outright stays in the
    group and says so.
  - **Hauling is an estimated extra, not a cost line.** Extras already has a Hauling Service
    category for this, but holds only recorded costs. The ore plan offers an *estimated* extra in that
    category: worked out from the plan, never stored, counted in Cost Breakdown with an "estimate"
    mark until the reader records what they paid. It is an expense the build must pay, so it is in the
    costing everywhere the cost is used — Returns' net return and break-even included — and because
    those read only recorded extras, the estimate is added to the cost they are handed rather than
    left to arrive on its own. Recording writes an ordinary extra in the shape
    extras already have, and a category's recorded total then replaces its estimate. The
    reprocessing tax stays inside the ore line, because it is the price of turning ore into
    minerals.
  - **The figures are the reader's to change.** Every ore price in the plan is editable (what was
    paid, what self-mined ore is worth, or 0), and the minerals' costs follow by value share or are set
    by hand. On Purchasing this is built on the worklist
    [purchasing-stage-panels](../purchasing-stage-panels/plan.md) is building, not on today's cards:
    the ore has a panel of its own between Purchase Summary and Materials, so the materials list
    keeps its shape and each mineral is an ordinary row whose source points at it. The panel is the
    one place the ore is recorded: what was paid for each ore and the tax, prefilled from the plan,
    beside a chart of which ore supplies each mineral with each mineral's cost, all editable before
    anything is written; editing one mineral's cost moves the others so the total stays whole. Hauling is recorded in the Job costs panel's Extras zone, where its estimate
    waits. This waits on that project's worklist and drawer stages (B and C).
  - **The copy says what it copies.** With ore in use, the Shopping List's copy carries the ore in
    place of the minerals it replaces and says so beside the button. A menu offers the other cuts
    (everything, the ore only, everything but the ore, or the list as it was with the minerals),
    because ore and the rest are often bought at different markets.
  - **A child job plans its own minerals** on its own Planning stage. A group's Shopping List merges
    every job's materials by type already, so it solves once over the merged needs — which leaves
    fewer leftovers than each job alone. What each job is charged from that shared plan is the
    plan's cost shared by the market value of the minerals each job takes, the same allocation as
    "cost as this ore" (D1).
- **Reacting Prismaticite to steer it.** The Unrefined minerals are made by Unrefined Mineral Reactions
  (the eight `Unrefined … Formula` blueprints, 90274–90282): 100 Compressed Prismaticite and 100 to
  3,000 Atmospheric Gases make 100 of one Unrefined mineral in 360 seconds, at a Standup Composite
  Reactor. That route trades a random batch for a guaranteed mineral at a lower amount, and it is a
  reaction job — which the job planner already plans, from the same recipes. From minerals buys Unrefined
  minerals from the market (E2) and does not plan the reaction; offering the whole chain would make the
  solver a job planner. A reaction job's Unrefined output can be pasted into To minerals like anything
  else.
- **Filling From minerals from a job.** Rejected: jobs are not always loaded in the SPA.
- **Shipping on To minerals.** Rejected: it needs a location the items are shipped from.
- **Collateral.** Rejected: not paid by whoever pays for the hauling.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | **Complete.** This folder, the section row, the overlay scaffold, two measurements |
| A — formula questions | **A1 settled** against live by a parity corpus — no in-game check owed for rounding. A2, A3 and A4 not started; they need a player |
| B — the reprocessing static file | **Complete.** Volumes, the file reshaped to `{ items, materialVolumes }`, skills and kinds read from the SDE, random outputs written, `volumeOf` in the SPA; B2 confirmed the release's rebuild step publishes it, with one operator check owed to the window |
| C — engine core | **Complete.** One setup shape and `yieldFor`; what ore can produce read from the file; parsing hands back what it could not read; `reprocess` with every output a total and live's rounding; ranges for random outputs and `randomOutputValue`; the page's logic on the core (C4 logic only — the class retires in G) |
| D — valuation | **D1 and D3 landed** — every figure from a result, prices and rates; selling fees for a chosen seller, typed when signed out. D2 waits on A3 |
| E — solver | **Complete.** `yalps` added; `oreToBuy` within 0.5% of the optimum on every benchmark list, and the page chooses ore with it; the old selector and its three sliders are gone |
| F — settings on the planner | **Complete.** The planner holds the reprocessing settings and the account the default character; the release moves them across in `backfillPlannerSettings`. The full release rehearsal is owed to the window |
| G — page on the app-shell | **G1–G3 landed** — the frame, a reducer of choices, results worked out while rendering, the inputs (paste, setup, skills from the file, ore selection on the planner) and the To minerals answers with their ranges, rechecked against the canvas. G4 next |
| H — setup comparison | Not started |
| I — where these sell | Not started |
| J — assets | Not started |
| K — copying | Not started |
| L — close | Not started |
| M — modules and scrap metal | Not started. M1 and M2 can run now; M3–M5 wait on static-data-delivery Stage E |

## Handoff

**Start here:** Stages B and C are complete, with the rounding settled against live (A1). D1 and D3
have landed and D2 waits on A3. Stage E is complete: the page chooses ore with the solver. Stage F is
complete, and G1 to G3 have landed — the page's frame, its inputs and the To minerals answers — so next
is G4, the From minerals answers, worded in units like G3. The in-game checks left in Stage A (A2 gas, A3 tax, A4 erratic ore) need a player
and can be prepared at any time; D2 waits on A3.

**Recommended pickup order:** A (prepare) ∥ B1 → B1a → B1b ∥ C1 → C2a → C3 → C2 → C2b → C4 → D1 → D3 → D2 → E1 → E2 → E3 →
F1 → F2 → F3 → G1 → G2 → G3 ∥ G4 → G5 → G6 → G7 → G8 → H ∥ I ∥ J ∥ K → M3 → M4 → M5 → L.
M1 and M2 run alongside Stage A at any point. If delivery Stage E has not decided by the time K lands,
L closes the rest and M stays open on its own.
