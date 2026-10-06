import { Box, Typography } from "@mui/material";

import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import { EvenColumns } from "../../../../../../Styled Components/Paper/EvenColumns";
import {
  FIGURE_TONE,
  Figure,
  FigureRow,
} from "../../../../../../Styled Components/Typography/figures";
import {
  formatNumberForLocale,
  formatPercentage,
} from "../../../../../../Functions/Helper/numberParser";
import { EXIT_ROUTE } from "../../../../../../Functions/Job/figures/returns.js";

/**
 * The ways out of a finished build, side by side at equal weight, since which a player wants is not
 * something the app knows.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/Job/figures/returns.js").ExitRoute[]} props.routes
 */
export default function ExitRoutes({ routes }) {
  return (
    <EvenColumns>
      {routes.map((route) => (
        <Route key={route.id} route={route} />
      ))}
    </EvenColumns>
  );
}

/**
 * @param {object} props
 * @param {import("../../../../../../Functions/Job/figures/returns.js").ExitRoute} props.route
 */
function Route({ route }) {
  const tone = signTone(route.net);

  if (route.hasNoOrders) {
    return (
      <InsetSurface>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {route.label}
        </Typography>
        <Figure
          sx={{ display: "block", typography: "h6", fontWeight: 500, mt: 0.5 }}
        >
          {null}
        </Figure>
        <Typography variant="caption" color="text.secondary">
          No {route.id === EXIT_ROUTE.LISTED ? "sell" : "buy"} orders here, so
          this route cannot be priced
        </Typography>
      </InsetSurface>
    );
  }

  return (
    <InsetSurface>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {route.label}
      </Typography>
      <Figure
        tone={tone}
        sx={{ display: "block", typography: "h6", fontWeight: 500, mt: 0.5 }}
      >
        {formatNumberForLocale(route.net)}
      </Figure>
      {/* The figure alone does not say what it was priced from, and the two
          routes are priced from different sides of the book. */}
      <Typography variant="caption" color="text.secondary">
        at {formatNumberForLocale(route.unitPrice)} · {route.deducts}
      </Typography>
      <Box sx={{ mt: 1 }}>
        <FigureRow
          label="Per unit"
          value={
            route.perUnit === null ? null : formatNumberForLocale(route.perUnit)
          }
          tone={signTone(route.perUnit)}
        />
        <FigureRow
          label="Margin"
          tone={signTone(route.margin)}
          value={formatPercentage(route.margin)}
        />
        <FigureRow
          label="Return on outlay"
          tone={signTone(route.returnOnOutlay)}
          value={formatPercentage(route.returnOnOutlay)}
        />
      </Box>
    </InsetSurface>
  );
}

/**
 * Colour marks sign and nothing else: a return is good or bad by whether it is
 * one at all, and how large it should be is the player's judgement.
 *
 * @param {number|null} value
 */
export function signTone(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return FIGURE_TONE.PLAIN;
  }
  return value < 0 ? FIGURE_TONE.BAD : FIGURE_TONE.GOOD;
}
