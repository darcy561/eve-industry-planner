# Materials & Sourcing (`Edit Job Components/Planning/Standard Layout/Materials And Sourcing`)

Live SoT for what a build takes and whether each material is bought or built.
`MaterialsAndSourcingPanel` draws the stage's one material list: the requirement, how each row is
priced, and what a row would cost built instead of bought, in a single table.

Selling charges and who they are quoted for are [selling-charges.md](./selling-charges.md)'s; what a
build costs in total, including this panel's figures, is [cost-breakdown.md](./cost-breakdown.md)'s.

## The row

Each row states its own comparison rather than leaving a reader to work it out from separate columns:

| Column | States |
|--------|--------|
| **Qty** | The requirement, carrying the job-type mark and the linked tick |
| **Source** | The hub and which of the four server price modes priced the row, or *Price Entry* where the figure is a real purchase |
| **Build** / **Δ** | What a linked child job's build would cost per unit, and what that saves or costs against buying |
| **Plan chip** | Bought, built, or paid — and on a buildable row, the buy-or-build control itself, with an undo |

A row whose material has a Price Entry purchase reads **Paid**; one bought in part states both what
was paid and what remains to buy. A row priced from the market can be overridden per row through
`useMaterialOverrides` — the override outranks the panel's own pricing order type and hub for that row
only, and the order type picker in the panel header counts how many rows currently depart from it.

`useMaterialsSourcing` builds every row in one walk; every other consumer on the panel — the drawer,
the footer, the offer strip — reads its output rather than recomputing.

## The pricing order type

The panel header carries the **pricing order type** (`buy`, `sell`, `buyP95`, `sellP05`) and the **hub**
together, since both decide what a row's buy figure is. `Styled Components/Select/pricingOrderType.jsx`
shows each mode with what it does to this job's total; `Functions/MarketData/defaults/materialPricing.js`
computes those totals, honouring a row's own override on every candidate, and reports the age of the
stalest price behind the total — the server refreshes on a period of hours, so a total is only as
fresh as its oldest input.

## The child-job drawer

Each buildable row opens an inline drawer under itself — an inset surface, not a dialogue, since more
than one can stay open while the list scrolls. A press anywhere on the row, or on its chevron
(`ExpandToggle`), opens it, and a press on its plan chip does not. An open row takes the open-row tint —
a table row through MUI's `selected`, a phone card through `openRowBackground` — so it is marked the way
a Setups row is. It states the linked child job's own totals
(`calculateChildJobTotals`), its own hub and order type, and a shortfall against the requirement it does
not cover (see below). A build the drawer cannot cost says so rather than drawing an empty
comparison.

Opening a row that is not yet linked to a child job **costs it on demand** rather than on load:
`buildSingleChildJobPreview` builds a real, unlinked job in the background, and the figure it produces
is recorded against the row — the same place the panel's bulk-costing control writes to — so opening
the row again re-reads the same figure rather than pricing it twice. Costing every buildable row on
page load is avoided the same way expensive per-visitor data is avoided everywhere else in the app; a
control on the summary strip ("Building N of M saves X") costs every buildable row in one action
instead.

Deciding a row — taking the Build offer, or reverting to Buy — drops whatever it was costed with: the
speculative figure described a job that has since either become real or been discarded, and a row
returned to Buy is offered for costing again rather than kept at a stale price.

**Speculative jobs live in their own store slice**, separate from the jobs a player has actually
committed to. A speculative job read as committed would carry every consequence of one — it would
count as linked, switch the row to Build, and mark the document modified — before the player had
agreed to anything, so the two are kept apart deliberately rather than merged for convenience.

In a group, a speculative job is seeded from the job it would link to, plus this parent's extra
quantity, so accepting the offer updates the existing job's run count and links it in one action.

## Costing a shortfall

A linked child job is sized to the requirement when it is created, and stays that size until the
parent closes and only then if automatic recalculation is on — every change to the parent's runs,
efficiency or setup in between leaves it producing the wrong amount. `Functions/Groups/childJobCoverage.js`
allocates a material's requirement across every contributing job once, so a material built by two
child jobs is costed between them rather than double-counted, and reports what they cover, what they
fall short by, and which of three ways the difference is costed:

| The child job is | How the shortfall is costed |
|-------------------|------------------------------|
| Not committed yet | At the child's own rate — committing resizes it to the requirement first |
| Committed, automatic recalculation on | At the child's own rate, stated as an assumption |
| Committed, automatic recalculation off | Bought at market |

Two cases are exempt from resizing on commit: several jobs producing one item divide the requirement
between them, and a job the group already runs may be feeding something else, so sizing it to one
row's requirement would take its supply away silently. A row that is both short and partly paid for
covers the shortfall from what is still needed first — the paid units come off the shortfall rather
than off the build, since the child jobs produce what they produce regardless of what was bought
separately.

A row that falls short carries a **shortfall tag** beside its plan chip, naming the affected jobs in
its tooltip, with the same accent stripe a row wanting a second look takes. The drawer states the
shortfall in full as a warning. Cost Breakdown carries it in the bands — a bought shortfall lands in
*Materials bought at market*, and a build line covering more than its jobs produce says it assumes a
resize on close.

## Layout

On the standard layout the stage is two columns side by side, a flex row with a gap of 2 between them:
Output, the Blueprint Library and Skills in the narrow column, and Setups, Materials & Sourcing, Cost
Breakdown and Returns, and Build History in the wide one. `MaterialsAndSourcingPanel` and its sibling
panels are stacked in those columns rather than laid out in a shared grid row, so each sets
`AppShellPanel`'s `paperSx={{ height: "auto" }}` — see [../technical-rules.md](../technical-rules.md)
§ Stacked panels. Below `sm`, the
table becomes cards — name and plan chip on one line, the four figures on the next — and the
pricing-order type picker opens as a bottom sheet instead of an anchored menu; the child-job drawer stays
an inline collapse on every layout, since it already opens under its own row.
