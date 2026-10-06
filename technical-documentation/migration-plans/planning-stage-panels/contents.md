# Planning stage panels

## Owns

The Edit Job **Planning** stage: what its panels ask, what they answer, and the figures they need to
answer it.

- The **split of the market panel**: `MaterialCostPanel` currently carries product revenue, material
  cost, the buy-vs-build comparison and the pricing configuration, and what replaces it.
- The **material list rendered once** rather than in Raw Resources and again in the cost rows, and the
  per-row buy-vs-build comparison that replaces four ungrouped figures.
- **Selling costs at plan time**: the broker fee paid to list an item and the sales tax paid on the
  sale, estimated on the Planning stage rather than first appearing on Selling, deriving what can be
  derived and taking the rest from the player.
- **Sale locations and their rates**: an NPC station's broker fee derived from the character's skill
  and standings, a citadel's supplied by the player because its owner sets it, and the sales tax rate
  derived from Accounting at both. The base rates and coefficients are SPA constants; how a saved
  citadel is *stored* belongs to the custom-structure work, and this project reads one through a single
  accessor.
- The **pricing order type** a figure is quoted on — which of the four server-served price modes
  (`buy`, `sell`, `buyP95`, `sellP05`) a row used, and how a player is shown what each does.
- **Speculative child jobs**: costing a buildable material's build before the player commits to it,
  so the comparison exists before the decision rather than after.
- What a job with **parent jobs** shows, given its output is committed and never listed.
- The **Skills panel** as a model of what a build costs rather than a pass/fail gate, including the
  market skills that drive the fee and tax figures.
- The **archive figures** used as context beside an estimate, and where they render.
- **Which character the selling figures are quoted for** — an account-level default market character
  and a per-job override of it, both planning inputs only.
- **What the job produces and who it is owed to** — the panel that replaces Production Stats, reading
  the commitment through the one hook three other panels already read, and carrying the **parent jobs**
  as rows rather than leaving them an unmanaged list in the page header.
- **The Edit Job page frame** — stage navigation as tabs rather than a vertical `Stepper`, the four
  navigation controls reduced to one labelled pair, and the header controls that save, close and delete
  the job.
- **The Setups panel** — Build Setup and its untitled editor merged into one panel of rows that open in
  place, with the facility stated once above them and each setup's install cost in a column.
- **The Blueprint Library** — rows rather than tiles, status in words rather than a colour legend, a
  named Use control with an undo, and reactions under their own title, Formula Library.

## Does not own

- **How market prices are produced.** The worker's region order-book reduction, the percentile
  constants, the Redis entry and `/api/v1/market-prices` are live SoT under
  [backend/](../../backend/contents.md). This project consumes the four figures already served and
  adds no market querying of any kind.
- **The Market Data dialogue.** It stays a per-item, user-initiated ESI read. No figure on the
  Planning stage is derived from it, and this project does not automate it.
- **The Price Entry dialogue's own behaviour** — how a purchase price is captured and distributed
  across jobs. This project only surfaces *that a material has one* on the material row.
- **The Selling stage.** The sale-line matching stays as it is, and the Selling stage remains
  authoritative for what was actually charged. This project splits the rate out of the fee calculation so
  both stages share one formula, and leaves `defaultCitadelBrokersFee` in place for the real-order
  path.
- **Install cost calculation.** `getJobInstallCostForPlanning` and the system-index inputs are
  unchanged; this project only re-files the figure it returns.
- **The planner settings split.** Which settings are account-scoped and which are planner-scoped is
  [shared-planners](../shared-planners/contents.md)' decision. The default market character this
  project adds is account-scoped, and inherits the placement application settings already have — see
  [plan.md](./plan.md) § What this project inherits.
- **Storing saved citadels.** The saved-market lane and its editor are live SoT →
  [frontend/settings/market-locations.md](../../frontend/settings/market-locations.md). This project
  stores nothing and reads sale locations through one accessor over that registry — see
  [plan.md](./plan.md) § One accessor over the sale locations, and § Handed to the custom-structure work
  for the proposal this project passed on.
- **The market pricing defaults.** Splitting the account's one market default into separate buying and
  selling defaults, and keying defaults to market groups, are their own work →
  [market-pricing-defaults/contents.md](../market-pricing-defaults/contents.md). This project reads
  the existing single default through the resolver hooks and changes neither.
- **Document write granularity.** Settings and job writes keep whatever shape
  [document-write-granularity](../document-write-granularity/contents.md) leaves them in.
