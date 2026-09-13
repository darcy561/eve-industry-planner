import { Box, Table, TableCell, TableHead, TableRow } from "@mui/material";

import { FigureCaption } from "../Typography/figures";

/**
 * The parts a figures table is made of, so a panel describes its columns rather
 * than laying out a header.
 */

/**
 * @typedef {object} TableColumn
 * @property {string} id
 * @property {React.ReactNode} label
 * @property {'left'|'right'|'center'} [align]
 */

/**
 * A table's column headings.
 *
 * Takes the columns rather than fixing them, because a panel may show one only
 * when it has something to put in it — the cost table's comparison against a
 * previous build appears only where there is history.
 *
 * @param {object} props
 * @param {TableColumn[]} props.columns
 */
export function ColumnHeaderRow({ columns }) {
  return (
    <TableHead>
      <TableRow>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            align={column.align ?? "left"}
            sx={{ whiteSpace: "nowrap", py: 0.5 }}
          >
            <FigureCaption>{column.label}</FigureCaption>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}

/**
 * A figures table that fits the panel it sits in.
 *
 * A table left to itself does not fit a narrow window — it squeezes its label
 * column to a word a line and still runs off the side of the panel, because
 * nothing contains it. Below its floor this scrolls instead, which keeps every
 * column readable and the overflow inside the panel.
 *
 * The floor is a **theme breakpoint**, named the way the rest of the app names
 * them, so there is one vocabulary for width across the SPA rather than a pixel
 * figure per table drifting on its own. Pick the breakpoint a table's columns
 * need room beyond: `sm` for a handful of columns, `md` for a wide one.
 *
 * A breakpoint is a viewport measure and a table's need is a content one, so a
 * table scrolls somewhat before its columns would actually collide. That is the
 * cost of one vocabulary, and it errs toward scrolling rather than toward
 * squeezing a column.
 *
 * @param {object} props
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} props.minWidth - The breakpoint below which it scrolls
 * @param {React.ReactNode} props.children
 * @param {object} [props.sx] - Styling for the table itself
 * @returns {JSX.Element}
 */
export function ScrollingTable({ minWidth, children, sx, ...rest }) {
  return (
    <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
      <Table
        size="small"
        sx={{
          minWidth: (theme) => theme.breakpoints.values[minWidth],
          ...sx,
        }}
        {...rest}
      >
        {children}
      </Table>
    </Box>
  );
}
