import { Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import {
  ContextRow,
  FigureCaption,
  HeadlineStat,
  PanelFooterMeta,
  PanelHeadline,
  SignedPercent,
} from "../../Styled Components/Typography/figures";
import { ChipRow } from "../../Styled Components/Chip/ChipRow";
import StatusChip, {
  STATUS_TONE,
} from "../../Styled Components/Chip/statusChip";
import {
  formatIsk,
  formatNumberForLocale,
  formatPercentage,
  formatTimeSince,
} from "../../Functions/Helper/numberParser";
import { readPriceRefreshedAt } from "../../Functions/MarketData/prices/marketPriceForType.js";
import { typesPricedByToMinerals } from "../../Functions/Reprocessing/reprocessingRuns";
import { useCurrentTime } from "../../Hooks/useCurrentTime";
import PricingControls from "./pricingControls";
import { useMarketSources } from "../../Hooks/Static/useMarketSources";
import { sourceIn } from "../../Functions/MarketData/registry/marketSources.js";
import { ORDER_TYPES } from "../../Context/defaultValues";
import { differenceTone, signedIsk } from "./differenceFigures";
import {
  aheadInHundred,
  LIKELY_SHARE,
  approximately,
  likelyDifference,
  likelyIsk,
  rangeOddsLine,
} from "./rangeFigures";
import { FigureNote } from "../../Styled Components/Typography/FigureNote";
import InsetSurface from "../../Styled Components/Paper/InsetSurface";
import {
  ChartLegend,
  SpreadBar,
  resolveSeriesColour,
  spreadLegendKeys,
} from "../../Styled Components/Charts";

/**
 * What the pasted items come to reprocessed against sold as they are, after fees and tax, with the
 * volume to haul either way and the prices, order side and seller the figures are read with.
 */
export default function ReprocessingHeadline({
  pageState,
  pageActions,
  result,
  valuation,
  orderTypeOptions,
  fees,
  setup,
  sellerName,
}) {
  const now = useCurrentTime();
  const marketSources = useMarketSources();
  const marketName =
    sourceIn(marketSources, pageState.marketLocation)?.name ??
    pageState.marketLocation;
  const orderTypeName =
    ORDER_TYPES.find((entry) => entry.id === pageState.orderType)?.name ??
    pageState.orderType;
  const theme = useTheme();
  const { totals, hauling } = valuation;
  const range = totals.range;
  const mark = (text) => (range ? approximately(text) : text);
  const keptBack = result.items.reduce((sum, item) => sum + item.keptBack, 0);
  const refreshed = typesPricedByToMinerals(result)
    .map((typeID) => readPriceRefreshedAt(typeID, pageState.marketLocation))
    .filter(Boolean);
  const oldest = refreshed.length > 0 ? Math.min(...refreshed) : null;

  return (
    <AppShellPanel
      title="Reprocessing these items"
      componentName="ReprocessingHeadline"
      paperSx={{ height: "auto" }}
      action={
        <PricingControls
          pageState={pageState}
          pageActions={pageActions}
          showSeller
          orderTypeOptions={orderTypeOptions}
        />
      }
    >
      <Stack spacing={1.5}>
        <PanelHeadline
          aside={
            <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 3 }}>
              <HeadlineStat
                size="beside"
                caption="Sold as they are"
                value={formatIsk(totals.asIs)}
              >
                <FigureNote>after the same fees</FigureNote>
              </HeadlineStat>
              <HeadlineStat
                size="beside"
                caption="Difference"
                value={mark(signedIsk(totals.difference))}
                tone={differenceTone(totals.difference)}
              >
                {range ? (
                  <FigureNote>
                    {likelyDifference(range, totals.asIs)}
                  </FigureNote>
                ) : totals.differencePercent === null ? null : (
                  <SignedPercent
                    value={totals.differencePercent / 100}
                    lowerIsBetter={false}
                    variant="caption"
                  />
                )}
              </HeadlineStat>
              {range ? (
                <HeadlineStat
                  size="beside"
                  caption="Comes out ahead"
                  value={`${aheadInHundred(range, totals.asIs)} in 100`}
                >
                  <FigureNote>of the ways the minerals can fall</FigureNote>
                </HeadlineStat>
              ) : null}
              <HeadlineStat
                size="beside"
                caption="To haul"
                value={mark(
                  `${formatNumberForLocale(hauling.reprocessed, { max: 0 })} m³`,
                )}
              >
                <FigureNote>
                  {formatNumberForLocale(hauling.asIs, { max: 0 })} m³ as they
                  are
                </FigureNote>
              </HeadlineStat>
            </Stack>
          }
        >
          <HeadlineStat
            caption={
              range
                ? "Reprocessed, after fees and tax · expected"
                : "Reprocessed, after fees and tax"
            }
            value={mark(formatIsk(totals.reprocessed))}
          >
            {range ? <FigureNote>{likelyIsk(range)}</FigureNote> : null}
            {keptBack > 0 ? (
              <FigureNote>
                includes {formatNumberForLocale(keptBack, { max: 0 })} units
                kept back, sold as they are
              </FigureNote>
            ) : null}
          </HeadlineStat>
        </PanelHeadline>
        {range ? (
          <RangePicture range={range} asIs={totals.asIs} theme={theme} />
        ) : null}
        {range ? (
          <InsetSurface>
            <Typography variant="body2">
              {rangeOddsLine(result.items)}
            </Typography>
          </InsetSurface>
        ) : null}
        {setup.taxPercent > 0 ? (
          <ContextRow>
            The {formatPercentage(setup.taxPercent / 100)} reprocessing tax is{" "}
            {formatIsk(totals.tax)}; without it, reprocessing comes out{" "}
            {formatIsk(Math.abs(totals.differenceWithoutTax))}{" "}
            {totals.differenceWithoutTax >= 0 ? "ahead" : "behind"}.
          </ContextRow>
        ) : null}
        {valuation.unpriced.length > 0 ? (
          <ChipRow>
            <StatusChip
              tone={STATUS_TONE.WARN}
              label={`${valuation.unpriced.length} ${valuation.unpriced.length === 1 ? "type has" : "types have"} no price at this market`}
            />
          </ChipRow>
        ) : null}
        <PanelFooterMeta
          value={oldest ? `updated ${formatTimeSince(oldest, { now })}` : null}
        >
          {orderTypeName} at {marketName} · fees{" "}
          {formatPercentage(fees.feePercent / 100)}
          {sellerName ? ` for ${sellerName}` : ", every market skill at V"}
        </PanelFooterMeta>
      </Stack>
    </AppShellPanel>
  );
}

