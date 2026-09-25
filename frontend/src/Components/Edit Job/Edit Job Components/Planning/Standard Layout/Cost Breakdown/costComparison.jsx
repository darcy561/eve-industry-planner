import { Box, Stack, Typography } from "@mui/material";

import {
  RangeBar,
  rangeMarkSx,
} from "../../../../../../Styled Components/Charts";
import {
  FigureCaption,
  SignedPercent,
} from "../../../../../../Styled Components/Typography/figures";
import { monthLabel } from "../Archive Jobs Panel/buildHistoryFigures";

// Takes the width the headline leaves rather than sitting at a fixed size: a
// range bar is read by where the marker falls along it, and a narrow one puts
// every build in much the same place.
const wrapper = { flex: "1 1 210px", minWidth: 210 };

/**
 * This build's cost placed among the ones already archived.
 *
 * Stands beside the headline rather than under it: it qualifies the cost per
 * unit, and a reader who has never archived a build should meet the cost itself
 * without an empty comparison beside it.
 *
 * @param {object} props
 * @param {ReturnType<import("../../../../../../Functions/Job/buildComparison.js").compareToHistory>} props.comparison
 * @param {(value: number) => string} props.formatIsk
 */
export default function CostComparison({ comparison, formatIsk }) {
  const { bar, delta, last, outside, average, builds } = comparison ?? {};

  // A first build is information: it says the estimate has nothing to be checked
  // against, which is the same thing a signed-out reader sees.
  if (!comparison || builds < 1) {
    return (
      <Box sx={wrapper}>
        <Box
          sx={{
            border: 1,
            borderStyle: "dashed",
            borderColor: "divider",
            borderRadius: 0.75,
            px: 1.375,
            py: 1.125,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            No archived builds of this item yet — nothing to compare against.
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={wrapper}>
      {/* The count belongs here rather than under the middle of the bar, where
          it read as a label for whatever the midpoint is. What the figures are
          is said once, by the headline this sits beside. */}
      <FigureCaption>
        Against your {builds} {builds === 1 ? "build" : "builds"}
      </FigureCaption>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {bar ? (
          <RangeBar
            low={bar.low}
            high={bar.high}
            value={bar.value}
            average={bar.average}
            // What the picture means, not what it says: every figure in it is
            // written underneath, and ISK figures are too long to read in a
            // tooltip.
            label="Where this build's cost per unit falls between the cheapest and dearest you have archived. The upright mark is their average."
            // Said as well as read: two numbers under a line do not say which
            // end is the cheap one.
            labels={[
              `cheapest ${formatIsk(bar.low)}`,
              `dearest ${formatIsk(bar.high)}`,
            ]}
          />
        ) : null}

        {/* Each mark named beside the figure it stands for. The bar draws two
            of them and neither says what it is, so the upright one was a line
            in the middle of a picture with no way to find out. */}
        {bar ? (
          <Stack
            direction="row"
            spacing={1.5}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            {/* No figure against this build: it is the headline beside this. */}
            <MarkKey mark="value">this build</MarkKey>
            <MarkKey mark="average">average {formatIsk(average)}</MarkKey>
          </Stack>
        ) : null}

        {outside ? (
          <Typography variant="caption" color="text.secondary">
            {outside === "below"
              ? "Cheaper than any build you have archived"
              : "Dearer than any build you have archived"}
          </Typography>
        ) : null}

        {last ? (
          <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
            <Typography variant="caption" color="text.secondary">
              vs last build
              {monthLabel(last.month) ? ` (${monthLabel(last.month)})` : ""}
            </Typography>
            <SignedPercent value={delta?.share ?? null} variant="caption" />
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * One of the bar's marks, drawn the same way it is drawn on the bar, beside what
 * it stands for.
 *
 * @param {object} props
 * @param {"value"|"average"} props.mark
 * @param {React.ReactNode} props.children
 */
function MarkKey({ mark, children }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.625 }}>
      <Box sx={rangeMarkSx(mark)} />
      <Typography variant="caption" color="text.secondary">
        {children}
      </Typography>
    </Box>
  );
}
