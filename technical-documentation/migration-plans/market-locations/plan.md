# Market locations — plan

**Status: Phase 1.** The project folder and its docs exist; no product work has started. Phase 1 is
the gate, and § What this waits on carries the one remaining condition — a release already carrying a
prerelease migration. This project is what unblocks custom-structure-model's promotion rather than
waiting on it: see § This project unblocks custom-structure-model, not the other way round.

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

**`go fix` in scope:** clean for `./shared/models/...`, `./api/v1endpoints/...` and
`./core/commands/...` on every file this project would touch. The one suggestion the scan reports is
in `shared/models/job_test.go`, which this project does not touch and which is left alone
deliberately — named here so a later scan coming back non-empty is not mistaken for new debt.

## Why this exists

A saved market is stored as a custom structure, and it is not one. The row lives in the
`customStructures` array, its kind is held in a field called `jobType`, and which fields it carries
are decided by a table shared with the four kinds of place a job is performed in. The class itself
says so: `jobType` keeps that name "because every kind was once a job; the market kinds are not, and
the stored field keeps its name rather than migrating every document".

That was a reasonable place to put a market when a market was a selling point priced from a hub. It
is no longer one. A market is read, priced, rotated and can fail to be read at all — and none of
that has anywhere to live in a form whose shape is a field table.

**What makes it worth doing now rather than later** is the surface.
[market-price-delivery](../market-price-delivery/contents.md) finished a path where a saved market
can be unreadable for reasons a reader can fix — no linked character can dock there, or the one that
could has left the corporation that could. Today that surfaces as figures quietly not arriving.
Telling them needs a place to say it, and the custom-structures form has none: it renders fields from
a kind table, not state from a market.

## Why a market leaves a model that was right to unify

[custom-structure-model](../custom-structure-model/contents.md) folded four lanes and three classes
into one class and one array, on the finding that the four kinds differed in almost nothing. **That
reasoning is not disturbed by a market leaving, because the market was never part of it.** The four
build kinds share a security modifier, a structure type carrying bonuses, an installation tax and two
rig slots. A market has none of those four things and carries a region, a place, an owner's rate and
the fee inputs an NPC station's rate is derived from — a disjoint set, conditional on a kind, in a
table built for kinds that overlap.

So this is a deliberate reversal of *where a market row lives*, not of that project's conclusion. It
is named here so a future reader meets it as a decision rather than as drift.

## The shape being built

**Settled: a market is owned, and a reader's set is their own plus what is shared with them.** An
account keeps its own markets. A market saved for a corporation or an alliance can be **shared** with
everybody in it, so a group's members do not each add the same citadel by hand.

**Sharing is ticked, not assumed.** A market saved for an organisation is internal to it until
somebody sets `sharedWithMembers` on that row. Saving a market and handing it to everyone in the
corporation are two acts, and a market that reached every member the moment it was saved would make
the second one invisible. Whoever manages that organisation's markets ticks it, once per market — a
member neither opts in nor can decline, which keeps an account's document free of a list of what it
has accepted, and keeps a market added later reaching people without each of them acting.

- **Its own lane** on the settings document, beside `customStructures` rather than inside it, and
  **the scope it needs already exists**. `PlannerSettings` is one document per planner keyed by the
  owner, `LoadPlannerSettings` takes any `Owner`, and a planner may be owned by a corporation or an
  alliance as readily as by an account — `planners/create.go` builds all of them, and
  `Owner.AdmitsByInvite` records that a corporation or alliance planner's roster follows the entity
  itself rather than an invite list. So a corporation's markets are the market lane on that
  corporation's planner settings, and membership is the grants a reader already holds. No new
  document, no new owner kind.
- **An inherited market is read like one the reader saved**: on their own token, on their own
  rotation. A corporation with a dozen markets costs every member a dozen walks an hour — affordable
  because the structure endpoint draws on its own ESI allowance, and stated here rather than
  discovered. It also means a member who cannot dock at an inherited citadel is refused where a
  colleague is not, which is what Stage D has to say out loud.