- **Minerals bought as ore.** The engine, the solver and the ore figures are
  [reprocessing-rebuild](../reprocessing-rebuild/contents.md)'s, and putting them on this stage is
  scoped nowhere yet. It is designed on these panels, and [plan.md](./plan.md) § Handed on: minerals
  bought as ore records which seams it uses; nothing here waits on it.
- **A save that does not close the job.** `saveOpenJob` calls `closeActiveJob`, which persists the draft
  and ends the edit session in one call, applying the parent and child link intents as it goes.
  Splitting it is named in [plan.md](./plan.md) § Stage Q and belongs to whoever takes the edit
  session's lifetime; this project relabels the control "Save & close" and stops there.
- **What a linked ESI job is worth.** `layout.esiJobTab` and everything else that goes with the Building
  stage's tabs belongs to [building-stage-panels](../building-stage-panels/contents.md); § Stage Q
  changes how a reader moves between stages and touches none of it.
- Live SPA and backend behaviour, promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand what is wrong with the panel today | [plan.md](./plan.md) § Starting position |
| See the three panels and what each answers | [plan.md](./plan.md) § Target shape |
| Know why the backend work comes first | [plan.md](./plan.md) § Ordering |
| Find the sale location shape and its migration | [plan.md](./plan.md) § Stage A |
| Understand why a station and a citadel are priced differently | [plan.md](./plan.md) § Stage A, § Two location kinds, two mechanisms |
| See how a rate resolves at each location kind | [plan.md](./plan.md) § Stage A, § The resolution order |
| Know what is stored and what is an SPA constant | [plan.md](./plan.md) § Stage A, § What is stored, and where |
| Find how consumers read a sale location, and the shape it resolves to | [plan.md](./plan.md) § Stage A, § One accessor over the sale locations |
| Know where buying minerals as ore will sit on this stage | [plan.md](./plan.md) § Handed on: minerals bought as ore |
| Find what the custom-structure work inherited from here | [plan.md](./plan.md) § Handed to the custom-structure work |
| Find why the account's single market default is being split | [market-pricing-defaults/plan.md](../market-pricing-defaults/plan.md) |
| Find where the rate block renders on a job | [plan.md](./plan.md) § Stage F |
| See what the fee estimate reuses from Selling | [plan.md](./plan.md) § Stage B |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| Understand the pricing order type and its four modes | [plan.md](./plan.md) § Stage D |
| See the speculative child job change and its cost | [plan.md](./plan.md) § Stage G |
| Know what a job with parents shows | [plan.md](./plan.md) § Stage H |
| See how the Skills panel models a build's cost | [plan.md](./plan.md) § Stage I |
| Know what changes on mobile and what does not | [plan.md](./plan.md) § Stage J |
| Find where the seller character is chosen and resolved | [plan.md](./plan.md) § Stage K |
| Know how a job overrides the seller or the sale location | [plan.md](./plan.md) § Stage L |
| Know what happens when a child job stops covering its material | [plan.md](./plan.md) § Stage M |
| See how the sale location list and its fee figures work | [plan.md](./plan.md) § Stage N |
| Check the fee and tax formulas against real sales | [measurements/selling-charges-against-stored-jobs.md](./measurements/selling-charges-against-stored-jobs.md) |
| See what the parent-job and stage-lock counts were measured against | [measurements/parent-jobs-and-stage-locks.md](./measurements/parent-jobs-and-stage-locks.md) |
| Find what this project owes another release | [plan.md](./plan.md) § Owed to the shared-planners release |
| See what each panel was owed visually and what was built | [plan.md](./plan.md) § Design fidelity |
| Find where a shared helper moved to | [plan.md](./plan.md) § Where the shared helpers ended up |
| Know which hooks keep the panels agreeing | [plan.md](./plan.md) § Two seams the panels are held together by |
| Know what this project could not finish and why | [plan.md](./plan.md) § Known limits |
| See the stages and their order | [plan.md](./plan.md) § Stages |
| Know what Output states and where the parent jobs live | [plan.md](./plan.md) § Stage P |
| Find why the stepper becomes tabs, and what happens to the header controls | [plan.md](./plan.md) § Stage Q |
| See how the two setup panels become one Setups panel, and why its rows are not grouped | [plan.md](./plan.md) § Stage R |
| See how the Blueprint Library becomes rows, and what Use does | [plan.md](./plan.md) § Stage S |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See the visual design the stages build to | [plan.md](./plan.md) § Design reference |
| Find the design for Output, the frame, Setups and the Blueprint Library | [plan.md](./plan.md) § Design reference, *A second design covers the rest of the stage* |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
| Check what has really landed, what each remaining step changes, and what was decided | [review.md](./review.md) |
