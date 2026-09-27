# Custom structure model — plan

**Status:** Every stage this project owns has landed — A, B, C, BR, D and E — with what each one
changed in [overlay.md](./overlay.md) and § Phases below. Stages BR2 and BR3 remain, named here for what
they inherit rather than owned here; this project closes without them.

**It is ready to promote**, and the drafts do not exist yet. Stage E was what promotion waited on,
because it settles the sentence those drafts have to write about what the SPA holds a structure as.
Before that it waited on [market-locations](../market-locations/contents.md), which has since promoted a
saved market onto its own lane — the order [market-locations/plan.md](../market-locations/plan.md)
§ This project unblocks custom-structure-model, not the other way round set out. So what promotes is the
four build kinds this project keeps.

**One thing must survive promotion as a live constraint.** `models.CustomStructure.RigType` cannot be
removed until the prerelease step `foldStructureRigSlots` has run everywhere: it is the last copy of that
data, because a structure's document is written with `rigSlot1: 0, rigSlot2: 0` over it on the next save.
Removing a field nothing reads looks like cleanup; this one is the source the conversion reads.

**Code in scope:** [`frontend/src/Functions/Custom Structures/`](../../../frontend/src/Functions/Custom%20Structures/) —
every module about a custom structure, gathered there by Stage E: `customStructure.js`,
`addCustomStructure.js`, `customStructuresFromServer.js`, `customStructureSetup.js`,
`getStructureInfo.js` and `rigs.js`;
[`frontend/src/Functions/Helper/coerceTaxPercentage.js`](../../../frontend/src/Functions/Helper/coerceTaxPercentage.js);
[`frontend/src/Classes/`](../../../frontend/src/Classes/) — `jobSetup.js`, `reprocessingItem.js`;
[`frontend/src/Hooks/useRigSlots.js`](../../../frontend/src/Hooks/useRigSlots.js);
[`frontend/src/Context/defaultValues.jsx`](../../../frontend/src/Context/defaultValues.jsx) — the rig tables;
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
`Functions/Custom Structures/rigSlotBonuses.js`, `fieldsByJobType` losing `rigType`, and the prerelease step
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

**Stage BR3 — A requirement belongs to the thing it describes.** `requirementID` points into a flat
table of three entries and hangs off four different kinds of thing — a structure, a rig, a system type,
and a system id through `systemStructureRequirements`. Those three entries do three unrelated jobs: two
are legality constraints (The Fulcrum takes no rigs and sits in one system; an NPC station takes no
rigs), and one is per-rig security data — rig 9's `alternativeSystemValue`, which ESI publishes as dogma
attributes 2355/2356/2357 on type 45641.

Two execution models read that table. `applyRequirements` writes the requirement's fields onto the
stored setup at selection time and persists `appliedRequirementID`; `gatherRequirements` is meant to
re-derive them at calculation time, letting the structure, the rig and the system each contribute. The
first **persists game-derived facts**, which
[planning-stage-panels/plan.md](../planning-stage-panels/plan.md) § What is stored, and where forbids —
game constants live in the SPA, the player's choices live in the document. The second **does not work at
all**: the rig axis is dead, so rig 9's security data reaches no calculation today —
[job-document-drafts/plan.md](../job-document-drafts/plan.md) § A defect this found, which the cutover
does not fix has why.

And the rule is written twice: `Setup` holds one implementation and the Custom Structures
`structureForm.jsx` holds its own `applyRequirements` beside it, while `virtualisedSystemSearch.jsx`
reads the second table to decide which systems to offer.

What would replace it:

- **Security multipliers onto the rig row**, as a `security: { 0, 1, 2 }` map matching ESI's
  `hiSecModifier` / `lowSecModifier` / `nullSecModifier`. `getSystemData` then reads the rig before the
  system type, requirement 1 disappears, and the lookup that is missing has nothing left to find.
  Carried **per axis** with `rigSlotBonuses`' winner, because each rig has its own modifier and one
  figure for the whole setup is not what the game does.
- **Constraints as one declared list** keyed on what a reader picks — `{ label, when, forces }` —
  evaluated by a read-time selector rather than written onto the setup. One entry point instead of four,
  nothing game-derived stored, and the same declaration locks the fields it forces so an illegal
  combination is unreachable; today nothing stops a reader choosing The Fulcrum and then changing the
  system.
