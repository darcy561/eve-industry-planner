import {
  Box,
  TableBody,
  TableCell,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";

import {
  BandCaption,
  FIGURE_TONE,
  Figure,
  totalRowSx,
} from "../../../../../../Styled Components/Typography/figures";
import {
  ColumnHeaderRow,
  ScrollingTable,
} from "../../../../../../Styled Components/Table/tableParts";
import { costPartColour, extrasIdsOf } from "./costParts";

/**
 * What the cost is made of, one line per part.
 *
 * One set of figures, on the model the panel header names as in effect. Each
 * line says in words what its figure is made of, because a number alone does
 * not say how much of the build it covers.
 */

// A figure split across two lines cannot be read as a number.
const FIGURE_CELL_SX = { whiteSpace: "nowrap" };

const COLUMNS = [
  { id: "component", label: "Component", align: "left" },
  { id: "total", label: "Total", align: "right" },
  { id: "perUnit", label: "Per unit", align: "right" },
];

/**
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/costBreakdown").CostBreakdown} props.cost
 * @param {(value: number) => string} props.formatIsk
 * @param {string|null} [props.activeId] - The part being looked at, on the bar
 *   above or here, so the two always agree about which one it is
 * @param {(id: string|null) => void} [props.onActivePart] - Supplied by a panel
 *   that draws the bar as well; without it the rows are inert
 */
export default function CostTable({
  cost,
  formatIsk,
  activeId = null,
  onActivePart,
}) {
  // The extras take a shade each of one colour, so a row has to know which of
  // them it is. Read from the whole breakdown, since the two bands are drawn
  // separately below.
  const extrasIds = extrasIdsOf([
    ...(cost.toBuild?.lines ?? []),
    ...(cost.toSell?.lines ?? []),
  ]);
  // Per unit comes from the figures rather than being divided again here: two
  // divisions of the same numbers is how two totals that disagree begin.
  const perUnit = (value) => (value === null ? null : formatIsk(value));

  return (
    // Two full ISK figures and a label do not fit a narrow desktop window, and a
    // table with nothing to scroll inside simply runs off the panel. Below the
    // floor it scrolls here rather than squeezing the label to one word a line.
    <ScrollingTable minWidth="sm" aria-label="Cost breakdown">
      <ColumnHeaderRow columns={COLUMNS} />
      <TableBody>
        {cost.toBuild.lines.map((line) => (
          <CostRow
            key={line.id}
            line={line}
            formatIsk={formatIsk}
            perUnit={perUnit}
            isActive={activeId === line.id}
            extrasIds={extrasIds}
            onActivePart={onActivePart}
          />
        ))}
        <SubtotalRow
          label="Cost to build"
          value={cost.toBuild.total}
          valuePerUnit={cost.toBuild.perUnit}
          formatIsk={formatIsk}
          perUnit={perUnit}
        />

        {cost.toSell.lines.length > 0 ? (
          <>
            <BandRow label="Cost to sell — estimated, if you list it" />
            {cost.toSell.lines.map((line) => (
              <CostRow
                key={line.id}
                line={line}
                formatIsk={formatIsk}
                perUnit={perUnit}
                isActive={activeId === line.id}
                extrasIds={extrasIds}
                onActivePart={onActivePart}
              />
            ))}
            <SubtotalRow
              label="Cost to build and sell"
              value={cost.total}
              valuePerUnit={cost.perUnit}
              formatIsk={formatIsk}
              perUnit={perUnit}
            />
          </>
        ) : null}
      </TableBody>
    </ScrollingTable>
  );
}

/**
 * @param {object} props
 */
function CostRow({
  line,
  formatIsk,
  perUnit,
  isActive = false,
  extrasIds = [],
  onActivePart,
}) {
  const theme = useTheme();

  return (
    <TableRow
      data-active={isActive ? "true" : undefined}
      // Hover only, where the bar above also takes focus: a segment is a shape
      // with nothing written on it, so reaching it by keyboard is the only way
      // to find out what it is. A row already says what it is and what it cost.
      onMouseEnter={() => onActivePart?.(line.id)}
      onMouseLeave={() => onActivePart?.(null)}
      sx={{
        bgcolor: isActive ? "action.hover" : undefined,
        transition: theme.transitions.create("background-color", {
          duration: theme.transitions.duration.shortest,
        }),
      }}
    >
      <TableCell>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          {/* Ties the row to its segment of the bar above. */}
          <Box
            sx={{
              width: 9,
              height: 9,
              borderRadius: "2px",
              flexShrink: 0,
              bgcolor: costPartColour(theme, line.id, extrasIds),
            }}
          />
          <Typography variant="body2">{line.label}</Typography>
        </Box>
        {line.detail ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", pl: "17px" }}
          >
            {line.detail}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell align="right" sx={FIGURE_CELL_SX}>
        <Figure>{formatIsk(line.value)}</Figure>
      </TableCell>
      <TableCell align="right" sx={FIGURE_CELL_SX}>
        <Figure>{perUnit(line.perUnit)}</Figure>
      </TableCell>
    </TableRow>
  );
}

/**
 * Closes a band, drawn the way every total in the app is.
 *
 * @param {object} props
 */
function SubtotalRow({ label, value, valuePerUnit, formatIsk, perUnit }) {
  return (
    <TableRow>
      <TableCell sx={totalRowSx}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ ...totalRowSx, ...FIGURE_CELL_SX }}>
        <Figure sx={{ fontWeight: 500 }}>{formatIsk(value)}</Figure>
      </TableCell>
      <TableCell align="right" sx={{ ...totalRowSx, ...FIGURE_CELL_SX }}>
        <Figure sx={{ fontWeight: 500 }}>{perUnit(valuePerUnit)}</Figure>
      </TableCell>
    </TableRow>
  );
}

/**
 * Puts a band caption in a table row. The caption itself is table-free, so a
 * panel stacking rows rather than tabulating them uses the same one.
 *
 * @param {object} props
 */
function BandRow({ label }) {
  return (
    <TableRow>
      <TableCell colSpan={COLUMNS.length} sx={{ borderBottom: 0, pt: 2 }}>
        <BandCaption tone={FIGURE_TONE.WARN}>{label}</BandCaption>
      </TableCell>
    </TableRow>
  );
}
