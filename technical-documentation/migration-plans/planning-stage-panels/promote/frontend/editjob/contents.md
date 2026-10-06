# Frontend — Edit Job

## Owns (SoT)

Behaviour of the Edit Job page's own controls under
[`frontend/src/Components/Edit Job`](../../../frontend/src/Components/Edit Job), the **Planning**
stage — the panels under
[`frontend/src/Components/Edit Job/Edit Job Components/Planning`](../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning) —
and the selling-charge estimation that stage shares with the Selling stage:

- **The page frame**: the header, the stage tabs, moving between stages, and the controls that save,
  close and delete the job.
- **Output**: what a job produces, how much of it is owed to its parent jobs, and those parents as rows.
- **Setups**: the setups a job is built from, the facility they share, and the editor each opens.
- **The Blueprint Library**: the blueprints or formulas the reader holds for a job, and applying one
  to the open setup.
- **Which jobs the Link a parent job dialogue offers.**
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

- **How a component changes the job being edited** →
  [../technical-rules.md](../technical-rules.md) § Changing the job being edited.
- **The SPA's shared dialogue shell** → [../technical-rules.md](../technical-rules.md) § Dialogues.
- **Document-lock UI and read-only gating on Edit Job controls** →
  [../document-lock/spa.md](../document-lock/spa.md).
- **The job dependency tree component itself**, shared with the group page →
  [../group/job-tree.md](../group/job-tree.md).
- **How market prices are produced.** The worker's region order-book reduction, the percentile
  constants, and `/api/v1/market-prices` are live SoT under [backend/](../../backend/contents.md).
  How the SPA fetches and caches them, a saved citadel's included →
  [../market-data/contents.md](../market-data/contents.md). This stage reads prices and queries no
  market itself.
- **Saved markets and their broker rates** → [../settings/market-locations.md](../settings/market-locations.md).
- **Archive and build-history figures.** `GET /api/v1/statistics/{owner}/totals` and what it serves →
  [backend/api/archive.md](../../backend/api/archive.md), [backend/worker/statistics.md](../../backend/worker/statistics.md).
- **Install cost calculation.** `getJobInstallCostForPlanning` and the system-index inputs behind it
  are not this area's.
- **The Selling stage's own sale-line matching**, real market orders, and what a sale actually
  charged — not yet documented here.
- **The Market Data and Price Entry dialogues' own behaviour** — how a purchase price is captured and
  distributed across jobs, and how an on-demand ESI read is made — not yet documented here.

## Task map

| I need to… | Read |
|------------|------|
| Change the header, the stage tabs, moving between stages, or Save, Close and Delete | [page-frame.md](./page-frame.md) |
| Change what Output states, or how the parent jobs are listed | [output.md](./output.md) |
| Change the setups list, the shared facility line, or the setup editor | [setups.md](./setups.md) |
| Change the Blueprint or Formula Library, or applying a blueprint to a setup | [blueprint-library.md](./blueprint-library.md) |
| Change which jobs the Link a parent job dialogue offers | [parent-job-link.md](./parent-job-link.md) |
| Change the material list, a row's sourcing, or costing a build before committing | [materials-sourcing.md](./materials-sourcing.md) |
| Change what a build's cost is made of, or how it compares to previous builds | [cost-breakdown.md](./cost-breakdown.md) |
| Change what a build returns, the sale location rate block, or a job with parent jobs | [returns.md](./returns.md) |
| Change how the Skills panel models a build, or its what-if mode | [skills.md](./skills.md) |
| Change the broker fee or sales tax formulas, or how a sale location resolves | [selling-charges.md](./selling-charges.md) |
