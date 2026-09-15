import { Fragment } from "react";

import BlockIcon from "@mui/icons-material/Block";
import DoneIcon from "@mui/icons-material/Done";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LensIcon from "@mui/icons-material/Lens";
import {
  Box,
  Skeleton,
  IconButton,
  Stack,
  TableBody,
  TableCell,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";

import {
  FIGURE_TONE,
  Figure,
  SignedPercent,
} from "../../../../../../Styled Components/Typography/figures";
import {
  ColumnHeaderRow,
  ScrollingTable,
} from "../../../../../../Styled Components/Table/tableParts";
import ExplainerTooltip from "../../../../../../Styled Components/Tooltip/ExplainerTooltip";
import ItemMarketActions from "../../../../../../Styled Components/Item/marketActions";
import { getJobTypeAccentColour } from "../../../../../../Functions/Helper/jobTypeDividerColour";
import {
  getListingModeLabel,
  getMarketLocationLabel,
} from "./Helpers/marketLabelHelpers";
import { MATERIAL_MARK } from "../../../../../../Functions/MarketData/materialMark";
import StatusChip, {
  STATUS_TONE,
} from "../../../../../../Styled Components/Chip/statusChip";
import {
  MATERIAL_PLAN,
  hasSavingAvailable,
} from "../../../../../../Functions/MarketData/materialSourcingRow";
import ShortfallChip from "./shortfallChip";
import EveImageAvatar from "../../../../../../Styled Components/Avatar/EveImageAvatar";

/**
 * The material list, rendered once for the stage.
 *
 * A real table rather than a grid of boxes: this is tabular data with column
 * headers, and the semantics are what let a screen reader announce which figure
 * belongs to which column.
 */

// A figure or a market name split across two lines cannot be read. The item's
// name is the part that may wrap.
const NOWRAP_CELL_SX = { whiteSpace: "nowrap" };

const COLUMNS = [
  { id: "material", label: "Material", align: "left" },
  { id: "qty", label: "Qty", align: "right" },
  { id: "source", label: "Source", align: "right" },
  { id: "buy", label: "Market", align: "right" },
  { id: "build", label: "Build", align: "right" },
  { id: "delta", label: "Δ", align: "right" },
  { id: "plan", label: "Plan", align: "right" },
];

/**
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/materialSourcingRow").MaterialSourcingRow[]} props.rows
 * @param {(value: number) => string} props.formatIsk
 * @param {(value: number) => string} props.formatQuantity
 * @param {(typeID: number) => void} [props.onToggleRow] - Opens the row's drawer
 * @param {number[]} [props.openTypeIDs] - Rows currently expanded
 * @param {(row: object, isOpen: boolean) => React.ReactNode} [props.renderDrawer]
 *   What an opened row shows beneath itself
 * @param {(row: object) => React.ReactNode} [props.renderPlan] - The row's own
 *   buy-or-build control, in place of a chip that only states which it is on
 */
export default function MaterialsTable({
  rows = [],
  formatIsk,
  formatQuantity,
  onToggleRow,
  openTypeIDs = [],
  renderDrawer,
  renderPlan,
  isCosting = false,
}) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        This setup needs no materials.
      </Typography>
    );
  }

  const open = new Set(openTypeIDs);

  return (
    // Seven columns, two of them full ISK figures. A table with nothing to
    // scroll inside runs off the panel on a narrow window rather than fitting,
    // and the cards only take over below the sm breakpoint.
    <ScrollingTable minWidth="md" aria-label="Materials and sourcing">
      <ColumnHeaderRow columns={COLUMNS} />
      <TableBody>
        {rows.map((row) => (
          <Fragment key={row.typeID}>
            <MaterialRow
              row={row}
              isCosting={isCosting}
              formatIsk={formatIsk}
              formatQuantity={formatQuantity}
              isOpen={open.has(row.typeID)}
              onToggleRow={onToggleRow}
              renderPlan={renderPlan}
            />
            {renderDrawer ? (
              <TableRow>
                {/* The drawer belongs to its row, so it spans the table rather
                      than floating over it: more than one can be open, and each
                      stays with its row as the list scrolls. */}
                <TableCell colSpan={COLUMNS.length} sx={{ p: 0, border: 0 }}>
                  {renderDrawer(row, open.has(row.typeID))}
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        ))}
      </TableBody>
    </ScrollingTable>
  );
}

/**
 * @param {object} props
 */
function MaterialRow({
  row,
  formatIsk,
  formatQuantity,
  isOpen,
  onToggleRow,
  renderPlan,
  isCosting = false,
}) {
  const building = row.plan === MATERIAL_PLAN.BUILD;
  const saving = hasSavingAvailable(row);
  // Anything with a blueprint opens, linked or not: opening a row that has
  // never been linked is how a first child job gets created.
  const expandable = row.isBuildable;

  return (
    <TableRow
      hover={expandable}
      selected={isOpen}
      onClick={expandable ? () => onToggleRow?.(row.typeID) : undefined}
      sx={{
        cursor: expandable ? "pointer" : "default",
        // The stripe says the row needs a second look: it is building, it could
        // be building for less than it is being bought for, or what builds it
        // no longer makes enough.
        "& td:first-of-type": accentStripe(
          building,
          saving || Boolean(row.coverage?.isShort),
        ),
      }}
    >
      <TableCell>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <MaterialMark mark={row.mark} />
          {/* The item's own artwork: a player picks a row out by its icon well
              before reading the name beside it. */}
          <EveImageAvatar
            type={row.typeID}
            size={22}
            variant="rounded"
            sx={{ borderRadius: "3px" }}
          />
          <ItemMarketActions typeID={row.typeID} sx={{ minWidth: 0 }}>
            <Typography variant="body2" component="span" noWrap>
              {row.name}
            </Typography>
          </ItemMarketActions>
          <Box sx={{ flex: 1 }} />
          <ExpandAffordance
            expandable={expandable}
            isOpen={isOpen}
            name={row.name}
            onToggle={() => onToggleRow?.(row.typeID)}
          />
        </Box>
      </TableCell>
      <TableCell align="right" sx={NOWRAP_CELL_SX}>
        <Figure>{formatQuantity(row.quantity)}</Figure>
      </TableCell>
      <TableCell align="right" sx={NOWRAP_CELL_SX}>
        <SourceCell row={row} />
      </TableCell>
      <TableCell align="right" sx={NOWRAP_CELL_SX}>
        {row.buyPrice === null && row.plan !== MATERIAL_PLAN.PAID ? (
          // Nothing is selling it where this row is priced from, so it has no
          // market cost — which is not the same as costing nothing, and the
          // build total counts it for nothing either way.
          <ExplainerTooltip
            title={`No orders for ${row.name} at ${getMarketLocationLabel(
              row.marketLocation,
            )}, so the build cost does not include it`}
          >
            <StatusChip label="No orders" tone={STATUS_TONE.WARN} />
          </ExplainerTooltip>
        ) : (
          <Figure tone={cheaperTone(row.delta !== null && row.delta > 0)}>
            {row.buyPrice === null ? null : formatIsk(row.buyPrice)}
          </Figure>
        )}
      </TableCell>
      <TableCell align="right" sx={NOWRAP_CELL_SX}>
        {row.buildPrice === null && isCosting && row.isBuildable ? (
          // A row being priced and a row that cannot be built both showed a
          // dash, so a reader could not tell which was which.
          <Skeleton variant="text" width={72} sx={{ ml: "auto" }} />
        ) : (
          <Figure tone={cheaperTone(row.delta !== null && row.delta < 0)}>
            {row.buildPrice === null ? null : formatIsk(row.buildPrice)}
          </Figure>
        )}
      </TableCell>
      <TableCell align="right" sx={NOWRAP_CELL_SX}>
        <SignedPercent value={row.delta} />
      </TableCell>
      {/* The plan control acts on the row it sits on, so a click on it is not
          also a click on the row underneath asking to expand. */}
      <TableCell align="right" onClick={(event) => event.stopPropagation()}>
        <PlanCell
          plan={row.plan}
          saving={saving}
          coverage={row.coverage}
          childJobs={row.matchedChildJobs}
          action={renderPlan ? renderPlan(row) : null}
        />
      </TableCell>
    </TableRow>
  );
}

/**
 * What kind of material this is, and whether anything is building it.
 *
 * A tick where a child job is linked, a dot where none is, in the job type's
 * accent colour. Amber where something is pending against a material nothing is
 * linked to yet.
 *
 * A material the account excludes from builds is struck out and greyed instead.
 * Giving it amber too would say the same thing as pending, which is the opposite
 * meaning: pending wants a decision, exempt wants nothing. Both are legible
 * without hovering, which a tooltip alone is not.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/materialMark").MaterialMark} [props.mark]
 */
function MaterialMark({ mark }) {
  const theme = useTheme();
  if (!mark) return null;

  const colour = mark.isExempt
    ? theme.palette.text.disabled
    : mark.isUnsettled
      ? theme.palette.warning.main
      : getJobTypeAccentColour(theme, mark.jobType);

  const Glyph = mark.isExempt
    ? BlockIcon
    : mark.kind === MATERIAL_MARK.PLAIN
      ? LensIcon
      : DoneIcon;

  return (
    <ExplainerTooltip title={mark.label} placement="left-start" wrap={false}>
      <Box
        component="span"
        aria-label={mark.label}
        sx={{ display: "inline-flex", color: colour }}
      >
        <Glyph fontSize="small" />
      </Box>
    </ExplainerTooltip>
  );
}

/**
 * Marks the lower of a row's two prices, and nothing where there is only one.
 *
 * @param {boolean} isCheaper
 * @returns {string} One of FIGURE_TONE
 */
function cheaperTone(isCheaper) {
  return isCheaper ? FIGURE_TONE.GOOD : FIGURE_TONE.PLAIN;
}

/**
 * @param {object} props
 * @param {string} props.plan
 * @param {boolean} props.saving
 * @param {React.ReactNode} [props.action] - The buy-or-build control, where the
 *   row is one a player can decide. Without it the cell states the plan and no
 *   more, which is what a row with nothing to decide shows.
 */
function PlanCell({ plan, saving, coverage, childJobs, action }) {
  const short = <ShortfallChip coverage={coverage} childJobs={childJobs} />;

  if (plan === MATERIAL_PLAN.BASE) {
    return (
      <ExplainerTooltip title="Nothing builds this, so it is always bought">
        <Typography component="span" variant="caption" color="text.secondary">
          base
        </Typography>
      </ExplainerTooltip>
    );
  }

  if (plan === MATERIAL_PLAN.PAID) {
    return (
      <ExplainerTooltip title="Priced from what was actually paid, not the market">
        <StatusChip label="Paid" tone={STATUS_TONE.FACT} />
      </ExplainerTooltip>
    );
  }

  // The shortfall tag rides alongside whichever plan the row is on. A linked job
  // that has stopped producing has no build price, so its row reads as Buy — and
  // that is the row most in need of the tag rather than least.
  //
  // Tags first and the control last, both pinned right: a tag appearing on one
  // row and not the next would otherwise shift the control sideways, so it is
  // never twice in the same place.
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        justifyContent: "flex-end",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {short}
      {action ??
        (plan === MATERIAL_PLAN.BUILD ? (
          <ExplainerTooltip title="Set to be built by a job of its own">
            <StatusChip label="Build" tone={STATUS_TONE.GOOD} />
          </ExplainerTooltip>
        ) : (
          // Buying while building would cost less: the chip carries the warning
          // rather than a separate marker, so the row says it in one place.
          <ExplainerTooltip
            title={
              saving
                ? "Set to be bought, though building it would cost less"
                : "Set to be bought from the market"
            }
          >
            <StatusChip
              label="Buy"
              tone={saving ? STATUS_TONE.WARN : STATUS_TONE.NEUTRAL}
            />
          </ExplainerTooltip>
        ))}
    </Stack>
  );
}

