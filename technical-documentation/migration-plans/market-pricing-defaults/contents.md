# Market pricing defaults

## Owns

Which market a figure is priced against when nobody has said, and how that answer is reached.

- **The account's stored defaults.** Retiring the single `defaultMarketLocation` /
  `defaultOrderType` pair in favour of separate defaults for the buying side and the selling side of
  a job, each naming a market and a pricing basis.
- **The resolution ladder** every surface resolves a market id through, and the rule that a nearer
  rung outranks a further one.
- **Which side each surface asks for.** A call site names the side it wants; nothing infers it.
- **Defaults keyed to an item's market group**, and the walk up the group tree that finds the nearest
  one carrying a default.
- **Publishing an item's market group to the SPA**, which today holds no market group data at all.
- **The vocabulary the ladder is written in** — `PricingChoice`, `PricingSide`, `JobPricing`,
  `PRICING_SIDE`, and the rule that an empty value is not a choice at any rung.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **Saved citadels as pricing locations** — storing them, the editing surface, and reading a
  structure's own market → [market-price-delivery/contents.md](../market-price-delivery/contents.md)
  § Stage F, which is the custom-structure work for markets and inherits the shape worked out at
  [planning-stage-panels/plan.md](../planning-stage-panels/plan.md) § Handed to the custom-structure
  work. Both projects widen what a market id may be; neither blocks the other, and both land on this
  project's resolver.
- **How a price reaches the browser and what keeps it current** — the request, the row, the cache and
  the freshness rule → [market-price-delivery/contents.md](../market-price-delivery/contents.md). This
  project decides what to ask for; that one decides how the asking works. Boundary and the one-way
  dependency: [plan.md](./plan.md) § Where this project stops and market price delivery starts.
- **The four pricing bases themselves** (`buy`, `sell`, `buyP95`, `sellP05`) and the server-side
  figures behind them. This project decides which basis is reached for by default, not what a basis
  means.
- **Where a job sells from.** `JobSale.Plan` and its sale location are a per-job choice already built
  — see [planning-stage-panels/contents.md](../planning-stage-panels/contents.md). This project owns
  only the account-level default beneath it.
- **The material price override on a job** (`layout.materialPriceOverrides`), which is the ladder's
  top rung and already works. This project does not change it.
- **Backfilling the stored documents.** `account_settings` is stamped in the shared-planners release
  window, so writing `DefaultPricing` once per account is a step in that project's `prepareRelease`
  run → [shared-planners/contents.md](../shared-planners/contents.md). This project owns the field and
  the read-time seed that carries it until then.
- Live SPA and backend behaviour → [frontend/](../../frontend/contents.md),
  [backend/](../../backend/contents.md) (promote targets).

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when, open decisions | [plan.md](./plan.md) |
| Understand why one default was two questions | [plan.md](./plan.md) § Why this project exists |
| Know where this stops and market price delivery starts | [plan.md](./plan.md) § Where this project stops and market price delivery starts |
| Avoid the buy/sell naming trap before writing any field | [plan.md](./plan.md) § Two axes, both called buy and sell |
| See the full resolution ladder and which rungs exist | [plan.md](./plan.md) § The ladder |
| Find every surface reading the account default today | [plan.md](./plan.md) § Stage A |
| Know what is additive and what needs a schema step | [plan.md](./plan.md) § Wire compatibility |
| See what the SPA holds about an item's market group | [plan.md](./plan.md) § Stage B |
| Know why a group default sits inside a side | [plan.md](./plan.md) § A group default belongs to a side |
| Read what has already gone wrong here before changing a stored shape | [plan.md](./plan.md) § Traps this work has already fallen into |
| Find what the market group tree actually contains | [measurements/market-group-tree.md](./measurements/market-group-tree.md) |
| See which name for a market and a basis the SPA already uses | [measurements/vocabulary-counts.md](./measurements/vocabulary-counts.md) |
| Know which vocabulary the rename converges on, and why | [plan.md](./plan.md) § Stage N |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
