# Market locations

## Owns

A saved market as a thing in its own right: its own stored lane, its own model, and its own surface
for managing one — in place of a row in the custom-structures array whose kind field is called
`jobType`.

- **The stored shape.** A market location with the fields a market has and none of the fields a place
  a job runs in has, on its own lane of the settings document, both the account's and a planner's.
- **The move that gets there.** Lifting every `jobType === structureKinds.market` row out of
  `customStructures` into the new lane, in a prerelease step, idempotent, leaving job setups that
  reference a market by id untouched.
- **The surface for managing them.** A panel that lists saved markets with what is true of each one
  right now — whether it can be read, when it was last read, what it charges — rather than a form
  whose fields are decided by a kind table shared with four build kinds.
- **What a reader is told when a market cannot be read.** No character of theirs can dock there, or
  the one that could no longer can. Today the figures simply do not arrive, which reads the same as
  a market this server cannot reach —
  [market-price-delivery](../market-price-delivery/contents.md) § Start here records it as owed and
  hands it here.
- **Which vocabulary a market uses**, once it no longer borrows `jobType` and `structureKinds`.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **How a market's prices are fetched, derived, held or refreshed** →
  [market-price-delivery/contents.md](../market-price-delivery/contents.md), which owns the registry,
  the per-character read, the derivation, both tiers and the hourly rotation. This project changes
  where a saved market is *stored* and how it is *managed*, and must leave that registry reading the
  same facts under another name.
- **The four build kinds**, which keep the one class and the one array
  [custom-structure-model](../custom-structure-model/contents.md) landed. That project's reasoning for
  unifying them is not disturbed by a market leaving: see [plan.md](./plan.md) § Why a market leaves
  a model that was right to unify.
- **What a sale costs** — broker fees, sales tax, standings, the owner's rate →
  [planning-stage-panels/contents.md](../planning-stage-panels/contents.md). A market location stores
  the owner's rate; what is done with it is not this project's.
- **Which market a job is priced against, or sold from.** A citadel is already selectable as either;
  that it is not automatic is settled in
  [market-price-delivery/plan.md](../market-price-delivery/plan.md) § Settled.
- Live SPA and backend behaviour → [frontend/](../../frontend/contents.md),
  [backend/](../../backend/contents.md) (promote targets).

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when, open questions | [plan.md](./plan.md) |
| Know why a market leaves a model that was right to unify | [plan.md](./plan.md) § Why a market leaves a model that was right to unify |
| Know what the stored shape becomes | [plan.md](./plan.md) § The shape being built |
| Know what must survive the move | [plan.md](./plan.md) § What must not be lost |
| Know what is additive, what breaks the wire, and what needs a migration | [plan.md](./plan.md) § Wire compatibility |
| Know what this project owes market-price-delivery, and what it must not decide for it | [plan.md](./plan.md) § Who owns what |
| Know why this waits on another project promoting first | [plan.md](./plan.md) § What this waits on |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