/**
 * @param {boolean} building
 * @param {boolean} saving
 */
function accentStripe(building, saving) {
  if (saving)
    return {
      boxShadow: (theme) => `inset 3px 0 0 ${theme.palette.warning.main}`,
    };
  if (building) {
    return {
      boxShadow: (theme) => `inset 3px 0 0 ${theme.palette.success.main}`,
    };
  }
  return {};
}

export {
  MaterialRow,
  MaterialMark,
  PlanCell,
  SourceCell,
  ExpandAffordance,
  cheaperTone,
  accentStripe,
};

/**
 * Says that a row opens, and opens it.
 *
 * The row is clickable as a whole, but a pointer cursor and a hover tint are
 * only discoverable to a reader who has already tried it, and neither reaches a
 * keyboard at all. A chevron states it, and being a button makes the drawer
 * reachable by tab.
 *
 * @param {object} props
 * @param {boolean} props.expandable
 * @param {boolean} props.isOpen
 * @param {string} props.name - Named so one chevron in a list of them is
 *   distinguishable when announced
 * @param {() => void} props.onToggle
 */
function ExpandAffordance({ expandable, isOpen, name, onToggle }) {
  if (!expandable) return null;

  return (
    <IconButton
      size="small"
      aria-label={`${isOpen ? "Hide" : "Show"} what building ${name} would take`}
      aria-expanded={isOpen}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      sx={{
        p: 0.25,
        color: "text.secondary",
        transform: isOpen ? "rotate(180deg)" : "none",
        transition: (theme) =>
          theme.transitions.create("transform", {
            duration: theme.transitions.duration.shortest,
          }),
      }}
    >
      <ExpandMoreIcon fontSize="small" />
    </IconButton>
  );
}

/**
 * Where the row's buy price came from: the hub, and which of the four figures
 * the server publishes for it.
 *
 * A row priced from a real purchase names Price Entry instead: there is no
 * market figure behind it, and repeating the plan chip's "Paid" would say the
 * same thing twice on one row.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/materialSourcingRow").MaterialSourcingRow} props.row
 */
function SourceCell({ row }) {
  if (row.plan === MATERIAL_PLAN.PAID) {
    return (
      <Typography variant="caption" color="text.secondary">
        Price Entry
      </Typography>
    );
  }

  return (
    <Typography variant="caption" color="text.secondary" noWrap>
      {getMarketLocationLabel(row.marketLocation)} ·{" "}
      {getListingModeLabel(row.listingType)}
    </Typography>
  );
}