- **Inheritance is live, not a copy**, and nothing exists today to mistake it for. A planner takes a
  seed only through `PlannerWrite.SeedSettingsFrom`, which is set in one place —
  `EnsureAccountPlanner`, where a planner clones the account that *is* it. The endpoint that builds
  corporation and alliance planners passes no seed, so those start on `planner.DefaultSettings`. A
  copy would be the wrong mechanism regardless: a market added to a corporation afterwards has to
  reach its members, and one removed has to leave. The reader's set is composed at read time.
- **No `jobType`.** What a row is follows from the place it names, as it already does: a station id
  or a structure id, never both. `structureKinds.market` and `customStructureLocationMap`'s market
  entry go with it.
- **The fields a market has**: a name, a region, the place, the owner's rate at a citadel, and the
  race and corporation an NPC station's fee is derived from.
- **Ids are not rewritten.** A job setup referencing a market by id keeps working, which is what
  makes this a move rather than a rebuild.

### The server composes the union, and a change arrives over the socket

**Settled: the union is resolved server-side, from what the account may access.** The server already
reads the documents and already knows the reader's grants, so it answers with the set they may price
against rather than handing over the parts and a rule for assembling them. The SPA reads one list.

**A change reaches a member without asking.** `CollectionPlannerSettings` is in the `planner`
changestream group, and WS dispatch routes an owner of kind `corporation` or `alliance` to
`AudienceSubscribers` targeted at that owner — so a market added to a corporation fans out to the
corporation's subscribers as the document is written. Nothing polls.

**One difference to design around:** a custom planner (`OwnerPlanner`) takes the default branch and
is delivered to subscribers of that document id, not to an owner audience. Markets shared with a
corporation and markets shared with a custom planner therefore arrive by two different routes.

**What the socket carries decides where the rule lives, and this is the part to settle.** The union
is composed once, server-side; a push carries one owner's document. If the SPA folded that document
into its own copy of the union it would need the de-duplication rule a second time, in a second
language, which is the failure the one-source-of-truth rule exists to stop. The cheaper answer is
that a pushed change is a **signal to re-read the resolved list**, not the data to merge: the rule
stays in one place, and the cost is one round trip on a rare event.

### One place is one market, however many owners saved it

Two rows naming the same station or structure are the same market, and the registry must offer it
once. This is not tidiness: the price tier keys everything by the saved row's id — a market's rows,
the character that read it, its next turn — so two rows for one citadel are two IndexedDB prefixes,
two turns on the rotation, and two full walks of the same structure on the reader's own token, an
hour apart for ever.

So the union is collapsed **by the place a row names**, not by its id. Where a reader's own row and
an inherited one name the same place, the reader's own wins: it carries the name they gave it, their
default flag, and the owner's rate they recorded. One source reaches the registry either way.

## Stage A — the settled shape

### The type

```go
// MarketLocation is one market an owner has saved, as against a place a job is
// performed in.
//
// Which sort of market it is follows from the place it names: a station id or a
// structure id, never both. Nothing stores a kind, because nothing would agree
// with the place if the two ever disagreed.
type MarketLocation struct {
	ID      string `bson:"id" json:"id"`
	Name    string `bson:"name" json:"name"`
	Default bool   `bson:"default" json:"default"`

	// Whether a market an organisation saved reaches its members' accounts, set
	// by whoever manages that organisation's markets. Meaningless on an account's
	// own row, which nobody inherits.
	SharedWithMembers bool `bson:"sharedWithMembers" json:"sharedWithMembers"`

	RegionID    int64 `bson:"regionID" json:"regionID"`
	StationID   int64 `bson:"stationID,omitempty" json:"stationID,omitzero"`
	StructureID int64 `bson:"structureID,omitempty" json:"structureID,omitzero"`

	// What an NPC station's broker fee is derived from: the race that built it
	// names the faction a standing is held against, the owner the corporation
	// holding the other. Both fixed for the station's life.
	RaceID  int64 `bson:"raceID,omitempty" json:"raceID,omitzero"`
	OwnerID int64 `bson:"ownerID,omitempty" json:"ownerID,omitzero"`

	// A citadel's rate, which nothing can derive. An NPC station's is worked out
	// from the seller's skills and standings, so a number stored there would
	// quote the untrained rate without saying so.
	BrokerFee float64 `bson:"brokerFee,omitempty" json:"brokerFee,omitzero"`
}

type MarketLocations []MarketLocation
```

