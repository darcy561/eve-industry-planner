# Figure and status atoms (`Styled Components/Typography`, `Styled Components/Chip`)

Live SoT for how a panel states a number, a change or a state, and how it lays several of them out,
so two panels beside each other read a figure the same way.

## Figures

`Figure`
([`Styled Components/Typography/figures.jsx`](../../../frontend/src/Styled%20Components/Typography/figures.jsx))
lines a value up with tabular numerals and renders an em dash for a value the app does not have,
rather than a gap or a zero. A raw number is put through the locale formatter — `formatOptions` sets
the decimal places, since ISK's default of two is not every figure's right answer — and a value already
formatted as a string is used as given. `tone` (`FIGURE_TONE.PLAIN` / `GOOD` / `BAD` / `WARN`) colours
it; `figureToneColour(tone)` resolves the same tone to a theme colour for a place that has to reach
something that is not a `Figure` — an icon, a border, a chart series.

`SignedPercent` is a `Figure` taking a **fraction** rather than a percentage (`-0.083` renders as
`−8.3%`), coloured by whether the direction is the good one: `lowerIsBetter` says which way a fall
reads.

`FigureRow` is the label-and-value line a breakdown is made of. `isTotal` rules the row above rather
than below, so it reads as the sum of what is over it rather than the start of what is under it.
`HeadlineStat` is the figure a panel leads with: a `FigureCaption` naming it, then the number at `lead`
or `beside` size. `PanelFooterMeta` is the quiet line under a panel, a label on the left and a value on
the right. `FigureCaption` is the caption above a figure or a control — `FormField` (see
[forms.md](./forms.md)) renders it for a control's label, so a panel names a control and a number the
same way.

`StatTile` is a measure on its own card: what it is, what it is now, how that compares (`change`,
`changeTone`), and what it was before (`comparison`). It carries its own `isLoading`, drawing a
tile-shaped skeleton rather than a panel's own loading fallback, because the two are sized for
different amounts of content.

## Laying figures out

`PanelHeadline` is what a panel opens with: the figure it leads on, and an `aside` standing beside it
— a range of previous builds next to a cost per unit, three normalisations next to a net. The aside
grows into whatever the headline leaves, so one that needs the width can take it while one made of
fixed tiles stays against the right edge.

`BandCaption` names a group of rows beneath it. It carries no table of its own, so a panel laying its
rows out in a stack captions them the way a table's band row does. `totalRowSx` is the other half of
that: the rule a closing row is drawn with, shared because a table cell and a flex row were each
deciding separately what a total looks like.

`ContextRow` states a relationship between two figures and leaves it there — a break-even, a range —
with an optional `note` carrying the qualification. It is deliberately quiet and takes no tone of its
own, because it reads as context rather than as a result.

`Disclosure` is a section a reader opens when they want the working: the ledger behind a return, the
cost-over-time chart behind a breakdown. `onOpen` fires **the first time only**, so a section whose
contents are expensive enough to fetch on demand does not re-fetch each time it is folded away and
back.

## Status

`StatusChip`
([`Styled Components/Chip/statusChip.jsx`](../../../frontend/src/Styled%20Components/Chip/statusChip.jsx))
names a state rather than leaving a panel to choose its own colour for it: `tone` is one of
`STATUS_TONE.GOOD` / `WARN` / `FACT` / `NEUTRAL`, each mapped once to an MUI chip colour.
