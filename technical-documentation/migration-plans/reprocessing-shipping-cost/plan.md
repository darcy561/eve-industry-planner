# Reprocessing shipping cost — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Let a user express what hauling costs them, as an ISK per cubic metre freight rate, and
have the mineral-to-ore calculator account for that rate when it chooses which ores to
buy. The ore the calculator recommends should be the one that is cheapest **delivered**,
not merely the one with the lowest market price at the source.

## Why

Two ores can offer near-identical minerals per ISK at the market and still differ several
times over in the volume a player has to move to get them home. The calculator today has
no concept of volume at all, so it cannot see that difference, and a recommendation that
looks optimal on price can be clearly worse once freight is paid.

This came from user feedback on `/reprocessing` (in-game name George Mcclellan), who asked
for exactly this and framed it against the tool's purpose: ending up with the required
input materials at the lowest total price.

## Starting position

The scoring model in the SPA is well shaped for this change, but the data it needs is not
being published.

**Volume never reaches the SPA.** The static-data reprocessing file carries
`{id, name, materials, batchSize, itemType, reprocessingSkill}` and nothing else. The full
item list — the other cached file the reprocessing page already loads — carries only
`{type_id, name}`. Neither offers a volume to fall back on, so there is no client-side
workaround; the field has to be published.

The source data is not the obstacle. The SDE conversion already parses `volume` onto its
internal EVE type, and the recipe-list output already emits `volume` for recipe materials.
What is missing is carrying that same value onto the reprocessing output.

**The scoring model absorbs the change cleanly.** Ore selection scores each ore against a
cost for one batch, and every term that follows — minerals per unit of cost, and the waste
penalty — is expressed as a ratio against that same batch cost. Redefining that cost from a
market cost to a landed cost therefore flows through the whole model without restructuring
it. This is the reason the change is small on the client.

**The solver is greedy, and will remain greedy.** Ore selection repeatedly scores every ore,
takes the single best, and buys enough of it to clear the first mineral requirement it can
satisfy, then rescores. That is a reasonable heuristic but it does not guarantee the
cheapest basket, with or without freight in the cost. See § Scope boundary.

## Scope boundary

This project makes the cost model **more truthful**. It does not make the solver **optimal**.

Modelling freight corrects a real blind spot and will change recommendations for anyone who
hauls. It does not turn the greedy selection into a genuine cost minimisation, which would
need a different algorithm — a linear program over ore quantities rather than a scoring
heuristic. That is a substantially larger piece of work with its own performance and
explainability questions, and it is deliberately **out of scope here**.

The requester framed their ask in terms of optimality. The honest reply is that this change
gets the cost model right and improves the recommendation, and that true optimality is a
separate, larger change. Say so rather than implying the stronger result.

## Phases

Phase 1 is this documentation scaffold and is complete when the folder, `contents.md`, this
plan, the rules acknowledgement, and the section task-map row all exist and link up.

### Stage A — Publish ore volume

Carry volume onto the reprocessing static-data output so the SPA can see it, and republish
the static data.

**Wire compatibility: additive.** A new optional `volume` key on reprocessing static data.
Existing SPA builds ignore an unknown key. The consuming code added in Stage B must treat a
missing volume as zero rather than propagating a non-numeric value, because clients holding
a cached copy of the previous file will not have it until that cache turns over.

Run `go fix -diff` against the SDE conversion package only, before and after the edit.

**Done when:** published reprocessing static data carries a volume for ore, and a client
reading a pre-change cached file still calculates without error.

### Stage B — Landed cost in ore selection

Carry the volume through the reprocessing item model, and redefine the per-batch cost used
in scoring from market cost to landed cost — the market cost plus the freight rate applied
to the batch's volume. The dependent terms need no change, as above.

Add a shipping rate to the reprocessing calculation settings, defaulting to zero. **A zero
default is a requirement, not a convenience:** it means every existing user sees results
identical to today until they choose to enter a rate, so the change cannot silently move
recommendations for people who never asked for it.

Confirm the new setting survives a round trip through the persisted user document — the
settings panel writes these values to the user's account, so the backend settings model may
need the field to avoid it being dropped on save. Check this before treating the stage as
sized.

Tests ship with this stage. The scoring change is testable in isolation and should be
covered directly: a zero rate must reproduce current selections exactly, and a rate high
enough to matter must shift selection toward denser ore.

**Done when:** a user can enter a rate, selection responds to it, a zero rate reproduces
today's behaviour, and the setting persists across a reload for a logged-in user.

### Stage C — Show the freight in the result

Surface total volume and the freight component of the total cost in the calculator output.
Without this the headline number moves and the user has no way to see why. A cost model the
user cannot inspect is a cost model they will not trust.

**Done when:** the output shows the volume being hauled and what the freight adds.

## Decisions

### Freight is a rate, not a slider

The other calculation settings are sliders over small bounded ranges. A freight rate is not
that kind of quantity: real rates span roughly a hundred to a couple of thousand ISK per
cubic metre depending on route and service, and the right value is personal to the user and
their logistics arrangements. A slider cannot cover that range at a useful resolution. This
one is a numeric entry.

It belongs alongside the existing calculation settings, where it inherits save-as-default and
revert-to-default without special handling.

### The compression bonus overlaps, and stays for now

The existing "prefer compressed" setting and its bonus multiplier are a hand-tuned proxy for
the very thing this project models properly. Compressed ore is worth preferring **because**
it hauls better; the bonus is that preference expressed as a fudge factor in the absence of
volume data.

Once freight is modelled directly, a user with a realistic rate set is paying for that
preference twice. The two reasonable options:

- **Keep both, document the overlap.** Users who set a freight rate can turn the compression
  bonus down to zero and let the real cost model do the work. Nothing changes for anyone who
  does not opt in.
- **Retire the compression bonus** and let freight subsume it.

**Chosen: keep both.** Removing the bonus would change results for every existing user,
including those who never set a freight rate and did not ask for anything to move. Retiring
it is a defensible follow-up once freight has been in users' hands and the overlap is
understood in practice, but it should not ride along inside this change.

### Missing volume means zero freight, not an error

Where a volume is absent — a stale cached static-data file, or an item the SDE does not give
one for — the freight contribution is treated as zero. The ore still competes on its market
cost. The alternative, excluding it from selection, would silently drop ores from the plan
for a data reason the user cannot see or fix.

## Related cleanup

Ore selection currently logs a table of every ore and its score on each iteration of the
solver loop, in production. It is unrelated to this project, but it sits in the function
Stage B edits, and Stage B is a sensible moment to remove it.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Done |
| A — publish ore volume | Not started |
| B — landed cost in selection | Not started |
| C — show freight in result | Not started |
