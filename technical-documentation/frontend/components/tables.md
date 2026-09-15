# Tables that fit their panel (`Styled Components/Table`)

Live SoT for how a figures table stays inside the panel it sits in on a narrow window.

`ScrollingTable` in
[`Styled Components/Table/tableParts.jsx`](../../../frontend/src/Styled%20Components/Table/tableParts.jsx)
wraps an MUI `Table` in a horizontally scrolling box. Below `minWidth` — a theme breakpoint (`sm` for a
handful of columns, `md` for a wide one), named the way the rest of the SPA names breakpoints rather
than a pixel figure per table drifting on its own — the table scrolls instead of squeezing its columns,
so every column stays readable and the overflow stays inside the panel rather than running past its
edge.

A breakpoint is a viewport measure and a table's need is a content one, so a table scrolls somewhat
before its columns would actually collide — the cost of one vocabulary for width across the SPA, and it
errs toward scrolling rather than toward squeezing a column. A table's figures never wrap; only a row's
name may.

`ColumnHeaderRow`, in the same file, draws a table's column headings as a `FigureCaption` per column
(see [figures.md](./figures.md)), so a table's header names its columns the same way everything else
naming a figure does. It takes the columns as data rather than fixing them, so a panel shows a column
only where it has something to put in it.
