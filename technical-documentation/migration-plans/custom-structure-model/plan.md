# Custom structure model — plan

**Status:** Stages A, B, C, BR and D have landed, including the prerelease steps that convert stored
documents, stored rig ids and a saved structure's rig. **Stage E has landed**: a structure is plain data,
`Classes/structure.js` is deleted, and the reader-facing defect that came of a shared mutable row — the
Reprocessing page editing the reader's saved structure — is fixed. Stage BR2 remains and is named here
for what it inherits rather than owned here.

**It is ready to promote**, and the drafts do not exist yet. Stage E was what promotion waited on,
because it changes the same sentence those drafts would write about what the SPA holds; that sentence is
now settled, so writing them describes a shape that is not about to move.

**The gate that used to hold it has cleared.** What held promotion back before Stage E was Stage D
having landed the market kind inside this model's one form: promoting then would have written into live
SoT that a saved market is a custom-structure kind managed from the shared custom-structures form, which
[market-locations](../market-locations/contents.md) was in the middle of removing. That project has
since promoted — a saved market is on its own lane, managed from its own tab, and
`structureKindSelection` no longer offers the kind — which is the order
[market-locations/plan.md](../market-locations/plan.md) § This project unblocks
custom-structure-model, not the other way round set out. So what this project promotes is the four
build kinds it keeps, in whatever shape Stage E leaves them.

**No gap is open in what has landed.** The settings store reads either stored shape; rigs are two
slots everywhere — in the tables, the form, a stored setup, a stored structure, and the prerelease
steps that convert both; and a setup's slots survive being saved, which the model that writes setups
back did not allow until `RigSlot1`/`RigSlot2` replaced `RigID` on `JobSetup` and
`TemplatePresetSetup`.

**Stage BR's structure gap is closed.** Stage BR converted a stored *setup's* `rigID` and left a
stored *structure's* `rigType` unconverted, so a manufacturing or reaction structure saved before the
change read back with no rigs and every bonus it gave silently became zero — measured in
[measurements.md](./measurements.md) § A stored `rigType` read after Stage BR. The prerelease step
`foldStructureRigSlots` now converts them, reusing the same `rigSlotsByStoredID` table the setup fold
uses, and runs after the lane fold whose array shape it reads.

`models.CustomStructure.RigType` stays until that step has run everywhere: it is the last copy of the
data, because `Structure.toDocument()` writes `rigSlot1: 0, rigSlot2: 0` over it on the next save.
Removing a field nothing reads looks like cleanup; this one is the source the conversion reads.

**Stage D has landed.** A reader can save a market: one form asks a structure for the fields its
kind carries, the three per-kind forms are gone, the picker offers every kind, and a market's card
says where it is and what listing there costs. A market is **one kind** rather than two — which sort
it is follows from the place it holds, because `resolveLocationKind` already told them apart and
asking a reader was asking for something known.

What a saved market is **priced** by is not this project's: a station moves to the server in
[market-price-delivery](../market-price-delivery/plan.md) § Stage G, and a citadel waits on the
authenticated walk in that project's Stage E.

**Both of Stage D's faults are closed.** The selling-rates cache is keyed on the location's broker
fee, and a citadel's fee is resolved from the order that names where it was placed rather than from
an account-wide default — so one sale quotes one figure.