`RegionID` carries no `omitempty`: every market has one, so an absent value is a defect to see rather
than a zero to hide. `Default` and `SharedWithMembers` are likewise always stored: "not shared" is an
answer about the market rather than the absence of one, and nothing reading the document should have
to work out which an absent field meant. The rest are omitted when zero, because zero means the row
does not have that kind of place or that kind of fee — the rule the four build kinds' fields already
follow.

An owner with no markets stores `[]`, never `null`.

### Where it lives

| Document | Field | Note |
|----------|-------|------|
| `models.ApplicationSettings` | `marketLocations` | The account's own |
| `planner.Settings` | `marketLocations` | The planner's, whether that planner is owned by an account, a corporation or an alliance |

**The schema version does not move in this stage, and moving it here would be a defect.**
`schemamaint.runBatch` selects every document below the current version, applies the upgrader, and
skips any whose version it did not raise — so a current bumped to 2 with no upgrader step that
reaches 2 leaves every settings document in the system below current for ever, scanned on each pass
and reported as `Remaining`.

An empty lane needs no bump in any case: a document written before this stage decodes with no
markets, which is what it has. The version moves in **Stage B**, where the upgrader can move the rows
out of `customStructures` and raise the version in the same step, which is the point at which a
document's meaning actually changes. `ApplicationSettingsSchemaCurrent` and
`planner.SettingsSchemaCurrent` are both 1 today.

**The empty lane is written to disk by a release step, not repaired on every read.**
`seedMarketLocationLane` gives every settings document in both collections a `marketLocations: []`,
so an owner who has saved no markets says so. Putting it in the schema upgrader instead would have
fixed the shape in memory, for every document, on every read, for the life of the document — and
left what is on disk saying nothing. The step selects what is **not already an array**, so it catches
a document that never had the field and one left holding `null`, which makes it safe to run again
and safe in any order against the other settings steps.

### The composition

One exported function, server-side, and the only place the rule exists:

- Take the reader's account markets, and from every planner their grants admit them to, the markets
  that planner has ticked as shared. An unshared row on an organisation's document reaches nobody.
- Collapse by **place** — `structureID` when it has one, else `stationID`. Two rows naming one place
  are one market.
- On a collision the reader's **own** row wins: their name for it, their default flag, the rate they
  recorded. An inherited row supplies a market they have not saved, never overrides one they have.
- **Where two inherited rows collide and neither is the reader's**, the nearer owner wins:
  corporation before alliance, and any other planner after both. A reader is in a corporation that is
  in an alliance, so the corporation's row is the more specific. Where that still ties — two custom
  planners, say — the lower owner key wins, so the answer does not depend on the order documents
  happened to be read in.

  **It decides every field the row carries, the broker fee included.** The place is the same by
  definition, and `raceID` and `ownerID` are derived from the location rather than typed, so two
  saves of one NPC station always agree about those. `brokerFee` is not: it is a percentage somebody
  typed for a citadel, nothing checks it against another owner's entry for the same structure, and
  the rate its owner charges can change after either was recorded. So two inherited rows really can
  quote different fees for one citadel, and the rule has to pick one rather than assume the question
  cannot arise. A stable answer matters more than which one it is — and a reader who disagrees with
  the figure can save the market themselves, which wins outright.
- Answer `[]` for a reader with none.

The SPA reads the answer and composes nothing. A pushed change to any owner's settings re-reads it.

### The SPA carries the lane before anything fills it

