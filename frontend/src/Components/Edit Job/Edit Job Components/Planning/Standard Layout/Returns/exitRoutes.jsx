import { Box, Typography } from "@mui/material";

import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import {
  FIGURE_TONE,
  Figure,
  FigureRow,
} from "../../../../../../Styled Components/Typography/figures";
import {
  formatNumberForLocale,
  formatPercentage,
} from "../../../../../../Functions/Helper/numberParser";
import { EXIT_ROUTE } from "../../../../../../Functions/MarketData/returns";

/**
 * The ways out of a finished build, side by side.
 *
 * Drawn at equal weight on purpose. Listing returns more and takes as long as it
 * takes; buy orders return less and are done — which of those a player wants is
 * not a thing the app knows, so neither is styled as the answer.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/returns").ExitRoute[]} props.routes
 */
export default function ExitRoutes({ routes }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        gap: 1.5,
      }}
    >
      {routes.map((route) => (
        <Route key={route.id} route={route} />
      ))}
    </Box>
  );
}

/**
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/returns").ExitRoute} props.route
 */
function Route({ route }) {
  const tone = signTone(route.net);

  // Every figure on this route is derived from a price that is not there, so
  // none of them is stated: a net of minus the whole build cost and a return of
  // −100% are what a missing price looks like, not what the route is worth.
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