**[market-price-delivery](../market-price-delivery/contents.md)'s shelf condition is met.** What it
waited on was a saved location being able to *be* a market, which Stage D landed; its browser-side
remainder resumes from that project's § What to pick up when it does.
**Code in scope:** [`frontend/src/Classes/`](../../../frontend/src/Classes/) —
`structure.js`, `jobSetup.js`, `reprocessingItem.js`;
[`frontend/src/Functions/Helper/`](../../../frontend/src/Functions/Helper/) — `rigSlotBonuses.js`,
`coerceTaxPercentage.js`; [`frontend/src/Context/defaultValues.jsx`](../../../frontend/src/Context/defaultValues.jsx) — the rig tables;
[`frontend/src/Zustand/`](../../../frontend/src/Zustand/) — `applicationSettings/core.js`,
`plannerSettings/core.js`; `frontend/src/Components/Settings/Standard Layout/Custom Structures/`;
`frontend/src/Components/Reprocessing/`;
[`services/shared/models/accountDocuments.go`](../../../services/shared/models/accountDocuments.go),
[`services/shared/models/planner/settings.go`](../../../services/shared/models/planner/settings.go),
[`services/shared/documentschema/documentschema.go`](../../../services/shared/documentschema/documentschema.go),
[`services/core/commands/release_custom_structures.go`](../../../services/core/commands/release_custom_structures.go),
[`services/core/commands/release_rig_slots.go`](../../../services/core/commands/release_rig_slots.go),
[`services/shared/models/job.go`](../../../services/shared/models/job.go) and
[`services/shared/models/group_template.go`](../../../services/shared/models/group_template.go) — a
stored setup's rig slots.

**Added by Stage E:** [`frontend/src/Functions/Structure/`](../../../frontend/src/Functions/Structure/) —
`customStructure.js`, the module `structure.js` becomes, beside the existing `addCustomStructure.js`.