`toPersistPayload()` builds the settings document from a fixed list of fields, and the endpoint
**replaces** the document with what it is sent. So a client that does not know the lane does not
leave it alone — it drops it, and with it every market the reader saved, on the next save of any
setting at all. The field is carried through from the moment the server can store it, which is this
stage, not the one that fills it.

### What this stage does not do

No behaviour moves. Every reader still reads `customStructures`, and the lane is written but unfed
until Stage B fills it and switches them over in one change.

## What must not be lost

- **Every saved market.** The move is a prerelease step, idempotent, and it runs for every owner's
  settings document, not the account's alone.
- **A planner's own rows, which look unused and are not.** Nothing in the SPA reads
  `plannerSettings.customStructures` today, and it is easy to conclude from that they are dead
  clones seeded at planner creation. They are not: the planner settings document exists *because* a
  setup's `CustomStructureID` is a key into a settings document, so a member opening another
  member's job must resolve it against the planner rather than against their own account, where it
  would find nothing. The reader is missing, not the reason. Deleting those rows would break that
  path before it is finished.
- **The registry's facts.** `allMarketSources()` composes hubs, saved stations and saved citadels; it
  must read the new lane and answer exactly as it does today, or every priced surface changes at once.
- **Server-side registration.** `trackMarketSources` resolves saved stations from the settings
  document so this server prices them; it reads `customStructures` today.
- **A citadel's owner rate**, which `calcSellingCharges` reads for a sale.
- **What the device remembers.** A market's rows, the character that read it and its next turn are
  keyed by the saved row's id in IndexedDB. Ids surviving the move is what keeps them.

## Stages after Phase 1

| Stage | What it is |
|-------|------------|
| A — The stored shape | The Go type and the lane on each owner's settings document, plus the SPA carrying the lane through a save untouched. Composition and de-duplication are specified here and built in B; the schema version moves in B with the rows. No behaviour moves |
| B — The move | The prerelease step, and every reader switched to the new lane in one change: the registry, `trackMarketSources`, `saleLocations`, `calcSellingCharges`, the settings screens |
| C — The panel | A surface for managing saved markets, built from the app-shell components, listing what is true of each market now |
| D — Telling a reader a market cannot be read | The state the read already produces, shown where it can be acted on — handed here by [market-price-delivery](../market-price-delivery/plan.md) § Start here |

**Done when** a saved market is stored on its own lane, managed from its own panel, a reader can see
why one is not answering, and nothing about how a market is priced has changed.

## Wire compatibility

| Surface | Change | Note |
|---------|--------|------|
| `models.CustomStructures` and the settings document | **Migrate-required** | A new lane, and market rows leave the old one. A prerelease step moves them; the SPA and the server must agree on the shape before it runs |
| `PUT /api/v1/user/application-settings` | **Breaking, and the whole document** | The endpoint replaces the settings document, so a client that does not know the new lane would drop every saved market on the next save. The SPA and the server ship together |
| Planner documents | **Migrate-required** | They embed the same type |
| Stored job setups | **No change** | They reference a market by id and ids are not rewritten |
| IndexedDB | **No change** | Keyed by the saved row's id, which survives |

## What this waits on

1. **A release that already carries a prerelease migration.** A stored-document reshape rides one
   rather than standing up an upgrader path of its own.

**This may already be satisfied.** The window in `core/commands/prepare_release.go` carries twenty-odd
steps for this release, several of them document reshapes — the custom-structures fold, both rig-slot
folds, the job-document reshape — and Stage A has just added one to it. If that window is still open
when Stage B is written, Stage B rides it and this condition is spent rather than waiting. Worth
confirming against the release's own state before treating the project as blocked, because the answer
decides whether Stage B is available now or after the next release.

## This project unblocks custom-structure-model, not the other way round

An earlier draft had this project waiting on
[custom-structure-model](../custom-structure-model/contents.md) promoting, so that Stage A would
start from live SoT. That is the wrong way round, and following it would have promoted documentation
that is about to stop being true.

