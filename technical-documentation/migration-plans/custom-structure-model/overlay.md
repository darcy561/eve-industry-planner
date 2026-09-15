# Custom structure model — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this
file has no entry. Fill a section as its slice lands; do not pre-write behaviour that has not shipped.

Promote target on go-ahead: [frontend/](../../frontend/contents.md) and
[backend/](../../backend/contents.md).

## Stage A — One shape, server side

*Nothing landed yet.*

Sections to fill: the folded type and what became of the four lanes; whether `CustomStructures` kept a
wrapper or the document holds the array directly, and why; the v1→v2 step, how a legacy row without a
`jobType` gets one, and what proves the fold is idempotent; what the planner settings clone became.

## Stage B — One class, SPA side

*Nothing landed yet.*

Sections to fill: the one class and how a kind's optional fields are settled; where reprocessing's
`rigBonusFor` and `structureBonusFor` live now; the `InventionStructure` tax validation gap, fixed as
the fold happened; what the store slices hold.

## Stage C — The surfaces

*Nothing landed yet.*

Sections to fill: what a screen reads to list structures of one kind; what the reprocessing panel
reads; anything the accounts-page card work assumed about lanes that had to move with them.

## Missing live SoT found on the way

*Nothing recorded yet.* Live documentation gaps discovered while working land here first and are
folded into the live topic docs on promote.