**Added by Stage D:** [`frontend/src/Functions/MarketOrders/`](../../../frontend/src/Functions/MarketOrders/) —
`saleLocations.js`, `sellingRates.js`, `calcSellingCharges.js`;
[`frontend/src/Functions/MarketData/registry/marketSources.js`](../../../frontend/src/Functions/MarketData/registry/marketSources.js);
[`frontend/src/Hooks/React Query/Character/useSellingRates.js`](../../../frontend/src/Hooks/React%20Query/Character/useSellingRates.js).
**Live SoT (until promote):** [frontend/](../../frontend/contents.md), [backend/](../../backend/contents.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the
[frontend](../../frontend/technical-rules.md) and [backend](../../backend/technical-rules.md) pairs
for the code.
Phase 1 (project folder/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages.
Live SoT will not be edited until this project is complete and promotion is approved.

**`go fix` in scope:** clean for `./shared/models/...` and `./shared/documentschema/...` —
[measurements.md](./measurements.md) § `go fix -diff`. Named here so a later scan coming back
non-empty is not mistaken for new debt.

## Why this project exists

A player's custom structures are stored as **four lanes filled by three classes**, and the lane is
already not what decides the shape: manufacturing and reaction are both `CustomStructure`. Every row
carries its own `jobType`, and every id is minted with a per-type prefix — so a row is self-describing
twice over, and the array it was found in tells a reader nothing the row does not already say.

The cost is paid everywhere a structure is handled. A caller that wants "the structures this player
has" assembles four reads. A caller that wants one by id has to know which lane to look in, or search
all four. Adding a kind means a new lane, a new class, a new empty-list seed, a new upgrade step and a
new branch in every screen that lists structures — which is the shape of the next piece of work
already queued: a **sale** structure, handed over by
[planning-stage-panels](../planning-stage-panels/plan.md) § Handed to the custom-structure work as a
fifth lane with a fourth class.

**Seven of the twelve fields are common to all three classes** ([measurements.md](./measurements.md)).
The differences are one rig field against two, a system id, and an implant. That is not four kinds of
thing; it is one kind of thing with optional parts.

### What it is not

It is not a feature. Nothing a player can do changes, and no figure changes. This is the model the
next three pieces of structure work would otherwise each have to widen.

## The shape being built

**One `CustomStructure` class and one stored array**, with `jobType` as the discriminator it already
is. A row carries the fields its kind uses and leaves the rest at their zero values.

```go
type CustomStructure struct {
    ID            string  `bson:"id" json:"id"`
    JobType       int     `bson:"jobType" json:"jobType"`
    Name          string  `bson:"name" json:"name"`
    SystemType    int     `bson:"systemType" json:"systemType"`
    StructureType int     `bson:"structureType" json:"structureType"`
    Tax           float64 `bson:"tax" json:"tax"`
    Default       bool    `bson:"default" json:"default"`

    // Used by the kinds that have them; zero elsewhere.
    RigType  int   `bson:"rigType,omitempty" json:"rigType,omitzero"`
    RigSlot1 int   `bson:"rigSlot1,omitempty" json:"rigSlot1,omitzero"`
    RigSlot2 int   `bson:"rigSlot2,omitempty" json:"rigSlot2,omitzero"`
    Implant  int   `bson:"implant,omitempty" json:"implant,omitzero"`
    SystemID int64 `bson:"systemID,omitempty" json:"systemID,omitzero"`
}

type CustomStructures []CustomStructure
```

**Settled in Stage A:** the bare array, not a wrapper struct — nothing names a field that would sit
beside it, so the nesting would have been paid on every read for a speculative gain.
[overlay.md](./overlay.md) § The shape has the reasoning. The JSON tags above are `omitzero`, not
`omitempty`, because `omitempty` does not omit a zero number; `shared/jsoncodec` has a sweep that
rejects the mistake.

### What must not be lost

- **Reprocessing's own calculations.** `rigBonusFor` and `structureBonusFor` are the only real
  behaviour in the three classes, and they are reprocessing's. They stay, addressed by kind rather
  than by class — a method that answers zero for a kind that has no rig bonus, or a per-kind helper
  beside the class. Folding the shapes must not fold the behaviour into a class that then has to know
  about every kind.
- **The per-kind validation.** Each class settles what it is given: a name is sanitised, a tax or a
  system id that is not a number falls back. `InventionStructure` is the exception — it takes `tax`
  raw where the other two run it through `coerceFiniteNumber`. That is a bug this project inherits
  rather than one it creates; folding the classes is what makes it visible, and the fold is where it
  gets fixed.
- **The id prefixes.** `manStruct-`, `reacStruct-`, `reprocessingStruct-`, `inventionStruct-` are
  minted into every id. They are not this project's to change: stored ids are referenced from job
  setups, and rewriting them is a data migration with nothing to gain.

## What this leaves easy

A **sale** structure becomes a `jobType` value and the fields it needs, rather than a fifth lane, a
fourth class, another empty seed and another branch. That is the piece
[planning-stage-panels](../planning-stage-panels/plan.md) handed over and the one
[market-price-delivery](../market-price-delivery/plan.md) § Stage F waits on — see § Who owns what,
below.

## Wire compatibility

| Surface | Change | Note |
|---------|--------|------|
| `ApplicationSettings.customStructures` | **Migrate-required** | Four lanes become one array, folded **at decode** by `CustomStructures.UnmarshalBSON` rather than by a version-gated step — the upgrader stamps an unversioned document current before any version test could fire. **No schema version moves:** reading accepts either shape, so the stored documents are converted by a prerelease step, `fold custom structures into one array` |
| Planner settings `customStructures` | **Migrate-required** | Same embedded type, so the same decode-time fold and the same prerelease step serve it. `SettingsSchemaCurrent` is unchanged |
| SPA ↔ API JSON | **Breaking, shipped together** | The settings payload carries the same field, so the SPA and the API must agree; they deploy together and there is no third consumer |
| Stored job setups | **No change** | A setup references a structure by id, and ids are not rewritten |

**The upgrade is in-memory and idempotent**, like every step in `documentschema`. Rows are folded as
documents are read; nothing rewrites the collection ahead of time, so a rollback reads the stored
lanes again and is harmless until a document is written back in the new shape.

## Phases

**Phase 1 — project folder and docs.** This file, [contents.md](./contents.md),
[overlay.md](./overlay.md), [measurements.md](./measurements.md), and the row in the section
[contents.md](../contents.md). Done.

**Stage A — One shape, server side. Done.** The Go type, the folded `CustomStructures`, the planner
settings clone, and the prerelease step that converts the stored documents, with live-Mongo coverage
of both the fold and the conversion. The fold landed at **decode** rather than as a `documentschema`
step, and the persistence as a release step rather than a schema bump — [overlay.md](./overlay.md)
§ The fold, and the conversion that persists it.

**Stage B — One class, SPA side. Done.** The three classes became one and are **deleted**:
`customStructure.js`, `reprocessingStructure.js` and `inventionStructure.js` are gone, with every
caller on `Classes/structure.js`. Reprocessing's calculations kept their home,
`InventionStructure`'s unvalidated `tax` was fixed as the fold happened, and both settings store
slices hold one array — [overlay.md](./overlay.md) § Stage B.

**Stage C — The surfaces. Done.** The settings list, the structure picker and the login path's system
index prefetch read one array filtered by kind. All three had gone silently empty when the store
became an array, so they landed with Stage B rather than after it —
[overlay.md](./overlay.md) § Stage C.

**Stage BR — Rigs are slots on every kind. Done.** Manufacturing and reaction held one combined `rigType`
where the other two kinds hold two slots, though invention's rigs carry two independent axes exactly
as manufacturing's do. The atomic rig tables, the per-axis combining rule in
`Functions/Helper/rigSlotBonuses.js`, `fieldsByJobType` losing `rigType`, and the prerelease step
converting stored setups across all four collections — [overlay.md](./overlay.md) § Rigs became slots
on every kind, § The prerelease step that converts stored setups.

**Done.** The form renders two slot pickers, a setup stores two slots, the time modifiers take a
bonus rather than a rig id, and a requirement fills the first slot and clears the second. Nothing
reads `rigType` or a single `setup.rigID` — [overlay.md](./overlay.md) § The surfaces that write a
rig.

**Wire:** additive for the stored setup — `rigSlot1`/`rigSlot2` are written beside a `rigID` that the
prerelease step removes — and **breaking for the SPA**, which deploys with it.

**Stage BR2 — A rig knows what it applies to.** A real manufacturing rig helps one family of items —
ships, modules, drones — the way a reprocessing rig helps one kind of ore. Every converted rig carries
`appliesToAll` because the stored data never recorded which family it helped, and `rigSlotBonuses`
counts only flagged rigs, so an item-specific rig cannot silently apply to everything.

This stage gives manufacturing an item-family vocabulary — there is no counterpart to
`reprocessingItemTypes` — teaches the rig tables to name families, and reads a rig against what is
being built. **It is not this project's to schedule**: the model here makes it expressible and no
more.

Two things it inherits and must handle: readers have been told by the form's own help text to create
**a second custom structure** for items a rig does not cover, so real structures exist that were
built as a workaround for the missing support; and a reader who fitted a generic rig means "I do not
know which", not "it applies to everything".

**Stage D — The kind that is a market. Done.** A saved location can be a market rather than only a
selling point priced from a hub: the `jobType` value, the fields it needs, and the surface for saving
one. This is the stage [market-price-delivery](../market-price-delivery/contents.md) was shelved on,
and the first kind added under the new model rather than the last added under the old — which is what
makes it a proof of the model as well as a feature.

What it must produce for that project: a source whose kind says it is browser-fetched, carrying the
structure id its orders are walked by, reaching `allMarketSources()` through
`Functions/MarketOrders/saleLocations.js` — the placeholder accessor it already reads. What it must
**not** decide is how that market is fetched, priced or kept current; all three are
[market-price-delivery](../market-price-delivery/plan.md) § Stage E.

**There is one kind, and the place it holds says the rest.** An NPC station and a player citadel are
two sorts of one thing — both places a price is asked for, both named from the same location picker —
and `resolveLocationKind` already told them apart by the range an EVE location id falls in, before the
picker asked. So the picker offers **Market**, and which sort a row is follows from the id it carries.
The differences below are read from the row rather than chosen by a reader; a stage draft asked for
them as two kinds, and [overlay.md](./overlay.md) § One market kind, and what the place it holds decides has why
that changed.

| | Holding a `stationID` | Holding a `structureID` |
|---|---|---|
| What it is | an NPC station | a player citadel |
| Broker fee | derived from the seller — **not stored** | `brokerFee`, the rate the owner set |
| What the fee derives from | `raceID`, `ownerID` | — |
| Reading its orders | public | a character with docking access, found by trying |

Both carry `regionID`, and both carry the `id`, `name` and `default` every kind has.

**A station stores what its fee is derived from, not the fee.** The race that built it names the
faction a standing is held against, and the owner is the corporation holding the other — the only two
station fields the rate reads. Both are fixed for the life of the station, and `getStationData` is a
bare fetch with no caching, so every quote was a round trip for two numbers that never change. The
row carries them instead. That is not the same as storing the fee: the rate is still derived per
seller, from their skills and standings.

**The fee asymmetry is load-bearing.** A broker fee at an NPC station is derived from the seller
character's skills and standings, and is already quoted per job against a separately chosen seller.
Storing a fee on a station row would let a saved number stand in for that derivation and silently
quote the untrained base rate — live docs [frontend/](../../frontend/contents.md) § selling rates.
A citadel's fee is the opposite: its owner sets it, nothing can derive it, so it is stored.

**Why a region, on both kinds.** Price history is region-scoped — ESI publishes no per-station or
per-structure history — and an order book is read per region and *then* filtered to the location.
A saved location is reachable from the Returns panel header, so it must be able to open its own
history and market data.

**Neither market kind carries a system.** An order book is read per region and narrowed to the
location, so nothing prices a market by its system; a system is what an installation cost is derived
from, and a market has none. Neither kind appears in `jobTypeMapping` for the same reason.

**The character hash is stored here and used later.** Market reads in the SPA are public and
unauthenticated today, and no `/markets/structures/` call exists. The field is what
[market-price-delivery](../market-price-delivery/plan.md) § Stage E needs in order to build the
fetch, so it is stored by this stage and read by that one. A hash that no longer resolves — the
character unlinked, or docking access lost — must read as *this market cannot be queried* and be
re-choosable, never as a market with no orders.

**Two faults in scope, both silent.** Neither is caused by this stage; both are reached by it, and
both produce a wrong figure rather than an error:

- `Hooks/React Query/Character/useSellingRates.js` keys its cache on the location's kind, id and fee
  station, **not on `brokerFee`**. Harmless while the rows are placeholders and nothing can edit
  them; the moment a reader can change a saved citadel's rate, changing it serves the old one.
- `Functions/MarketOrders/calcSellingCharges.js` takes a citadel's fee from the account-wide
  `defaultCitadelBrokersFee` while the Planning stage quotes the per-location rate, so one job shows
  two different fees. Ending that split is what this stage is for.

**The settings surface is one form, not a fifth branch.** Three forms describe the four build kinds
today — `structureSelection`, `inventionStructureSelection`, `reprocessingStructureSelection` — and
they differ by **one field each**: manufacturing and reaction add a system, reprocessing adds an
implant, invention adds nothing. Around 800 lines of otherwise identical wiring, and adding a market
would make it four forms and a fourth branch in `CustomStructuresForm`.

One form replaces them, rendering a field when the kind carries it and reading the **same
`fieldsByJobType` the class already uses**. That makes the model's promise true of the surface too:
adding a kind is an entry in one map, not another form. Every field already has a shared component —
`StructureTypeSelect`, `SystemTypeSelect`, `RigTypeSelect`, `ImplantSelect`,
`VirtualisedSystemSearch` — so this is wiring to delete, not widgets to build.

**Every field has a component already.** `StructureTypeSelect`, `SystemTypeSelect`, `RigTypeSelect`,
`ImplantSelect`, `VirtualisedSystemSearch`, `TaxPercentageTextField` and `FormField` are what the
three forms already compose. Nothing new is needed for a citadel.

**A region is derived, not chosen.** ESI answers the chain: `/universe/stations/{id}` gives a
`system_id`, `/universe/systems/{id}` gives a `constellation_id`, and
`/universe/constellations/{id}` gives a `region_id` — verified against Jita, where station 60003760
resolves to region 10000002. Both new calls are public and follow the existing `getStationData`
shape in `Functions/EveESI/World/`.

So the form asks for a station and derives everything else. That is better than a region picker
rather than merely cheaper: a reader knows their station and may not know its region, and a
mismatched pair would be a saved market that prices nothing. It is one fewer field, and one that
cannot be wrong.

**A reader names a place from their own assets, not from the galaxy.** `useAssetLocations` already
answers the named places an account's assets sit at, and `VirtualisedLocationSearch` already offers
them — the same pair this settings page uses for the default asset location. `locationOptions`
applies no kind filter, so stations and citadels both come through, which is what the two market
kinds need between them.

That is the right list rather than only the available one: a market a reader sells at is somewhere
they keep things, and a search over every station in New Eden would offer thousands of places they
have never docked at. `POST /universe/ids/` was the alternative and is ruled out — it wants the exact
in-game string and returns nothing for a near miss, which is not a reasonable thing to ask anyone to
type.

So **no new picker is needed for either kind**, and neither waits on the other.

The kind picker keeps its one row and grows to six, so a reader sees every kind in one place. Its
heading stops asking for a job type, which a market is not.

**Done when** a reader can save either sort of place through that form, a price can be asked for at
one, the two faults above are closed, and the placeholder rows in `saleLocations.js` are gone. **All
four hold.**

**Stage E — A structure is plain data. Done.** `Classes/structure.js` is deleted and its work is four
functions in `Functions/Structure/customStructure.js`, with reprocessing's two calculations in
`Functions/Reprocessing/structureBonuses.js` — [overlay.md](./overlay.md) § Stage E, which also records
what was deleted rather than converted and the one duplicated rule left in the area.

The model landed as one shape and one array, and
`Classes/structure.js` is the last part of it still holding a row as a class instance with setters. The
store holds instances, the screens that edit one mutate it and re-wrap it to force a render, and the
write path re-wraps a row it already holds because it cannot assume what the store carries. One
reader-facing defect follows directly from that, and is the reason this stage is worth its own slice
rather than being left as tidying — § The defect this closes.

**This is not a sweep against classes.** [job-document-drafts](../job-document-drafts/plan.md) converted
`Job` because `jobArray` held instances app-wide, which is what stopped an inbound delta being applied to
the store, and that plan is explicit that row classes are the last to go and may not need to: they are
cheap and read only their own fields. `Structure` fails that exemption on one specific count — it is
**held in the store and edited by two screens**, so a mutable row is shared between them.

**The module**, in `Functions/Structure/customStructure.js`, mirroring `jobDocument.js`'s shape rather
than inventing a second convention:

| Function | Replaces |
|---|---|
| `structureFromDocument(row, jobType)` | the constructor — settles the tax and the system id, and drops the fields the kind does not carry |
| `fieldsForKind(jobType)` | the `fields` getter, which is one lookup in `fieldsByJobType` |
| `toDocument(structure)` | `toDocument()` |
| `updateStructure(structure, changes)` | all nine setters |

Reprocessing's two calculations become selectors taking the row — `rigBonusFor(structure, itemType)` and
`structureBonusFor(structure, itemType)` — which is the move that turned `rules.buyCost` into
`(material, requirement)`. They stay reprocessing's, as § What must not be lost has required since
Stage B.

**Two things the drafting of this stage got wrong, corrected as it landed.** A `blankStructure` in the
module would have had to serve both the form's seeded blank — first entry in each picker — and the
Reprocessing page's bare one, which is zeros; unifying them would have moved a figure, so the form keeps
its own and builds it through `structureFromDocument`. And a `rigBonusesFor` would have had no caller:
nothing in production read the `rigBonuses` getter, the two surfaces wanting a rig's bonuses calling
`rigSlotBonuses` with a setup's ids instead. It is deleted rather than converted — [overlay.md](./overlay.md)
§ Stage E.

**How an edit is expressed, chosen rather than assumed.** A call site could spread —
`{ ...structure, tax: coerceTaxPercentage(value) }` — or go through `updateStructure`, which settles
whatever it is handed. `updateStructure` is the choice: with spreads, the knowledge that a name is
sanitised and a tax is clamped moves out to every call site, and the structure form alone has twelve.
`structureFromDocument` is the backstop for the two numbers either way, so a call site that forgets
cannot get an unsettled tax or system id into storage.

**A name has no backstop today, and the stage decides whether to give it one.** The constructor only
defaults `name` to an empty string; the sanitising is in `setName`, so it happens where a name is written
and nowhere else. Carrying that across unchanged means `updateStructure` sanitises and
`structureFromDocument` does not, which is today's behaviour exactly. Sanitising on read as well would be
a hardening — nothing on the server sanitises a stored name — but it is a behaviour change on stored
data, and this stage is otherwise one that moves no figure and changes nothing a reader sees. Taken
as: **match today's behaviour in the conversion**, and if reading should sanitise too, that is its own
change with its own reasoning rather than a silent rider on a refactor.

### The defect this closes

The Reprocessing page edits the reader's **saved** default reprocessing structure rather than a copy of
it, because it seeds itself with the row out of the settings store and the panel then mutates what it was
given. The chain, its two consequences and why the dropdown path is safe are measured in
[measurements.md](./measurements.md) § The reprocessing page edits the saved structure.

**The one-line copy at the seed has landed, ahead of the conversion.** It was a defect with a live
consequence and should not have waited on a refactor, and it leaves the conversion free to be a change
that moves no figure and fixes nothing — the shape a refactor should have. `useReprocessingReducer` seeds
from a copy, with `useReprocessingReducer.test.js` covering the copy, the saved row surviving an edit, and
the blank fallback; two of its three cases fail against the previous seed. See
[overlay.md](./overlay.md) § The Reprocessing page holds its own copy of the structure it opens with.

The milder variant the measurement records in `addCustomStructure` is closed by the conversion rather than
ahead of it: nothing a reader sees depends on it.

**What regular use looks like afterwards: the same.** A name is sanitised on the keystroke it is today, a
tax still settles on blur through `coerceTaxPercentage`, the rig-conflict rule still clears the slot it
refuses and marks it, a structure-type or system preset still fills the fields it decides, and a system
that refuses a kind still refuses it. Render counts do not move either — `settled()` already builds a
fresh instance on every edit. The only behaviour that changes is the defect above.

**Wire:** none. No stored shape moves, `toDocument`'s output is unchanged, and nothing crosses a process
boundary. This is SPA-internal.

**Done when** nothing constructs `Structure`, `Classes/structure.js` is deleted rather than left as a
wrapper, the two mutating screens and the three store actions work on copies, the seed defect is fixed,
and `Functions/Structure/addCustomStructure.js` reads `fieldsForKind` instead of a defensive
`structure.fields?.systemID`. The surface inventory it is measured against is
[measurements.md](./measurements.md) § What holds a structure as an instance.

**Also in scope, found in the same path:** `addCustomStructure` and the structure form both call
`showSnackbarSuccess`, so adding a structure toasts twice. One of the two goes.

**Done when** Stages A to E are, adding a kind of structure is a `jobType` value plus the fields it
needs, a structure is a row and a set of functions rather than a class, and market-price-delivery can
come off the shelf. **Stage BR2 is named here for its inheritance, not owned here** — this project closes
without it.

## Who owns what

This project owns **the model**: one shape, one array, and the upgrade that gets there. It does not
own what a structure is *for*.

- **Pricing against a saved market** — whether a citadel can be a market source, what the browser
  fetches from it, what `priceHub` means once a structure can be priced directly — is
  [market-price-delivery](../market-price-delivery/contents.md). That project has reached its
  boundary waiting on a saved location being able to *be* a market, which is a `jobType` this model
  makes expressible; the pricing behind it stays there.
- **What a sale costs** — broker fees, sales tax, the rate a structure's owner set — is
  [planning-stage-panels](../planning-stage-panels/contents.md), which handed over the
  `SaleStructure` shape as a proposal and is explicit that it is not bound by it.
- **The settings screens' look** is already landed: one card body serves every kind.

**Settled by the shelving.** The sale kind — a saved location that is a market rather than a selling
point priced from a hub — lands **inside this project**.
[market-price-delivery](../market-price-delivery/contents.md) was shelved until it existed, and that
project was the only other place it could have gone, so leaving it out would shelve a project against
work nobody had scheduled. It is also the cheapest way to prove the model: a kind added under the new
shape, rather than a fifth lane and a fourth class under the old one.

What that kind *means* still belongs elsewhere — pricing against it is market-price-delivery, what a
sale costs is planning-stage-panels. This project makes it expressible and no more.
