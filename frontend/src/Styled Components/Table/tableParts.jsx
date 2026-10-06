import {
  Box,
  Collapse,
  Table,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";

import {
  FIGURE_TONE,
  BandCaption,
  Figure,
  FigureCaption,
  totalRowSx,
} from "../Typography/figures";
import InsetSurface from "../Paper/InsetSurface";

/**
 * @typedef {object} TableColumn
 * @property {string} id
 * @property {React.ReactNode} label
 * @property {'left'|'right'|'center'} [align]
 */

/**
 * A table's column headings, given as data so a panel can show a column only where it has something
 * to put in it.
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
 * A figures table that scrolls inside its panel below a theme breakpoint rather than squeezing its
 * columns: `sm` for a handful of columns, `md` for a wide one.
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

/**
 * A caption across a table naming the group of rows beneath it.
 *
 * @param {object} props
 * @param {number} props.colSpan - How many columns the table has
 * @param {React.ReactNode} props.children
 * @param {string} [props.tone] - One of FIGURE_TONE
 */
export function BandRow({ colSpan, children, tone = FIGURE_TONE.PLAIN }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={{ borderBottom: 0, pt: 2 }}>
        <BandCaption tone={tone}>{children}</BandCaption>
      </TableCell>
    </TableRow>
  );
}

/**
 * A row's drawer: a recessed area spanning the table under the row, mounted only while open so a
 * shut one holds no state.
 *
 * @param {object} props
 * @param {number} props.colSpan - How many columns the table has
 * @param {boolean} props.isOpen
 * @param {React.ReactNode} props.children
 */
export function DrawerRow({ colSpan, isOpen, children }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={{ p: 0, border: 0 }}>
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <InsetSurface
            sx={{ my: 1, contain: "inline-size", overflowX: "auto" }}
          >
            {children}
          </InsetSurface>
        </Collapse>
      </TableCell>
    </TableRow>
  );
}

/**
 * A row summing the figures above it, ruled above, or with `quiet` a lighter row taking something off
 * them; the label sits in the first column and each value under its column's id.
 *
 * @param {object} props
 * @param {TableColumn[]} props.columns - The table's columns
 * @param {React.ReactNode} props.label
 * @param {Object<string, React.ReactNode>} props.values - Keyed by column id; a number or text is a figure
 * @param {Object<string, string>} [props.tones] - One of FIGURE_TONE for a value, keyed by column id
 * @param {boolean} [props.quiet]
 */
export function SummaryRow({
  columns,
  label,
  values,
  tones = {},
  quiet = false,
}) {
  const cellSx = quiet ? { color: "text.secondary" } : totalRowSx;
  return (
    <TableRow>
      {columns.map((column, index) => {
        const value = index === 0 ? label : values[column.id];
        return (
          <TableCell
            key={column.id}
            align={column.align ?? "left"}
            sx={{ ...cellSx, whiteSpace: index === 0 ? undefined : "nowrap" }}
          >
            {index === 0 ||
            (typeof value !== "number" && typeof value !== "string") ? (
              value
            ) : (
              <Figure
                tone={tones[column.id]}
                sx={quiet ? undefined : { fontWeight: 500 }}
              >
                {value}
              </Figure>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
