# Frontend — Edit Job Planning stage

## Owns (SoT)

The Edit Job **Planning** stage — the panels under
[`frontend/src/Components/Edit Job/Edit Job Components/Planning`](../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning) —
and the selling-charge estimation it shares with the Selling stage:

- **Materials & Sourcing**: the material list, per-row buy-or-build sourcing, the pricing order type and
  hub a row's figures are quoted on, and costing a build before committing to it.
- **Cost Breakdown**: what a build costs and what that is made of, against the range of previous
  builds of the item.
- **Returns**: what a build returns by each way out of it, the sale location and its rates, and what
  a job with parent jobs shows instead.
- **Skills**: what a build asks of a character, split by what it requires, what shortens it, and what
  selling it costs.
- **Selling charges**: the broker fee and sales tax estimation shared with the Selling stage, sale
  location resolution, and which character a job's selling figures are quoted for.

## Does not own

- **How market prices are produced.** The worker's region order-book reduction, the percentile
  constants, and `/api/v1/market-prices` are live SoT under [backend/](../../backend/contents.md).
  This stage consumes the four served figures and queries no market itself.
- **Archive and build-history figures.** `GET /api/v1/statistics/{owner}/totals` and what it serves →
  [backend/api/archive.md](../../backend/api/archive.md), [backend/worker/statistics.md](../../backend/worker/statistics.md).
- **Install cost calculation.** `getJobInstallCostForPlanning` and the system-index inputs behind it
  are not this area's.
- **The Selling stage's own sale-line matching**, real market orders, and what a sale actually
  charged — not yet documented here.
- **The Market Data and Price Entry dialogues' own behaviour** — how a purchase price is captured and
  distributed across jobs, and how an on-demand ESI read is made — not yet documented here.
- The shared dialogue shell → [../technical-rules.md](../technical-rules.md) § Dialogues.

## Task map

| I need to… | Read |
|------------|------|
| Change the material list, a row's sourcing, or costing a build before committing | [materials-sourcing.md](./materials-sourcing.md) |
| Change what a build's cost is made of, or how it compares to previous builds | [cost-breakdown.md](./cost-breakdown.md) |
| Change what a build returns, the sale location rate block, or a job with parent jobs | [returns.md](./returns.md) |
| Change how the Skills panel models a build, or its what-if mode | [skills.md](./skills.md) |
| Change the broker fee or sales tax formulas, or how a sale location resolves | [selling-charges.md](./selling-charges.md) |
