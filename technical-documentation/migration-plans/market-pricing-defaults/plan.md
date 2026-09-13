# Market pricing defaults — plan

**Status:** Stage A steps 1-6 landed; step 7 waits on the shared-planners release. Stage B is done: the
group rung resolves end to end, and the selling side names an exit route with controls for it. What
remains is a surface for setting a *group* default, which nothing yet offers — see § Still open.
**Code in scope:** [`frontend/src/`](../../../frontend/src/) — `Hooks/Planner/`, `Functions/MarketData/`,
`Styled Components/Select/`, `Zustand/applicationSettings/`, `Classes/shoppingList.js` and the panels
and dialogues listed in § Stage A; [`services/shared/models/`](../../../services/shared/models/),
[`services/shared/documentschema/`](../../../services/shared/documentschema/),
[`services/shared/schemamaint/`](../../../services/shared/schemamaint/);
[`services/worker/tasks/sde/update/`](../../../services/worker/tasks/sde/update/) for Stage B only.
**Live SoT (until promote):** [frontend/](../../frontend/contents.md), [backend/](../../backend/contents.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

**`go fix` in scope:** clean for Stage A (`./shared/models/...`, `./shared/documentschema/...`,
`./shared/schemamaint/...`). Scanned again when Stage B opened, over `./worker/tasks/sde/...`,
`./shared/core/sde/...` and `./api/staticdata/...`: two suggestions, both `omitempty` to `omitzero`,
which `go fix` itself marks a behaviour change — `VersionJSON.GeneratedAt` in `shared/core/sde/files.go`
and `fileMeta.ModTime` in `api/staticdata/endpoints.go`. Both are on fields this project does not
touch, and JSON tag semantics belong to [go-127-adoption](../go-127-adoption/contents.md). Left alone
deliberately, and named here so a later scan coming back non-empty is not mistaken for new debt.

Three further suggestions appeared on this project's **own** new code and were taken: a
`json:"…,omitempty"` on a struct field, which does nothing and promised an omission it could not
deliver; an embedded-field literal `go fix` simplifies to the promoted form; and a hand-rolled
`contains` helper in the new `shared/core/sde` test, which is `slices.Contains`. All three are in scope
because they are on lines this project wrote.

## Why this project exists

`applicationSettings.defaultMarketLocation` and `defaultOrderType` are one pair of fields answering
two questions that have different answers: **where materials are priced when buying, and where output
is priced when selling.** A player who buys in Jita and lists in Amarr cannot say so. The single field
predates both the per-item price overrides and the four pricing bases, and it is the reason the two
sides were crossed on the Planning stage — a sale's tax was calculated against one location while its
price came from another.

The selling half is already half-built. A job's sale location is its own stored choice, resolved
through `saleLocationID` to a `priceHubID`, and every consumer prices against that. What is missing is
only the account-level default underneath it, for a job that has not named one.

## Two axes, both called buy and sell

**This is the trap to clear before a single field is named.** "Buy" and "sell" mean two different
things here, and the existing field uses one of them:

- **Which side of the job.** Materials are *bought*; output is *sold*. This is the axis the split
  introduces.
- **Which side of the order book.** `listingType` publishes `buy`, `sell`, `buyP95` and `sellP05` —
  the best bid, the best ask, and each trimmed of outliers. `defaultOrderType: "sell"` means *price
  from sell orders*, not *this is my selling default*.

The two axes disagree on purpose. Buying materials is normally priced from the **sell** side, because
that is the ask you actually pay; selling output is normally priced from the **buy** side if you are
dumping into bids, or the sell side if you are listing. So a correctly configured account will hold
`buying.basis = "sell"`, which reads as a contradiction and is not one.

Name the axes apart and never let one field carry both. The job side is **buying** / **selling**; the
book side keeps the existing `listingType` vocabulary and is called a **basis**, not an order type.

## Where this project stops and market price delivery starts

This project decides **what to ask for**; [market-price-delivery](../market-price-delivery/contents.md)
decides **how the asking works**. One picks the market and the basis, the other carries the request,
shapes the row that comes back, holds it and decides when it has gone stale. Neither redefines the four
bases.

The cut matters because both projects live in `frontend/src/Functions/MarketData/` and the split is not
obvious from the file names:

| Question | Owned by |
|----------|----------|
| Which market and basis a figure is priced against | here — the ladder, the two account sides, group defaults |
| What a request names and what the response carries | market-price-delivery § Stage B |
| Where a price row is held, and what makes it stale | market-price-delivery § Stage C, § Stage D |
| Which markets may exist at all beyond the four hubs | market-price-delivery § Stage A, § Stage F |

**The dependency runs one way: that project consumes this one's resolver.** Its § Stage B, item 5 moves
every call site onto naming the source it wants, and names this project's resolver as what answers that
question — "where it is not yet wired, a call site names the market it is already pricing against". So
Stage A landing ahead of it is what makes that step cheap, and there is nothing this project needs back
before finishing Stage B.

**What that project will rewrite underneath this one.** `findMarketData` and `worldData.marketData` are
being rekeyed to type-and-source and put behind a single accessor (§ Stage B, items 3 and 4). The guards
this project added to the unguarded price reads (§ Three files throw rather than degrade) sit on top of
that function, so expect them to be reshaped rather than preserved — they were still the right change,
because the id that misses became reachable the moment the account default split.

`DEFAULT_MARKET_OPTION` survives. That project retires `MARKET_OPTIONS` across its readers but keeps the
default choice, so this project's fallback at the bottom of the ladder is not affected.

## The ladder

Resolving a market id is one ladder, and only its ends are built:

```
1. the item's own override on the job          getEffectiveMaterialPriceHub
2. the surface's own choice (panel, dialogue)  useEffectiveMarketHubFromLayout, dialogue state
3. the nearest market group carrying a default  Stage B
4. the account's default, for the side asked    Stage A
5. DEFAULT_MARKET_OPTION                       global-config-app
```

A nearer rung outranks a further one, on both sides of the job. Rung 1 already holds that rule —
`getEffectiveMaterialPriceHub` returns `override?.marketDisplay ?? panelDefault`, resolving hub and
basis independently so a row can name a hub without naming a basis — and the split must not break it:
a player who sets one material to a hub and then changes the panel's must not lose the row they had
already answered.

## The side is chosen at the call site

A surface says which side it wants; nothing infers it from context. The resolver takes the side as an
argument, so moving a surface from the selling default to the buying one is changing one token rather
than migrating a setting.

That matters because three surfaces have no obvious side. `ItemWatch` is a watchlist, the Price Entry
dialogue seeds a figure the player is about to overwrite, and the market-link helpers want whichever
market the figure beside them came from. Rather than guessing once and burying the guess, each names
its side where it asks, and a wrong choice is visible and cheap to change.

## The job's override splits too

Rung 2 carries the same conflation rung 4 did. `layout.localMarketDisplay` / `localOrderDisplay` is a
single pair on the job, and `useEffectiveMarketHubFromLayout` feeds it to both Materials & Sourcing
and — through `useJobSellingContext` — the selling context. Parameterising the hook by side does not
fix that on its own: both sides would still fall through to one job-level override, so a player whose
account can buy in Jita and sell in Amarr could not say the same thing about a single job. That reads
as a regression the moment anyone tries it.

So the job's override takes the same shape as the account's: a side each, each naming a market and a
basis.

**An empty value is not a choice.** That one rule holds at every rung — an account side the upgrader
has not filled, a job side the player has not set, a material override naming a market but not a
basis. It is why `PricingSide` marks both fields `omitempty`, and why the resolver tests a field for
emptiness rather than for presence.

**The job's is nil-able where the account's is not.** An account always has defaults; a job usually
has no override at all, so `JobLayout.LocalPricing` is a pointer and nil omits it from the document
entirely rather than writing an empty pair onto every job.

**Nothing seeds a job server-side.** `Upgrader.Job` only clamps the schema version, and it runs in the
offline `schemamaint` drain rather than on read, so a job is handed to a caller exactly as stored.
Seeding an existing job's single override into both sides therefore belongs in the SPA's `Job`
constructor, beside the `marketLocation → localMarketDisplay` alias already there. That is the
established home for a job's defaults and legacy shapes, and it is the opposite of where the account's
seed went — worth stating, because the two look like the same problem.

## Stage A — Retire the single account default

**Frontend and stored shape. Backend stores only.**

Separate defaults for the buying and selling sides, each naming a market and a basis, replacing
`defaultMarketLocation` / `defaultOrderType`.

### What reads them today

| Surface | How it reads the default |
|---------|--------------------------|
| `Hooks/Planner/useEffectiveMarketHubFromLayout.js` | job override ?? account default ?? global |
| `Hooks/Planner/useStripRedundantJobMarketHubOverrides.js` | clears a job override equal to the default |
| `Styled Components/Select/{marketLocation,marketListing}.jsx` | the `…ApplicationSettings` variants |
| `Classes/shoppingList.js` | direct, in `calculateTotalValue` |
| `Components/Dashboard/Components/ItemWatch/{ItemRow,ItemRowExpanded,itemWatchContainer}.jsx` | direct |
| `Components/Dialogues/Price Entry/Hooks/usePriceEntryReducer.js` | seeds the dialogue's own hub and basis |
| `Components/Groups/Side Menu/Panels/OutputData/OutputCard.jsx` | direct |
| `Components/Reprocessing/Hooks/useReprocessingReducer.js` | seeds the reducer's own `marketLocation` |
| `Styled Components/{IconButton,Typography}/market{Data,History}.jsx` | direct, to build a market link |
| `Components/Settings/…/jobSettingsFrame.jsx`, `First Login/…/FirstLoginPlannerSetupStep.jsx` | the controls that set it |
| `Zustand/applicationSettings/preferences.js` | `updateDefaultMarket` / `updateDefaultOrders`, the setters behind those controls |
| `Styled Components/Select/applicationSettingsMarketUtils.js` | the shared helper both `…ApplicationSettings` selects align through |

Most of these read the field directly and have no override rung at all, so the change is wide but
shallow. `useEffectiveMarketHubFromLayout` is the exception in the other direction: it currently
serves both Materials & Sourcing and, through `useJobSellingContext`, the selling context, so it is
one hook answering for both sides and has to be split or parameterised rather than repointed.

### Three files throw rather than degrade

`shoppingList.calculateTotalValue`, `ItemWatch/ItemRow.jsx` and `ItemWatch/ItemRowExpanded.jsx` index
`findMarketData(typeID)[hub][basis]` with no guard on either step. The guarded form is the exception —
`OutputCard.jsx` is the one checked example that degrades to `0`. An id the per-hub shape does not
carry was a `TypeError` rather than a figure of nothing, and the split was the moment that became
reachable, so they were guarded with the stage — see [overlay.md](./overlay.md) § A3.

`ItemRow.jsx` alone holds **13** of them: three in `buildCosts`, and ten more in render reading
`calculatedCosts.mainItemPrice[defaultMarket]`. Those ten then take `.sell` directly rather than the
account's basis, so the row already prices the watched item from the ask whatever the setting says —
which is a small piece of evidence for what side that surface is on.

`worldData.findMarketData` builds its empty default by reducing `MARKET_OPTIONS`, which is what makes
an unrecognised id miss in the first place. It is the one function every price read bottoms out in and
the natural home for whatever the answer turns out to be — and it is the function
[market-price-delivery](../market-price-delivery/contents.md) § Stage B rekeys to type-and-source and
puts behind a single accessor, so these guards are expected to be reshaped by that work rather than to
stand as written.

### Wire compatibility

**Additive, no schema bump.** `DefaultMarketLocation` and `DefaultOrderType` are plain `string` fields
on `ApplicationSettings` in `services/shared/models/accountDocuments.go`, defaulted to `"jita"` and
`"sell"`, with no enum behind them. The new fields go in alongside.

`ApplicationSettings` does carry a `SchemaVersion` with `ApplicationSettingsSchemaCurrent`, and
`Upgrader.ApplicationSettings` runs on **every read** rather than only in the offline drain, which
makes it the place to seed the new defaults from an existing account's single value.

**Seeding is not optional, and it cannot be deferred behind the field it fills.** Go serialises a
non-pointer struct field whether or not Mongo held it, so an account stored before the split reaches
the SPA as `"defaultPricing":{"buying":{},"selling":{}}` — the key present with each side empty, not a
missing key. A client that reads that as an answer overwrites the account's real default and writes
the emptiness back on the next save. The upgrader fills it before anything downstream sees it, and the
SPA merge treats a side with no market as unfilled rather than as a choice of nowhere.

`PricingSide`'s own fields are `omitempty`, which is why an unfilled side is `{}` rather than a pair of
empty strings. A consumer must read **either** as unanswered: the two shapes differ only by who wrote
the document, never by what it means.

**The seed is gated on the empty market, not on the schema version.** An unversioned document is
stamped with the current version at the top of the same function, so a `SchemaVersion < n` test would
never fire for exactly the legacy rows that need filling.

**The stored backfill rides the shared-planners release rather than a schema step.**
`account_settings` is already being stamped in that project's release window, so writing
`DefaultPricing` once per account belongs in its `prepareRelease` run beside the owner stamp — see
[shared-planners/plan.md](../shared-planners/plan.md) § Schema versioning. The read-time seed is what
carries the field until then, and retires once that step has run and its gate has passed. Either way
no `*SchemaCurrent` constant moves: this is a backfill, not a migration.

Nothing in `services/` computes anything from these two fields; the backend only stores them.
`esicore.DefaultMarketLocations` is an unrelated constant naming which hubs to refresh, and is not
touched.

The SPA already carries a merge of exactly this kind, from the older `localMarketDisplay` /
`localOrderDisplay` to today's fields, in `Zustand/applicationSettings/core.js`. The same shape serves
again, and the old pair stops being written and ages out with the documents.

### The work

1. ~~Name the two axes apart (§ Two axes, both called buy and sell) and add the fields.~~ Done.
2. ~~Seed them in `Upgrader.ApplicationSettings` from the existing single value.~~ Done — landed with step 1, because step 1 alone is a data-loss bug.
3. ~~Split the job's own override the same way, give the resolver a side argument, and move the job's
   hub and basis controls onto it (§ The job's override splits too).~~ Done — the controls had to move
   in the same step, because a read path on the new field and a write path on the old one freezes the
   override at whatever was picked first.
4. ~~Point each surface in the table at a side, explicitly.~~ Done.
5. ~~Guard the unguarded price reads in the three files above.~~ Done, with the rest of step 4.
6. ~~Settings and first-login controls offer both pairs.~~ Done.
7. Stop writing the old fields, once the shared-planners release has backfilled the stored ones.

**Done when** every surface in the table names a side, no code reads `defaultMarketLocation` or
`defaultOrderType`, and a player can buy against one market and sell against another without touching
a job.

## Stage B — Defaults by market group

**Worker, API and frontend.** Opens only once Stage A has landed: this rung sits beneath the account
default and above nothing, so it has no meaning until there is a side to fall through to.

### The SPA holds no market group data at all

`FullItem` — the only per-type record the SPA reads — is `type_id`, `name` and `category_id`, and a
`Material` carries `typeID`, `name`, `jobType` and `volume`. There is no axis to key a default on.

The worker already has the data and drops it on the way out:

- `marketGroups.jsonl` is downloaded and parsed into `marketGroupsData`.
- A type's real market group is `EVEType.MarketSectionID`. **Read that name carefully:**
  `EVEType.MarketGroupID` holds the SDE's *inventory* `groupID`, which is what a category is looked up
  by. The two are crossed on the struct, and the comment on `GenerateFullItemListOutput` exists
  because it has already caught someone.
- `findParentGroupFromMarketGroup` already walks a group's parent chain, for reprocessing.
- `GenerateFullItemListOutput` writes neither field into `FullItem`.

### Category is the wrong granularity

Keying defaults on `category_id` needs no backend change at all, and is the wrong feature. Category 4
is "Material", which lumps minerals, moon goo, fuel blocks and salvage together — precisely the things
a player would want priced differently from one another. Shipping it would teach a grouping players
would then want to escape.

### A group default belongs to a side

It is stored inside `PricingSide` as `Groups`, keyed by market group id, so a group can never answer
the selling side with a figure meant for buying — the conflation this whole project exists to remove.
The cost is that pricing minerals on both sides is two entries; the alternative was a group rung
giving one answer to two different questions.

**A job's override is a different type for the same reason.** `JobLayout.LocalPricing` is `*JobPricing`,
a pair of `PricingChoice` with no group table: market groups are an account-level rung *beneath* a job's
own choice, so a job carrying one would be answering a question it does not own. Both share
`PricingChoice`, which is the shape of an answer at every rung that can give one.

**Nothing may replace a whole side to fill part of it.** A side can hold a group table before it names
a market of its own, so the upgrader's seed assigns the embedded pair and leaves `Groups` alone, and
the SPA's merge carries `groups` through rather than rebuilding the side without them. What is
persisted is the merged copy, so a merge that dropped them would lose them on the next unrelated save.

**A nearer group outranks a further one, field by field.** Market and basis are answered separately and
each stops at the first ancestor naming it, so a group naming a market without a basis narrows one axis
and leaves the other to whatever answers next. That is the rule rungs 1, 2 and 4 already use; making
rung 3 behave differently inside itself would be the surprise.

### The tree is where the design is

EVE's market groups are a deep tree, and a default set on "Minerals" must cover Tritanium. So rung 3
is not a lookup but a walk: *the nearest ancestor market group carrying a default*. The walk runs per
material row, on every row of every job, so it wants a cache.

**Additive on both sides.** `FullItem` gains `MarketSectionID` — the item list is read as a map, so a
new field breaks no consumer, though the published list needs regenerating — and the market group tree
is published alongside it so the setting can offer "Minerals" rather than an id.

### The work

1. ~~Publish an item's market group and the group tree.~~ Done (B1).
2. ~~The stored shape for a group default, and the walk that resolves one.~~ Done (B2, in part).
3. ~~Consult the walk from the per-material resolution.~~ Done (B3). Rung 3 is **per item**, like rung
   1, so it sits in `getEffectiveMaterialPriceHub`. Making it fire meant the panel default could no
   longer arrive as a bare value — see [overlay.md](./overlay.md) § B3. Inert until item 4 supplies
   the tree and the item's own group.
4. ~~Read the published tree and each item's market group in the SPA.~~ Done (B4).
5. ~~A settings surface for choosing a group and what it prices against, per side.~~ Done (B5), for
   the account's own defaults. A per-group surface is still to come — see § Still open.

**Done when** a player can say "price minerals from Jita buy orders" once and have every mineral on
every job follow it, without touching a row.

## Stage B6 — A surface for setting a group default

The rung has resolved a group default since B3, and nothing writes one: the table is filled by hand
or not at all. This is the last piece of Stage B.

### The published tree gained child links first

Browsing the tree needs downward links, and the file carried only `parent_id`. Deriving one from the
other means inverting two thousand entries in every session — the same answer, rebuilt in the browser
from data the worker already holds in order. So `MarketGroup` gained `children` and `has_types`, and
the SPA reads both rather than computing them.

`has_types` is taken from the **published item list**, not from the SDE's own flag: the question a
reader has is whether a group holds anything *the app knows about*, which is not the same as what the
source says about types the item list may never carry. `GenerateMarketGroupsOutput` therefore takes the
item list, and runs after it in `conversionStage`.

Children are sorted by id so the same source produces the same bytes, which is what lets a published
file be compared between builds.

**Nothing caps a walk downward.** The upward walk has `MAX_GROUP_DEPTH` because a cycle would hang a
page rendering once per material; a browse is driven by a reader and stops when they stop, so it has no
equivalent. A self-referencing or two-node cycle in the source would let a reader open the same group
forever. Neither exists in CCP's data and neither is guarded — recorded here rather than defended
against, so that a browse behaving oddly has somewhere to start.

**Additive, no schema step.** Both fields are `omitempty` on a file the SPA reads as a map, so an
older SPA ignores them and a newer one tolerates their absence until the next SDE build publishes
them. The `CACHED_DATA_FILES` parity test is unaffected — this adds fields to an existing file rather
than a file.

### The work

1. ~~Publish child links and an items flag on each market group.~~ Done (B6.1).
2. Read them in the SPA: `childrenOf` and `ancestorPath` beside the tree they walk.
3. A store action that merges one `groups[id]` entry. `updatePricingDefault` flat-spreads a side and
   cannot reach one level deeper — passing `groups` replaces the whole table, which is the trap
   § A group default belongs to a side already records.
4. The panel: `AppShellPanel`, a section per side, each listing that side's groups with the market and
   the basis or route it prices against.
5. The picker: a `ContentDialogue` browsing the tree, any level selectable, with a name search beside
   it for a reader who already knows what they want.

**Done when** a player can say "price minerals from Jita buy orders" from Settings and see every
mineral on every job follow it.

## Stage N — One vocabulary for a market and a basis

**Frontend only, no behaviour change.** Deferred deliberately: it is a rename, it spans more code than
this project owns, and it is better done once, whole, than in pieces as each stage passes through.

The same two values travel under four names between the store and the screen:

| Layer | Names | Occurrences |
|-------|-------|-------------|
| Stored shape (Go) | `Market` / `Basis` | — |
| The ladder | `marketDisplay` / `orderDisplay` | 70, across 20 files |
| A material row | `marketSelect` / `listingSelect` | 157, across 24 files |
| The Select components and the panels wiring them | `marketLocation` / `orderType` | — |
| The Reprocessing reducer's own state | `marketLocation` / `marketListing` | — |

Each layer converts once and passes on, so nothing is wrong — this is friction for a reader tracing a
figure, not a defect, which is why it is a task of its own rather than a fix.

**The row-level name is the dominant one, not the ladder's.** That is the opposite of what it looks
like from inside this project, whose own modules are all ladder-side. `marketSelect` / `listingSelect`
is entrenched in `Functions/Groups/`, `childJobTotals`, `materialCostFromChildJobs`, Cost Breakdown and
the Materials drawer and table — none of which this project introduced or has reason to touch. Decide
the direction from the whole SPA rather than from the pricing modules, and settle the Select props and
the Reprocessing reducer's state names in the same pass; doing the inner two alone leaves three
vocabularies instead of four.

**Wire compatibility:** none. The Go field names do not move, and nothing renamed here is persisted or
crosses a process boundary.

## Non-goals

- Changing what a pricing basis means, or adding a fifth.
- Making `MARKET_OPTIONS` hold anything but the four NPC hubs. Widening what a market id may be is
  [market-price-delivery](../market-price-delivery/contents.md), which retires that list for a source
  registry admitting reader-saved markets (§ Stage A) and takes saved citadels as pricing locations
  (§ Stage F). This project must not assume the list stays four, but does not extend it.
- A per-planner or per-group default. These are account settings, as they are today.

## Open decisions

None outstanding. The selling side's default names an **exit route**, settled in § Stage B5.

## Traps this work has already fallen into

Recorded because each one passed a build, passed a test run, and would have reached a player.

**A field the wire always carries.** Adding a stored field is not additive on its own: what fills it
has to land in the same change, or every existing document answers with an empty one. See
§ Wire compatibility.

**The shape of "empty" changed under a comment that described it.** `PricingSide`'s fields gained
`omitempty` a stage later, so an unfilled side went from `{"market":"","basis":""}` to `{}` — and the
comment, the plan and the regression test all still described the old shape. The test had never
exercised the real payload. A claim about the wire is worth re-probing whenever the tags move.

**`omitempty` on a struct field does nothing.** `json:"buying,omitempty"` promised an omission
`encoding/json` will not perform. A pointer is what omits a whole absent thing; within a present one,
an empty member is written as `{}`.

**A read path on the new field with a write path on the old one.** A half-finished cutover is worse
than either end of it: here it froze a job's override at the first pick and the hub selector went dead
after one use. See [overlay.md](./overlay.md) § A2.

**Replacing a whole value to fill part of it.** Invisible until something else is stored alongside,
then it deletes it. See § A group default belongs to a side.

**Adding a map makes a struct uncomparable.** `PricingSide` lost `==` when it gained `Groups`. The
compiler caught it in tests; it would not have in a map key.

**A fixture whose two sides agree proves nothing.** Several tests seeded `buying` and `selling` with
identical values, so a surface asking for the wrong side passed. Give the two sides different values
in every fixture.

**A key list duplicated across two languages.** Nothing connects the two copies until a test does, and
until then a key naming something the other side never had throws only when first reached for. See
[overlay.md](./overlay.md) § B1.

## Stage status

| Stage | State |
|-------|-------|
| Phase 1 — project folder and docs | Done |
| Stage A — retire the single account default | Steps 1-6 landed; step 7 waits on the release |
| Stage B1 — publishing the market group data | Done |
| Stage B2 — the stored shape and the walk | Done |
| Stage B3 — the rung in the ladder | Done |
| Stage B4 — the SPA reading the tree and each item's group | Done; the rung fires |
| Stage B5 — the selling side names a route, and the controls for it | Done |
| Stage B6 — a surface for setting a group default | Tree data published; the SPA work is next |
| Stage N — one vocabulary for a market and a basis | Not started; deliberately deferred |

## Start here

**Stage A is as far as it can go until the shared-planners release runs.** Step 7 — dropping the
single `defaultMarketLocation` / `defaultOrderType` and the job's `localMarketDisplay` /
`localOrderDisplay` — is the only step left, and it waits on that release backfilling the stored
documents (§ Wire compatibility).

What is deliberately still there in the meantime: `Zustand/applicationSettings` carries and persists
the single pair so a stored value survives, and the `Job` constructor reads the job's legacy pair to
seed a job stored before the split. Nothing writes either, and nothing else reads them.

**One rollout note for step 7.** Once a player changes a default, `defaultPricing` moves and the
single pair does not, so the stored pair goes stale rather than wrong. A session still running older
code would read the stale one. That is a deploy-window consideration, not a data question — the
server never overwrites a filled side.

**Stage B's remaining piece is the settings surface** — § Stage B, § The work item 5. Everything
beneath it resolves: an account's group table is walked per material on the Planning stage and on the
shopping list, and a group default outranks the account default while losing to a job's own choice.
What is missing is any way for a player to *set* one, so the table is only ever filled by hand today.

That item waits on § Open decisions: a group table on the selling side has to offer either a basis or
an exit route, and that is not settled. Nothing else blocks it.

Read § Two axes, both called buy and sell before naming anything, and § Traps this work has already
fallen into before changing a stored shape. Both cost a slice each the first time.

The design in this plan was worked out while building the Planning stage panels, which is where the
crossed buying and selling sides first showed. That project records what it handed over at
[planning-stage-panels/plan.md](../planning-stage-panels/plan.md) § Handed to the market pricing
defaults work; this plan is the authority from here.
