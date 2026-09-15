# Custom structure model

## Owns

How a player's custom structures are shaped and stored: one class and one array keyed by the kind each
row already carries, in place of four lanes filled by three classes.

- **The stored shape.** One `CustomStructure` with the fields every kind shares and the optional ones
  each kind uses, held in a single array on the settings document — both the account's and a planner's,
  which embed the same type.
- **The upgrade that gets there.** A schema bump and a fold, in memory and idempotent, on the pattern
  the existing `Invention` seed step set.
- **The one class in the SPA**, and where reprocessing's rig and structure bonus calculations live
  once there is no class of its own to hold them.
- **What a screen reads** to list structures, once there is no lane to name.

**[market-price-delivery](../market-price-delivery/contents.md) is shelved until this project lands a
kind that is a market**, so its remaining work resumes on the back of Stage A.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **What a structure is for.** Costing a job in one, pricing a sale from one, or fetching a market
  held in one are the projects below; this one decides the row's shape and nothing about its meaning.
- **Pricing against a saved market**, including whether a citadel can be a market source and what
  `priceHub` means once a structure can be priced directly →
  [market-price-delivery/contents.md](../market-price-delivery/contents.md). That project waits on a
  saved location being able to *be* a market, which is a kind this model makes expressible.
- **What a sale costs** — broker fees, sales tax, the owner's rate →
  [planning-stage-panels/contents.md](../planning-stage-panels/contents.md), which handed the
  `SaleStructure` shape over as a proposal rather than a decision.
- **The settings screens' appearance**, already landed →
  [accounts-page/contents.md](../accounts-page/contents.md).
- **Stored job setups**, which reference a structure by id and are untouched: ids are not rewritten.
- Live SPA and backend behaviour → [frontend/](../../frontend/contents.md),
  [backend/](../../backend/contents.md) (promote targets).

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when, open questions | [plan.md](./plan.md) |
| See how little the three shapes actually differ | [measurements.md](./measurements.md) § The fields, and how little they differ |
| Know why the lane is not what decides a row's shape | [measurements.md](./measurements.md) § Four lanes, three classes |
| Know how a row says what kind it is without its lane | [measurements.md](./measurements.md) § Every row already carries its own type |
| Judge how much code this moves | [measurements.md](./measurements.md) § How much code would move |
| Find the shape being built | [plan.md](./plan.md) § The shape being built |
| Know what must survive the fold | [plan.md](./plan.md) § What must not be lost |
| Know what is additive, what breaks the wire, and what needs a migration | [plan.md](./plan.md) § Wire compatibility |
| Know which project owns a question about structures | [plan.md](./plan.md) § Who owns what |
| Know what this project owes market-price-delivery, and what it must not decide for it | [plan.md](./plan.md) § Stage D |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
