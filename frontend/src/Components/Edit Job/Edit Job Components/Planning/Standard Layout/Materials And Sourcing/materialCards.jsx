import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";

import {
  Figure,
  SignedPercent,
} from "../../../../../../Styled Components/Typography/figures";
import {
  MATERIAL_PLAN,
  hasSavingAvailable,
} from "../../../../../../Functions/MarketData/materialSourcingRow";
import StatusChip, {
  STATUS_TONE,
} from "../../../../../../Styled Components/Chip/statusChip";
import { eveImageSize } from "../../../../../../Functions/Shared/eveOwner";
import { formatCompactNumber } from "../../../../../../Functions/Helper/numberParser";
import {
  ExpandAffordance,
  MaterialMark,
  PlanCell,
  SourceCell,
  accentStripe,
  cheaperTone,
} from "./materialsTable";

/**
 * The material list at phone width.
 *
 * A seven-column table cannot survive a 360px stack; the figures can. Each
 * material becomes a card — what it is and the plan on one line, the four
 * figures on the next — so nothing is truncated and no column is dropped.
 *
 * The row's own decisions are imported rather than reproduced: which stripe a
 * row carries, which of the two prices is the cheaper, and what the plan chip
 * says are the same answers at either width.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/materialSourcingRow").MaterialSourcingRow[]} props.rows
 * @param {(value: number) => string} props.formatIsk
 * @param {(value: number) => string} props.formatQuantity
 * @param {(typeID: number) => void} [props.onToggleRow]
 * @param {number[]} [props.openTypeIDs]
 * @param {(row: object, isOpen: boolean) => React.ReactNode} [props.renderDrawer]
 * @param {(row: object) => React.ReactNode} [props.renderPlan]
 */
export default function MaterialCards({
  rows,
  formatIsk,
  formatQuantity,
  onToggleRow,
  openTypeIDs = [],
  renderDrawer,
  renderPlan,
  isCosting = false,
}) {
  return (
    <Stack spacing={1}>
      {rows.map((row) => {
        const isOpen = openTypeIDs.includes(row.typeID);

        return (
          <Box key={row.typeID}>
            <MaterialCard
              row={row}
              isCosting={isCosting}
              formatIsk={formatIsk}
              formatQuantity={formatQuantity}
              isOpen={isOpen}
              onToggleRow={onToggleRow}
              renderPlan={renderPlan}
            />
            {renderDrawer ? renderDrawer(row, isOpen) : null}
          </Box>
        );
      })}
    </Stack>
  );
}

/**
 * @param {object} props
 */
function MaterialCard({
  row,
  formatIsk,
  formatQuantity,
  isOpen,
  onToggleRow,
  renderPlan,
  isCosting = false,
}) {
  const expandable = row.isBuildable;

  return (
    <Box
      onClick={expandable ? () => onToggleRow?.(row.typeID) : undefined}
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        p: 1.25,
        cursor: expandable ? "pointer" : "default",
        ...accentStripe(
          row.plan === MATERIAL_PLAN.BUILD,
          hasSavingAvailable(row) || Boolean(row.coverage?.isShort),
        ),
        ...(isOpen ? { bgcolor: "action.hover" } : {}),
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}
        >
          <MaterialMark mark={row.mark} />
          <Box
            component="img"
            src={`https://images.evetech.net/types/${row.typeID}/icon?size=${eveImageSize(18)}`}
            alt=""
            loading="lazy"
            sx={{ width: 18, height: 18, borderRadius: "3px", flexShrink: 0 }}
          />
          <Typography variant="body2" noWrap>
            {row.name}
          </Typography>
          <ExpandAffordance
            expandable={row.isBuildable}
            isOpen={isOpen}
            name={row.name}
            onToggle={() => onToggleRow?.(row.typeID)}
          />
        </Box>
        <Box onClick={(event) => event.stopPropagation()}>
          <PlanCell
            plan={row.plan}
            saving={hasSavingAvailable(row)}
            coverage={row.coverage}
            childJobs={row.matchedChildJobs}
            action={renderPlan ? renderPlan(row) : null}
          />
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          gap: 1,
          mt: 0.75,
        }}
      >
        <CardFigure
          label="Qty"
          value={row.quantity}
          full={formatQuantity(row.quantity)}
        />
        {row.buyPrice === null && row.plan !== MATERIAL_PLAN.PAID ? (
          // No market cost is not the same as costing nothing, and the build
          // total counts it for nothing either way.
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              Market
            </Typography>
            <StatusChip label="No orders" tone={STATUS_TONE.WARN} />
          </Box>
        ) : (
          <CardFigure
            label="Market"
            value={row.buyPrice}
            full={row.buyPrice === null ? null : formatIsk(row.buyPrice)}
            tone={cheaperTone(row.delta !== null && row.delta > 0)}
          />
        )}
        <CardFigure
          label="Build"
          value={row.buildPrice}
          full={row.buildPrice === null ? null : formatIsk(row.buildPrice)}
          tone={cheaperTone(row.delta !== null && row.delta < 0)}
          // Being priced is not the same as cannot be built, and both showed a
          // dash.
          isPending={row.buildPrice === null && isCosting && row.isBuildable}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Δ
          </Typography>
          <SignedPercent value={row.delta} />
        </Box>
      </Box>

      <Box sx={{ mt: 0.5, borderTop: 1, borderColor: "divider", pt: 0.5 }}>
        <SourceCell row={row} />
      </Box>
    </Box>
  );
}

/**
 * A figure shortened to fit the card, with the full value on tap.
 *
 * Shortening a figure costs a reader nothing they cannot get back; truncating a
 * label costs them the label.
 *
 * @param {object} props
 * @param {number|null} props.value - The raw figure, shortened for display
 * @param {string|null} props.full - The same figure in full, shown on tap
 */
function CardFigure({ label, value, full, tone, isPending = false }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        {label}
      </Typography>
      {isPending ? (
        <Skeleton variant="text" width={64} />
      ) : (
        <Tooltip title={full ?? ""} enterTouchDelay={0}>
          <span>
            <Figure tone={tone}>
              {value === null || value === undefined
                ? null
                : formatCompactNumber(value)}
            </Figure>
          </span>
        </Tooltip>
      )}
    </Box>
  );
}
