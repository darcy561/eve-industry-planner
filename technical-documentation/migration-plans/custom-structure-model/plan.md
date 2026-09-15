# Custom structure model — plan

**Status:** Phase 1 complete. No product work started, no open decisions.
**[market-price-delivery](../market-price-delivery/contents.md) is shelved waiting on this project**
— specifically on a saved location being able to be a market, which Stage A makes expressible.
**Code in scope:** [`frontend/src/Classes/`](../../../frontend/src/Classes/) —
`customStructure.js`, `reprocessingStructure.js`, `inventionStructure.js`;
[`frontend/src/Zustand/`](../../../frontend/src/Zustand/) — `applicationSettings/core.js`,
`plannerSettings/core.js`; `frontend/src/Components/Settings/Standard Layout/Custom Structures/`;
`frontend/src/Components/Reprocessing/`;
[`services/shared/models/accountDocuments.go`](../../../services/shared/models/accountDocuments.go),
[`services/shared/models/planner/settings.go`](../../../services/shared/models/planner/settings.go),
[`services/shared/documentschema/documentschema.go`](../../../services/shared/documentschema/documentschema.go).
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
    StructureType int     `bson:"structureType" json:"structureType"`
    SystemType    int     `bson:"systemType" json:"systemType"`
    Tax           float64 `bson:"tax" json:"tax"`
    Default       bool    `bson:"default" json:"default"`

    // Used by the kinds that have them; zero elsewhere.
    RigType  int   `bson:"rigType,omitempty" json:"rigType,omitempty"`
    RigSlot1 int   `bson:"rigSlot1,omitempty" json:"rigSlot1,omitempty"`
    RigSlot2 int   `bson:"rigSlot2,omitempty" json:"rigSlot2,omitempty"`
    Implant  int   `bson:"implant,omitempty" json:"implant,omitempty"`
    SystemID int64 `bson:"systemID,omitempty" json:"systemID,omitempty"`
}

type CustomStructures struct {
    Structures []CustomStructure `bson:"structures" json:"structures"`
}
```

**Open for the implementing slice, not for this plan:** whether `CustomStructures` keeps a wrapper
struct at all or the settings document holds the array directly. The wrapper costs a level of nesting
and buys a place to hang later fields; the array is plainer. Decide it when the first slice is
written, and record which in the overlay.

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
| `ApplicationSettings.customStructures` | **Migrate-required** | Four lanes become one array. Bump `ApplicationSettingsSchemaCurrent` to 2 and add a v1→v2 step folding the lanes, stamping each row's `jobType` from the lane it came out of where a legacy row lacks one. The v0→v1 step that seeds `Invention` is the worked precedent |
| Planner settings `customStructures` | **Migrate-required** | Same embedded type, its own `SettingsSchemaCurrent`, and its own clone in `models/planner/settings.go`. Both documents move together or the shared type cannot change |
| SPA ↔ API JSON | **Breaking, shipped together** | The settings payload carries the same field, so the SPA and the API must agree; they deploy together and there is no third consumer |
| Stored job setups | **No change** | A setup references a structure by id, and ids are not rewritten |

**The upgrade is in-memory and idempotent**, like every step in `documentschema`. Rows are folded as
documents are read; nothing rewrites the collection ahead of time, so a rollback reads the stored
lanes again and is harmless until a document is written back in the new shape.

## Phases

**Phase 1 — project folder and docs.** This file, [contents.md](./contents.md),
[overlay.md](./overlay.md), [measurements.md](./measurements.md), and the row in the section
[contents.md](../contents.md). Done.

**Stage A — One shape, server side.** The Go type, the folded `CustomStructures`, the schema bump and
the v1→v2 step for both documents, and the planner settings clone. Live-Mongo parity coverage of the
upgrade, since the fold is the part that can lose a row.
**Done when** a document stored in either shape reads back as one array with every row carrying its
`jobType`, and the step is idempotent under a second read.

**Stage B — One class, SPA side.** The three classes become one, reprocessing's calculations keep
their home, and `InventionStructure`'s unvalidated `tax` is fixed as the fold happens. The store
slices hold one array.
**Done when** nothing in `frontend/src` imports a per-kind structure class, and the settings and
reprocessing screens read the same array.

**Stage C — The surfaces.** The settings screens and the reprocessing panel list from one array
filtered by kind, rather than from four lanes. Most of this landed already as UI:
[accounts-page](../accounts-page/contents.md) made one card body serve every kind, so what is left is
what feeds it.
**Done when** no screen names a lane.

**Stage D — The kind that is a market.** A saved location that can be a market rather than only a
selling point priced from a hub: the `jobType` value, the fields it needs, and the surface for saving
one. This is the stage
[market-price-delivery](../market-price-delivery/contents.md) is shelved on, and the first kind added
under the new model rather than the last added under the old — which is what makes it a proof of the
model as well as a feature.

What it must produce for that project: a source whose kind says it is browser-fetched, carrying the
structure id its book is walked by, reaching `allMarketSources()` through
`Functions/MarketOrders/saleLocations.js` — the placeholder accessor it already reads. What it must
**not** decide is how that market is fetched, priced or kept current; all three are
[market-price-delivery](../market-price-delivery/plan.md) § Stage E.
**Done when** a reader can save a location that a price can be asked for at, and the placeholder rows
in `saleLocations.js` are gone.

**Done when** all four stages are, adding a kind of structure is a `jobType` value plus the fields it
needs, and market-price-delivery can come off the shelf.

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
- **The settings screens' look** is [accounts-page](../accounts-page/contents.md), already landed.

**Settled by the shelving.** The sale kind — a saved location that is a market rather than a selling
point priced from a hub — lands **inside this project**.
[market-price-delivery](../market-price-delivery/contents.md) is shelved until it exists, and that
project is the only other place it could have gone, so leaving it out would shelve a project against
work nobody had scheduled. It is also the cheapest way to prove the model: a kind added under the new
shape, rather than a fifth lane and a fourth class under the old one.

What that kind *means* still belongs elsewhere — pricing against it is market-price-delivery, what a
sale costs is planning-stage-panels. This project makes it expressible and no more.