/**
 * What the reprocessed value could come to: every possible outcome, the likely range, the expected
 * value and what the items fetch as they are.
 */
function RangePicture({ range, asIs, theme }) {
  const likelyColour = resolveSeriesColour(theme, null, 0);
  const asIsColour = resolveSeriesColour(theme, null, 1);
  const low = Math.min(range.bounds.low, asIs);
  const high = Math.max(range.bounds.high, asIs);
  const pad = (high - low) * 0.03;

  return (
    <Box component="figure" sx={{ m: 0 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 1,
          mb: 0.5,
        }}
      >
        <FigureCaption>What reprocessing could come to</FigureCaption>
        <ChartLegend
          keys={spreadLegendKeys(theme, {
            possible: "Possible",
            likely: `Likely, ${LIKELY_SHARE}`,
            colour: likelyColour,
            marks: [
              { id: "asIs", label: "Sold as they are", colour: asIsColour },
            ],
          })}
        />
      </Box>
      <SpreadBar
        axis={{ low: low - pad, high: high + pad }}
        possible={range.bounds}
        likely={range.likely}
        expected={range.expected}
        colour={likelyColour}
        marks={[
          {
            id: "asIs",
            value: asIs,
            colour: asIsColour,
            label: `as they are ${formatIsk(asIs)}`,
          },
        ]}
        expectedLabel={`expected ${formatIsk(range.expected)}`}
        endLabels={[formatIsk(range.bounds.low), formatIsk(range.bounds.high)]}
        label={`Reprocessed value: ${likelyIsk(range)}, expected ${formatIsk(range.expected)}, possible ${formatIsk(range.bounds.low)} to ${formatIsk(range.bounds.high)}, against ${formatIsk(asIs)} sold as they are`}
      />
    </Box>
  );
}
