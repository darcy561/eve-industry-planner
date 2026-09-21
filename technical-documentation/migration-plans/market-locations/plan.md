# Market locations — plan

**Status: Phase 1.** The project folder and its docs exist; no product work has started, and none
starts until this gate is complete and the two things in § What this waits on have happened.

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

To be settled in Phase 2, but the constraints are already known:

- **Its own lane** on the settings document, account and planner alike, beside `customStructures`
  rather than inside it.
- **No `jobType`.** What a row is follows from the place it names, as it already does: a station id
  or a structure id, never both. `structureKinds.market` and `customStructureLocationMap`'s market
  entry go with it.
- **The fields a market has**: a name, a region, the place, the owner's rate at a citadel, and the
  race and corporation an NPC station's fee is derived from.
- **Ids are not rewritten.** A job setup referencing a market by id keeps working, which is what
  makes this a move rather than a rebuild.

## What must not be lost

- **Every saved market.** The move is a prerelease step, idempotent, and it runs for accounts and
  planners alike.
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
| A — The stored shape | Decide the model, its Go type, its schema version and its place on both documents. No behaviour moves |
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

1. **[custom-structure-model](../custom-structure-model/contents.md) promoting.** It is at its close
   condition. Promoting it first means this project starts from live SoT rather than an overlay, and
   that project's docs stop describing a market kind it would no longer own. Starting here first
   would mean promoting documentation that this project immediately contradicts.
2. **A release that already carries a prerelease migration.** A stored-document reshape rides one
   rather than standing up an upgrader path of its own.

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
| Whether a planner's markets and an account's stay the same shape | They do today, by embedding the same type. A panel that shows per-market state may want to say which of the two a row belongs to |
| What the panel shows about a market that cannot be read | The read already distinguishes "every character was refused" from "no character could be asked" from "the request failed". Which of those a reader should be shown, and what they are offered to fix it, is Stage D's to settle |
| Whether `structureKinds` keeps a market value at all | Nothing outside the market path would read it once the lane is separate, but `customStructureLocationMap` mints ids from it |
| Whether the move renames the stored field `jobType` on the remaining build kinds | Out of scope as written; it is the other half of the same misfit and would ride a later migration |

## Handoff status

Phase 1 only. Nothing is built, and nothing should be until § What this waits on is satisfied. The
next step is Stage A's shape, which is a decision rather than code.