- **`systemStructureRequirements` derived** as the reverse index of that list rather than kept as a
  second table, which is what removes the duplicate implementation in the settings form and the picker.
- **`appliedRequirementID` removed** from the stored shape in both languages — it is written, persisted
  and read by nothing.
- **`manSystem` back to three security buckets.** Entry 3 "Zarzakh" conflates one system with a
  security class. What the axis needs is the three buckets ESI names; Zarzakh's specialness is a
  legality rule and belongs in the constraint list with the rest.

**Wire:** the constraint list and the rig `security` maps are SPA-only. `appliedRequirementID` is a
stored-shape removal and needs a prerelease step. **Stored `materialCount` moves**, because making rig
9's multiplier reachable changes the material quantity a saved setup already holds — which is the gate
that kept the defect from being taken during the job cutover. Recalculating is a `prepareRelease` step
over stored setups, not an upgrader.

**Not scheduled here, and it inherits three open questions.** Whether Zarzakh's rig multiplier is really
1 rather than null sec's figure; whether EVE applies a security modifier per rig or one per structure,
which the shape above assumes is per rig; and the two `taxValue: 0.25` entries, which could not be
verified because ESI does not publish them.

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

**A station stores what its fee is derived from, not the fee** — its race and its owner, the two fields
the rate reads, both fixed for the station's life. [overlay.md](./overlay.md) § A sale location is an NPC
station or a citadel has what that saved and why it is not the same as storing a rate.

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

**Stage E — A structure is plain data. Done.** `Classes/structure.js` is deleted and its work is
functions in `Functions/Custom Structures/customStructure.js`, with reprocessing's two calculations in
`Functions/Reprocessing/structureBonuses.js`. What each caller does instead, what was deleted rather
than converted, and what a reader sees is [overlay.md](./overlay.md) § Stage E.

Why the stage existed: the model had landed as one shape and one array, and the class was the last part
of it still holding a row as a mutable instance. The store held instances, the screens that edited one
mutated it and re-wrapped it to force a render, and the write path re-wrapped a row it already held
because it could not assume what the store carried. The Reprocessing page editing a reader's **saved**
structure followed directly from that, which is why this was a slice rather than tidying — the chain is
in [measurements.md](./measurements.md) § The reprocessing page edits the saved structure, and the fix
landed ahead of the conversion so that the conversion itself moved no figure.

**This was not a sweep against classes.** [job-document-drafts](../job-document-drafts/plan.md)
converted `Job` because `jobArray` held instances app-wide, which stopped an inbound delta being applied
to the store, and that plan is explicit that row classes are the last to go and may not need to.
`Structure` failed that exemption on one count — it was **held in the store and edited by two screens**,
so a mutable row was shared between them.

**Three decisions taken as it landed.**

- **An edit goes through `updateStructure`, not a spread.** With spreads, the knowledge that a name is
  sanitised and a tax is clamped moves out to every call site, and the structure form alone has twelve.
  `structureFromDocument` is the backstop for the two numbers either way.
- **A name's sanitising stays where it is written.** The class only sanitised in `setName`, so reading
  does not sanitise and still does not. Sanitising on read would be a hardening — nothing on the server
  sanitises a stored name — but it changes stored data, and this stage was one that moved no figure.
  That is its own change with its own reasoning.
- **Two things the drafting got wrong.** A shared `blankStructure` would have had to serve both the
  form's seeded blank and the Reprocessing page's bare one, which is zeros, so unifying them would have
  moved a figure; the form keeps its own. And a `rigBonusesFor` would have had no caller, nothing in
  production reading the old `rigBonuses` getter, so it is deleted rather than converted.

**Wire:** none. No stored shape moved and nothing crosses a process boundary; this was SPA-internal.

**Done when**, and all hold: nothing constructs `Structure`, the class is deleted rather than left as a
wrapper, the mutating screens and the store actions work on copies, the seed defect is fixed, and
`addCustomStructure` reads `fieldsForKind` instead of a defensive `structure.fields?.systemID`. Measured
against [measurements.md](./measurements.md) § What holds a structure as an instance.

**The project is done when** Stages A to E are, adding a kind of structure is a `jobType` value plus the
fields it needs, a structure is a row and a set of functions rather than a class, and
market-price-delivery can come off the shelf. All hold; what is left is promotion.

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
