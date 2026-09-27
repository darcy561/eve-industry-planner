# Custom structure model

## Owns

How a player's custom structures are shaped and stored: one shape and one array keyed by the kind each
row already carries, in place of four lanes filled by three classes.

- **The stored shape.** One `CustomStructure` with the fields every kind shares and the optional ones
  each kind uses, held in a single array on the settings document — both the account's and a planner's,
  which embed the same type.
- **How a structure carries its rigs.** Two slots on every kind, and the per-axis rule that reads
  them — not what a rig applies to, which is § Does not own.
- **The upgrade that gets there.** A schema bump and a fold, in memory and idempotent, on the pattern
  the existing `Invention` seed step set.
- **What the SPA holds a structure as**, and where reprocessing's rig and structure bonus calculations
  live once no class of its own holds them. The three classes became one in Stage B; Stage E makes that
  one a row and a set of functions, because the store and two screens share a mutable row between
  them.
- **What a screen reads** to list structures, once there is no lane to name.

**[market-price-delivery](../market-price-delivery/contents.md) was shelved until this project landed
a kind that is a market.** Stage D landed it, and that project has since finished: a citadel is read
in the browser on the reader's own characters.

**A market has left this model.** [market-locations](../market-locations/contents.md) moved a saved
market onto its own lane with its own panel — a reversal of where a market row lives, not of this
project's finding that the four build kinds belong in one shape. That project has promoted, which is
what this one waited on, so that gate has cleared — see [plan.md](./plan.md) § Status. What is left here
is the four build kinds, and **promotion now waits on Stage E** rather than on another project: it
changes the same sentence the promotion drafts would write about what the SPA holds.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **What a structure is for.** Costing a job in one, pricing a sale from one, or fetching a market
  held in one are the projects below; this one decides the row's shape and nothing about its meaning.
- **Which items a rig helps.** Every rig converted here applies to all of them, because the stored
  data never recorded a family. Giving manufacturing an item-family vocabulary and reading a rig
  against what is being built is [plan.md](./plan.md) § Stage BR2 — named there for what it inherits,
  and not scheduled by this project.
- **Pricing against a saved market**, including whether a citadel can be a market source and what
  `priceHub` means once a structure can be priced directly →
  [market-price-delivery/contents.md](../market-price-delivery/contents.md). That project waited on a
  saved location being able to *be* a market, which is a kind this model made expressible, and has
  since promoted.
- **What a sale costs** — broker fees, sales tax, the owner's rate →
  [planning-stage-panels/contents.md](../planning-stage-panels/contents.md), which handed the
  `SaleStructure` shape over as a proposal rather than a decision.
- **The settings screens' appearance**, already landed: they render one layout per component, and
  the four Custom Structures components share one form.
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
| Know why a structure carries two rig slots rather than one combined rig | [plan.md](./plan.md) § Stage BR, [overlay.md](./overlay.md) § Rigs became slots on every kind |
| Find the UI and job-setup work the rig change still needs | [plan.md](./plan.md) § Stage BR |
| Know why every rig applies to all items, and what reading one against an item would take | [plan.md](./plan.md) § Stage BR2, [overlay.md](./overlay.md) § What a rig applies to |
| Know why the SPA stops holding a structure as a class, and what replaces it | [plan.md](./plan.md) § Stage E |
| Understand how the Reprocessing page came to edit a saved structure | [measurements.md](./measurements.md) § The reprocessing page edits the saved structure |
| Size what the conversion touches | [measurements.md](./measurements.md) § What holds a structure as an instance |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
