# Cost Breakdown (`Edit Job Components/Planning/Standard Layout/Cost Breakdown`)

Live SoT for what a build costs and what that is made of, against the range of previous builds of the
item. `CostBreakdownPanel` renders it; `useJobEconomics.js` is the figures behind it and behind
[returns.md](./returns.md) — one hook, so a cost stated here and subtracted there is the same number.

## One pricing model, named

The header carries a toggle between pricing each material as its own plan says (bought, built, paid)
and pricing everything at market, and names which is in effect above the table. The toggle is
**display-only** — it lives in component state and is never written to the job — and a material
already paid for is unaffected by either model, since it is a record rather than an estimate.

## The proportion bar and the table

A stacked proportion bar sits above the cost table; `costParts.js` gives each component a colour from
the shared chart palette, and the same colours mark the dot beside each table row, so a segment and
its row cannot drift apart. Pointing at or focusing a segment marks its row and lets the rest of the
bar recede — the reverse of matching two small coloured squares by eye.

The **build band** — materials, child builds, install, invention and extras — is split from the
**sell band** — broker fee and sales tax — because the selling charges are only paid on listing: a
job with no sellable output (see [returns.md](./returns.md) § Jobs with parent jobs) carries no sell
band at all, and the broker fee's 100 ISK floor is never quoted where there is nothing to list.

Materials and child builds do not overlap: `estimatedMaterialCost` substitutes a linked
child's own unit cost for the material's market price rather than adding to it, recursing through
nested child jobs, so a linked material contributes to the total once. A material a child job falls
short of covering appears in the shortfall's own line — see
[materials-sourcing.md](./materials-sourcing.md) § Costing a shortfall.

Two rules in that walk (`Functions/Groups/childJobCostWalk.js`) are worth stating, because neither is
visible in the figure it produces:

**Several children of one material are spread over their combined output**, rather than charged one
after another. They are parallel ways of producing the same thing, so the material's unit cost is the
blended cost of the routes supplying it.

**A child job already on the current path is skipped rather than part-counted.** Where other children
of that material remain, it is priced from those; where it was the material's only child, the material
falls back to what buying it costs — the market price in an estimate, what was actually paid in a cost
so far. Ancestry is tracked per path rather than per walk, so the same job reached down two separate
branches is two real contributions and is still counted twice — only a repeat on one path is cut. The
cost of that cut is that the figure is **understated with nothing on screen saying so**, which is why
the skip is reported to Sentry rather than passed over quietly.

**Extras** are a line each, named by their own description and category, rather than summed into one
figure — a player who wrote down a courier contract and a set of copies separately kept them as
separate costs. Their colours are shades of the one extras colour, derived rather than chosen, so
there is a shade for however many a build carries.

**Invention** is counted alongside materials, child builds, install and extras for any item whose
meta group makes it an invented one (T2 or T3), matching what the archive stores per build and what
`job.buildCost` totals — a T2 job that omitted it would read as cheaper than its own history says
every previous build was. Its editor sits beside the extras editor, and both write the rows the
Purchasing stage's own editors write, so what either stage records is what the other shows.

## Against previous builds

Beneath the table, this build's cost per unit sits against the range of previous builds of the same
item, drawn as a range bar whose scale is wider than the range itself, so a build cheaper or dearer
than every previous one reads as *outside* the range rather than clamped onto its end. The bar states
a position and no verdict — it does not colour the current build as good or bad, since whether a
margin is worth the time is not something the figures alone can say. A first build, or a signed-out
reader, states plainly that there is nothing to compare against.

The archive figures behind the range bar are the same `useAccountTotalsQuery` result Build History
draws its cost-over-time chart from — see
[backend/api/archive.md](../../backend/api/archive.md),
[backend/worker/statistics.md](../../backend/worker/statistics.md). The chart itself renders
only on Build History; Cost Breakdown does not draw a second copy of it.

**The per-component comparison against the last build is not available** — the served
`ProductionTotalsRow` carries whole-build cost per unit only, not the cost parts split. Cost Breakdown
states the comparison once, against the whole build, until the endpoint serves the split.

## Layout

Stacked with its sibling panels, so it sets `AppShellPanel`'s `paperSx={{ height: "auto" }}` — see
[../technical-rules.md](../technical-rules.md) § Stacked panels.
