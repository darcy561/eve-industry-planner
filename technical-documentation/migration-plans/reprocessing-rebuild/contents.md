# Reprocessing rebuild

## Owns

The Reprocessing page and the engine beneath it — both directions, from the formula to the screen.

- **The engine as a set of pure functions** other screens can call: one reprocessing setup shape, one
  result shape with every output a total, inputs left untouched, prices handed in rather than fetched.
- **The yield calculation's open questions** — rounding, gas decompression, NPC station tax — settled
  against the game before the engine is shared.
- **Ore selection as an exact solver** in place of the greedy scorer, with shipping, compressed-ore
  choice, buying minerals outright and the never-choose list as inputs rather than weights.
- **What the page values**: reprocessing tax, selling fees for a chosen seller, units kept back under a
  batch, hauling volume, leftovers, and the cost of a mineral as a given ore.
- **The reprocessing static file**: volume, which shipping and hauling figures need; its skills, kinds
  and contents read from the SDE; and random outputs for erratic ore and unrefined minerals.
- **Where reprocessing settings live**: the calculation and shipping settings move to the planner; the
  default reprocessing character stays on the account.
- **Module and scrap metal reprocessing** in To minerals — the outputs, the scrap formula, and the
  read the engine uses — as Stage M.
- **The page rebuilt on the app-shell design**, to the canvas this plan points at, including its charts,
  the setup comparison, the market comparison and the opt-in asset reads.

## Does not own

- **Reprocessing in other screens** — Planning sourcing, the shopping list, the assets dialogue, the
  watchlist, the structure editor. This project makes the engine callable from them and stops there;
  see [plan.md](./plan.md) § Not in the sequence. Purchasing's ore panel is held open in
  [purchasing-stage-panels](../purchasing-stage-panels/plan.md); Planning records the seams it uses in
  [planning-stage-panels](../planning-stage-panels/plan.md).
- **Unrefined Mineral Reactions.** They are reaction jobs the job planner already plans from the
  recipes; this project reprocesses their output and does not plan the reaction — see
  [plan.md](./plan.md) § Not in the sequence.
- **How static data reaches the browser.** Module outputs ride whichever mechanism
  [static-data-delivery](../static-data-delivery/contents.md) Stage E settles on for recipes; that
  decision is the delivery project's, and Stage M is built to either answer.
- **The settings split as a whole.** Which settings belong to a planner is
  [shared-planners](../shared-planners/plan.md) § Settings split between the planner and the account.
  This project moves `ReprocessingSettings` under that rule and moves nothing else.
- **The pricing ladder, selling-rate calculations and the assets reads.** Used as they are, owned by
  their live docs: [frontend/pricing](../../frontend/pricing/contents.md),
  [frontend/market-data](../../frontend/market-data/contents.md) and the shopping list's asset hooks.
- **The custom structure shape and the rig-conflict rule** —
  [frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md).
- Live SPA and backend behaviour, promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand what is wrong today, page and engine | [plan.md](./plan.md) § Starting position |
| See what the page and the engine become | [plan.md](./plan.md) § Target shape |
| Know which decisions are already taken, and by whom | [plan.md](./plan.md) § Decisions taken |
| Check what is additive, breaking or migrate-required | [plan.md](./plan.md) § Wire compatibility |
| Pick up the next task | [plan.md](./plan.md) § Handoff |
| Find a stage's tasks, files and done-when | [plan.md](./plan.md) § Stages |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
| Find the worked example every figure on the canvas comes from | [measurements/worked-example.md](./measurements/worked-example.md) |
| See how far the current ore selection is from the cheapest answer | [measurements/ore-selection-benchmark.md](./measurements/ore-selection-benchmark.md) |
| See the visual design the page builds to | [plan.md](./plan.md) § Design reference |
| Find what was considered and deliberately left out | [plan.md](./plan.md) § Not in the sequence |
| See how the page lays out on a phone | [plan.md](./plan.md) § G7 — Phone layout |
| Know which skills the setup lists | [plan.md](./plan.md) § G2 |
| Know what changes for a reader who is not signed in | [plan.md](./plan.md) § G8 — Signed-out readers |
| See how buying minerals as ore looks on Planning, Purchasing and the Shopping List, and which project holds each | [plan.md](./plan.md) § Not in the sequence, § Design reference |
| Know how Prismaticite and the unrefined minerals are worked out and shown — one mineral per batch, a likely range | [plan.md](./plan.md) § A4, § C2b, § G3; [measurements/worked-example.md](./measurements/worked-example.md) § Erratic ore |
| Know why the static file's skills and kinds come from the SDE rather than hand-typed maps | [plan.md](./plan.md) § B1a |
| See how module and scrap reprocessing fits either static data answer | [plan.md](./plan.md) § Stage M |
