import { Alert, Box, Stack, Typography } from "@mui/material";

import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import { FigureCaption } from "../../../../../../Styled Components/Typography/figures";
import {
  ContextRow,
  Disclosure,
  FIGURE_TONE,
  FigureRow,
  HeadlineStat,
  PanelHeadline,
} from "../../../../../../Styled Components/Typography/figures";
import {
  formatNumberForLocale,
  formatPercentage,
} from "../../../../../../Functions/Helper/numberParser";
import { monthLabel } from "../Archive Jobs Panel/buildHistoryFigures";
import { EXIT_ROUTE } from "../../../../../../Functions/MarketData/returns";
import ExitRoutes, { signTone } from "./exitRoutes";
import OutputHeader from "./outputHeader";

/**
 * What the build is worth selling, by each way out of it.
 *
 * The model states every figure against a route and picks none; this panel makes
 * that choice and names it, so a margin on screen always belongs to a route the
 * reader can see.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketData/returns").Returns} props.returns
 * @param {{brokerFee: number, salesTax: number}} props.charges - ISK, for the ledger
 * @param {number} props.buildCost - ISK, selling excluded
 * @param {ReturnType<import("../../../../../../Functions/MarketData/buildComparison").compareToHistory>} [props.comparison]
 * @param {object} [props.output] - What the job makes, for the header
 * @param {string} [props.saleLocationName] - Where the sale is planned, for saying
 *   which market holds no orders
 * @param {React.ReactNode} [props.action] - Shown in the panel header
 * @param {React.ReactNode} [props.children] - The sale location and its rates
 */
export default function ReturnsPanel({
  returns,
  charges,
  buildCost,
  comparison,
  output,
  saleLocationName,
  action,
  children,
  exitRoute = EXIT_ROUTE.LISTED,
}) {
  if (!returns) return null;

  // The panel leads with the route the player takes, which the account names:
  // the fee and tax on the page are quoted for it, and a player who dumps into
  // bids should not be led with a listing's margin. The other route is stated
  // beside it rather than led with.
  const headline = returns.routes.find((route) => route.id === exitRoute);
  if (!headline) return null;

  return (
    <AppShellPanel
      title="Returns"
      componentName="ReturnsPanel"
      // AppShellPanel fills its parent by default, which is meant for panels
      // sharing a grid row. These are stacked, so each takes its own height.
      paperSx={{ height: "auto" }}
      action={action}
    >
      <Stack spacing={2}>
        {output ? <OutputHeader {...output} /> : null}

        {/* An item nobody is trading at the chosen market is the ordinary case
            for a capital: the figures below are all derived from a price that is
            not there, so the cause is stated once here rather than each of them
            reading as a finding. */}
        {returns.hasNoOrders ? (
          <Alert severity="info" variant="outlined" icon={false}>
            No market orders for this item at{" "}
            {saleLocationName ?? "this market"}, so there is nothing to price
            the return against. Choosing a market that trades it, or entering a
            price by hand, gives these figures something to work from.
          </Alert>
        ) : null}

        {/* The headline sits on its own surface: it is the panel's answer, and
            it should read as one rather than as the first of several rows. */}
        <InsetSurface>
          <PanelHeadline
            aside={
              <Stack direction="row" spacing={3}>
                <HeadlineStat
                  caption="Per unit"
                  size="beside"
                  tone={signTone(headline.perUnit)}
                  value={
                    headline.hasNoOrders || headline.perUnit === null
                      ? null
                      : formatNumberForLocale(headline.perUnit)
                  }
                />
                <HeadlineStat
                  caption="Margin"
                  size="beside"
                  tone={signTone(headline.margin)}
                  value={
                    headline.hasNoOrders
                      ? null
                      : formatPercentage(headline.margin)
                  }
                />
                <HeadlineStat
                  caption="Return on outlay"
                  size="beside"
                  tone={signTone(headline.returnOnOutlay)}
                  value={
                    headline.hasNoOrders
                      ? null
                      : formatPercentage(headline.returnOnOutlay)
                  }
                />
              </Stack>
            }
          >
            <HeadlineStat
              caption={
                headline.hasNoOrders
                  ? `${headline.label} — not priced`
                  : `Net return — ${headline.label.toLowerCase()}`
              }
              tone={headline.hasNoOrders ? undefined : signTone(headline.net)}
              value={
                headline.hasNoOrders
                  ? null
                  : formatNumberForLocale(headline.net)
              }
            />
          </PanelHeadline>
        </InsetSurface>

        <Box>
          <FigureCaption>Exit routes</FigureCaption>
          <Box sx={{ mt: 0.5 }}>
            <ExitRoutes routes={returns.routes} />
          </Box>
        </Box>

        <Stack>
          {/* Break-even still means something with no orders — it is what the
              build cost — but the headroom beside it does not, because there is
              no current price to be above or below. */}
          <ContextRow note={returns.hasNoOrders ? null : headroomNote(returns)}>
            {returns.breakEvenPerUnit === null
              ? "Nothing produced, so there is nothing to break even on"
              : `Each unit must fetch ${formatNumberForLocale(returns.breakEvenPerUnit)} to break even`}
          </ContextRow>

          <PreviousBuilds comparison={comparison} />
        </Stack>

        <Disclosure label="How this is worked out">
          <Ledger route={headline} charges={charges} buildCost={buildCost} />
        </Disclosure>

        {children}
      </Stack>
    </AppShellPanel>
  );
}

