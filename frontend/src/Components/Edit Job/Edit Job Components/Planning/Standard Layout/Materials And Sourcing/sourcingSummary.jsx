import { Alert, Button, CircularProgress } from "@mui/material";
import ExplainerTooltip from "../../../../../../Styled Components/Tooltip/ExplainerTooltip";

import { PanelFooterMeta } from "../../../../../../Styled Components/Typography/figures";

/**
 * What the panel states above and below its table: an offer where building some
 * rows would cost less, and what the list holds.
 */

/**
 * The offer to switch every row that would cost less to build.
 *
 * Absent when there is nothing to gain, rather than shown as a zero — a strip
 * saying a change would save nothing is an invitation to make it.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/materialSourcingRow").SourcingSummary} props.summary
 * @param {(value: number) => string} props.formatIsk
 * @param {() => void} props.onApply
 * @param {boolean} [props.disabled]
 */
export function SourcingOffer({
  summary,
  formatIsk,
  onApply,
  disabled = false,
}) {
  if (!summary || summary.savingAvailable <= 0) return null;

  return (
    <Alert
      severity="success"
      variant="outlined"
      action={
        <ExplainerTooltip title="Links a child job for every row that is cheaper to build, not just one">
          <Button
            color="inherit"
            size="small"
            onClick={onApply}
            disabled={disabled}
          >
            Apply
          </Button>
        </ExplainerTooltip>
      }
      sx={{ alignItems: "center", py: 0 }}
    >
      Building {summary.cheaperToBuild} of {summary.buildable} saves{" "}
      {formatIsk(summary.savingAvailable)}
    </Alert>
  );
}

/**
 * What the list holds, and how much room it takes.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/materialSourcingRow").SourcingSummary} props.summary
 * @param {(value: number) => string} props.formatVolume
 */
export function SourcingFooter({ summary, formatVolume }) {
  if (!summary) return null;

  const parts = [
    `${summary.materials} ${summary.materials === 1 ? "material" : "materials"}`,
    `${summary.buildable} buildable`,
    `${summary.linked} linked`,
  ];

  return (
    <PanelFooterMeta value={formatVolume(summary.volume)}>
      {parts.join(" \u00b7 ")}
    </PanelFooterMeta>
  );
}

/**
 * Asks for the buildable rows to be costed.
 *
 * A control rather than something the panel does on arrival: pricing a row means
 * building a whole speculative job for it, blueprint and ESI hydration included,
 * and most visitors to a job are not asking that question.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/materialSourcingRow").SourcingSummary} props.summary
 * @param {number} props.uncosted - Buildable rows with no build price yet
 * @param {() => void} props.onCost
 * @param {boolean} [props.isCosting]
 * @param {boolean} [props.disabled]
 */
export function SourcingCostOffer({
  summary,
  uncosted,
  onCost,
  isCosting = false,
  disabled = false,
}) {
  if (!summary || uncosted <= 0) return null;

  return (
    <Alert
      severity="info"
      variant="outlined"
      icon={false}
      action={
        <ExplainerTooltip title="Works out what each of these would cost to build, which fetches a blueprint for every one">
          <Button
            color="inherit"
            size="small"
            onClick={onCost}
            disabled={disabled || isCosting}
            startIcon={
              isCosting ? <CircularProgress size={14} color="inherit" /> : null
            }
          >
            {isCosting ? "Costing" : "Cost them"}
          </Button>
        </ExplainerTooltip>
      }
      sx={{ alignItems: "center", py: 0 }}
    >
      {uncosted} of {summary.buildable} buildable{" "}
      {uncosted === 1 ? "material has" : "materials have"} no build price yet
    </Alert>
  );
}