That project's Stage D landed the market kind **inside** the shared custom-structures form, and its
plan says so plainly: the sale kind "lands inside this project", the picker offers every kind, and
one form asks a structure for the fields its kind carries. Promoting it writes into live SoT that a
saved market is a custom-structure kind managed from that form — which is the arrangement this
project exists to remove. A reader of live SoT would be taught it, and then it would change.

There is no way to promote around it, either: a market cannot leave the shared form until it has
somewhere else to be managed, so the move (Stage B) and the panel (Stage C) are one shipment.

**So the order is A, B and C here, then custom-structure-model promotes** describing the four build
kinds it actually keeps. Stage D can follow that promotion.

**[market-price-delivery](../market-price-delivery/contents.md) is coupled more loosely and is not a
gate.** Its registry reads saved markets out of `customStructures` today, so Stage B changes where
`allMarketSources()` looks — one fact in that project's overlay rather than its substance, which is
how prices are fetched, derived, held and rotated. If it promotes first, Stage B updates the promoted
topic doc; if it promotes after, the doc is written once. Either is fine, and whoever goes second
owns the edit.

## Who owns what

| Question | Owner |
|----------|-------|
| Where a saved market is stored, and what a row holds | This project |
| How a saved market is managed, and what a reader is told about one | This project |
| How a market's prices are fetched, derived, held and rotated | [market-price-delivery](../market-price-delivery/contents.md) |
| The four build kinds' class and array | [custom-structure-model](../custom-structure-model/contents.md) |
| What a sale from a market costs | [planning-stage-panels](../planning-stage-panels/contents.md) |

## Open decisions

| Question | Notes |
|----------|-------|
| Whether a pushed document re-reads the union or is merged into it | Settled in principle — re-read, so the de-duplication rule is not written twice. Named here because it is the first thing Stage B builds against |
| **Who may tick `sharedWithMembers`, and who may add or remove an organisation's market** — *still open* | One question rather than two: a market reaching every member of a corporation is not a setting one member should change unremarked. The flag narrows the blast radius, since an unshared market affects nobody, but somebody still has to be allowed to tick it. The panel needs to say which owner a row belongs to and whether this reader may edit it |
| **A region id has four widths across the server** | `CustomStructure.RegionID` and `MarketLocation.RegionID` are `int64`, the Redis market-orders store is `int32`, and a job's market-order row is plain `int`. Unifying the two `MarketLocation` types closed one instance of this, not the pattern. Nothing is broken — every EVE region id sits three orders of magnitude below the `int32` ceiling, so every conversion is lossless, which is exactly why it has survived. The cost is that each boundary has to be got right by hand and nothing fails when one is not. Stage B adds boundaries here, in `trackMarketSources`, so it is the moment to decide whether to settle on one width or keep converting deliberately |
| What the panel shows about a market that cannot be read | The read already distinguishes "every character was refused" from "no character could be asked" from "the request failed". Which of those a reader should be shown, and what they are offered to fix it, is Stage D's to settle |
| Whether `structureKinds` keeps a market value at all | Nothing outside the market path would read it once the lane is separate, but `customStructureLocationMap` mints ids from it |
| Whether the move renames the stored field `jobType` on the remaining build kinds | Out of scope as written; it is the other half of the same misfit and would ride a later migration |

## Handoff status

**Stage A has landed** — see [overlay.md](./overlay.md) § Stage A. The type exists, both settings
documents carry the lane, and the SPA carries it through a save. Nothing reads it and nothing fills
it yet.

**Stage B is next**, and it is the one that waits on a release already carrying a prerelease
migration — see § What this waits on. It moves the rows, raises both schema versions in the same
step, and switches every reader over in one change.

The project is on the critical path: custom-structure-model cannot promote until Stages A to C have
landed and a saved market has left the shared form. The one decision still open —
**who may add or remove a market an owner shares** — is Stage C's rather than Stage B's, because the
panel is where a reader finds out.