/**
 * What previous builds cost, stated without a verdict — the history is the
 * player's own, and a run of builds made in a poor market would make a bad
 * benchmark read as a good one.
 *
 * @param {object} props
 */
function PreviousBuilds({ comparison }) {
  if (!comparison || comparison.builds < 1) return null;

  const { range, last } = comparison;
  const month = monthLabel(last?.month);

  return (
    <ContextRow note={month ? `last built ${month}` : null}>
      {range
        ? `Your ${comparison.builds} previous builds cost ${formatNumberForLocale(range.low)} to ${formatNumberForLocale(range.high)} per unit`
        : `Your previous build cost ${formatNumberForLocale(last.perUnit)} per unit`}
    </ContextRow>
  );
}

/**
 * The working behind the headline: what the sale brings in, what is taken from
 * it, and what making it cost.
 *
 * The headline's alone. A ledger covering both routes would have to state a
 * broker fee that only one of them pays, so the fee is stated only on the route
 * that lists: `calculateReturns` charges it to that route and not the other, and
 * a row stating it against a buy-order sale would not reconcile with the net
 * figure below it.
 *
 * @param {object} props
 */
function Ledger({ route, charges, buildCost }) {
  const listing = route.id === EXIT_ROUTE.LISTED;

  return (
    <>
      <Typography variant="caption" color="text.secondary">
        {route.label}
      </Typography>
      {/* What was spent is known either way. What the sale brings in is not,
          where nothing is being sold at the price this is quoted from — and a
          revenue of nothing subtracted from a real outlay is a loss the market
          has not actually dealt. */}
      <FigureRow
        label="Revenue"
        sublabel={route.hasNoOrders ? "no orders to price it from" : undefined}
        value={route.hasNoOrders ? null : formatNumberForLocale(route.revenue)}
      />
      {listing ? (
        <FigureRow
          label="Broker fee"
          sublabel="charged when the order is listed"
          tone={FIGURE_TONE.BAD}
          value={`−${formatNumberForLocale(charges?.brokerFee ?? 0)}`}
        />
      ) : null}
      <FigureRow
        label="Sales tax"
        tone={FIGURE_TONE.BAD}
        value={`−${formatNumberForLocale(charges?.salesTax ?? 0)}`}
      />
      <FigureRow
        label="Cost to build"
        tone={FIGURE_TONE.BAD}
        value={`−${formatNumberForLocale(buildCost ?? 0)}`}
      />
      <FigureRow
        label="Net return"
        isTotal
        tone={route.hasNoOrders ? undefined : signTone(route.net)}
        value={route.hasNoOrders ? null : formatNumberForLocale(route.net)}
      />
    </>
  );
}

/**
 * How far today's price sits above what a unit must fetch.
 *
 * The figure that makes break-even worth stating: on its own it is a number a
 * reader has to compare against the price themselves.
 *
 * @param {import("../../../../../../Functions/MarketData/returns").Returns} returns
 */
function headroomNote({ headroom }) {
  if (!headroom || headroom.above === null) return null;

  return `current ${formatNumberForLocale(headroom.price)} · ${formatPercentage(
    Math.abs(headroom.above),
  )} ${headroom.above < 0 ? "below" : "above"} break-even`;
}
