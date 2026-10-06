import { Fragment, useMemo, useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import {
  ColumnHeaderRow,
  DrawerRow,
  ScrollingTable,
  SummaryRow,
} from "../../Styled Components/Table/tableParts";
import { ExpandToggle } from "../../Styled Components/IconButton/ExpandToggle";
import {
  FIGURE_TONE,
  Figure,
  FigureCaption,
  SignedPercent,
} from "../../Styled Components/Typography/figures";
import StatusChip, {
  STATUS_TONE,
} from "../../Styled Components/Chip/statusChip";
import {
  ChartLegend,
  RankedBarChart,
  SpreadBar,
  resolveSeriesColour,
  spreadLegendKeys,
} from "../../Styled Components/Charts";
import { ItemName } from "../../Styled Components/Item/ItemName";
import { useItemList } from "../../Hooks/Static/useItems";
import { itemNameFrom } from "../../Functions/Static/items";
import { readReprocessingItems } from "../../Functions/Static/reprocessing";
import { readMarketPriceForType } from "../../Functions/MarketData/prices/marketPriceForType.js";
import {
  formatIsk,
  formatNumberForLocale,
} from "../../Functions/Helper/numberParser";
import {
  reprocessingItemTypeLabels,
  reprocessingItemTypes,
} from "../../Context/defaultValues";
import { differenceTone, signedIsk } from "./differenceFigures";
import {
  LIKELY_SHARE,
  aheadInHundred,
  approximately,
  differenceSpanText,
  spanText,
  varyingOutputChip,
} from "./rangeFigures";
import { FigureNote } from "../../Styled Components/Typography/FigureNote";
import { portionText, reprocessedAtATime } from "./portionWording";
import { mineralSpreads } from "../../Functions/Reprocessing/engine/mineralSpreads";

const COLUMNS = [
  { id: "item", label: "Item" },
  { id: "quantity", label: "Quantity", align: "right" },
  { id: "keptBack", label: "Kept back", align: "right" },
  { id: "yield", label: "Yield", align: "right" },
  { id: "asIs", label: "As they are", align: "right" },
  { id: "reprocessed", label: "Reprocessed", align: "right" },
  { id: "difference", label: "Difference", align: "right" },
  { id: "open", label: "" },
];

/**
 * Each pasted item reprocessed against sold as it is, after fees and tax, with a chart of the
 * differences and a drawer per item saying what it gives and what that is worth.
 */
export default function ItemByItemPanel({
  result,
  valuation,
  marketLocation,
  orderType,
}) {
  const theme = useTheme();
  const { records } = useItemList();
  const [openTypeIDs, setOpenTypeIDs] = useState([]);
  const entries = readReprocessingItems() ?? {};
  const rows = result.items.map((item, index) => ({
    item,
    valued: valuation.items[index],
    entry: entries[item.typeID],
  }));
  const charted = rows
    .filter(({ item }) => item.batches > 0)
    .map(({ item, valued }) => ({
      name: item.name,
      difference: valued.difference,
    }));
  const toggle = (typeID) =>
    setOpenTypeIDs((open) =>
      open.includes(typeID)
        ? open.filter((id) => id !== typeID)
        : [...open, typeID],
    );
  const { totals } = valuation;

  return (
    <AppShellPanel
      title="Item by item"
      componentName="ItemByItemPanel"
      paperSx={{ height: "auto" }}
      action={
        <Typography variant="caption" color="text.secondary">
          After fees and tax
        </Typography>
      }
    >
      {charted.length > 0 ? (
        <Box
          component="figure"
          sx={{ m: 0, mb: 2 }}
          aria-label="Difference between reprocessing and selling each item as it is"
        >
          <FigureCaption>Reprocessed against sold as it is</FigureCaption>
          <RankedBarChart
            rows={charted}
            categoryKey="name"
            valueKey="difference"
            valueLabel="Difference"
            formatValue={signedIsk}
            markZero
            colourFor={(row) =>
              row.difference >= 0
                ? theme.palette.success.main
                : theme.palette.error.main
            }
          />
        </Box>
      ) : null}
      <ScrollingTable minWidth="sm" aria-label="Item by item">
        <ColumnHeaderRow columns={COLUMNS} />
        <TableBody>
          {rows.map(({ item, valued, entry }) => {
            const isOpen = openTypeIDs.includes(item.typeID);
            return (
              <Fragment key={item.typeID}>
                <TableRow selected={isOpen}>
                  <TableCell>
                    <Stack
                      direction="row"
                      useFlexGap
                      sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
                    >
                      <ItemName
                        typeID={item.typeID}
                        name={item.name}
                        regionID={marketLocation}
                        caption={[
                          reprocessingItemTypeLabels[item.itemType],
                          reprocessedAtATime(item.batchSize),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                      {item.batches === 0 ? (
                        <StatusChip
                          tone={STATUS_TONE.WARN}
                          label={`Under ${portionText(item.batchSize)}`}
                        />
                      ) : varyingOutputChip(item) ? (
                        <StatusChip
                          tone={STATUS_TONE.FACT}
                          label={varyingOutputChip(item)}
                        />
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Figure formatOptions={{ max: 0 }}>{item.quantity}</Figure>
                  </TableCell>
                  <TableCell align="right">
                    <Figure formatOptions={{ max: 0 }}>
                      {item.keptBack > 0 ? item.keptBack : null}
                    </Figure>
                  </TableCell>
                  <TableCell align="right">
                    <Figure>{`${item.yield.toFixed(1)}%`}</Figure>
                  </TableCell>
                  <TableCell align="right">
                    <Figure>{valued.asIs}</Figure>
                  </TableCell>
                  <TableCell align="right">
                    {valued.range ? (
                      <>
                        <Figure>
                          {approximately(formatIsk(valued.reprocessed))}
                        </Figure>
                        <FigureNote>{spanText(valued.range.likely)}</FigureNote>
                      </>
                    ) : (
                      <Figure>{valued.reprocessed}</Figure>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {item.batches === 0 ? (
                      <Figure>{null}</Figure>
                    ) : valued.range ? (
                      <>
                        <Figure
                          tone={differenceTone(valued.difference)}
                          sx={{ fontWeight: 500 }}
                        >
                          {approximately(signedIsk(valued.difference))}
                        </Figure>
                        <FigureNote>
                          {differenceSpanText(valued.range.likely, valued.asIs)}
                        </FigureNote>
                        <FigureNote>
                          ahead {aheadInHundred(valued.range, valued.asIs)} in
                          100
                        </FigureNote>
                      </>
                    ) : (
                      <>
                        <Figure tone={differenceTone(valued.difference)}>
                          {signedIsk(valued.difference)}
                        </Figure>
                        {valued.differencePercent === null ? null : (
                          <Box>
                            <SignedPercent
                              value={valued.differencePercent / 100}
                              lowerIsBetter={false}
                              variant="caption"
                            />
                          </Box>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell sx={{ width: 0, px: 1 }}>
                    <ExpandToggle
                      isOpen={isOpen}
                      onToggle={() => toggle(item.typeID)}
                      showLabel={`Show what ${item.name} gives`}
                      hideLabel={`Hide what ${item.name} gives`}
                    />
                  </TableCell>
                </TableRow>
                <DrawerRow colSpan={COLUMNS.length} isOpen={isOpen}>
                  {item.randomizedMaterials ? (
                    <VaryingItemDrawer
                      item={item}
                      nameOf={(typeID) => itemNameFrom(typeID, records)}
                      priceOf={(typeID) =>
                        readMarketPriceForType(
                          typeID,
                          marketLocation,
                          orderType,
                        )
                      }
                    />
                  ) : (
                    <ItemDrawer
                      item={item}
                      valued={valued}
                      entry={entry}
                      nameOf={(typeID) => itemNameFrom(typeID, records)}
                      priceOf={(typeID) =>
                        readMarketPriceForType(
                          typeID,
                          marketLocation,
                          orderType,
                        )
                      }
                    />
                  )}
                </DrawerRow>
              </Fragment>
            );
          })}
          <SummaryRow
            columns={COLUMNS}
            label="Total"
            values={{
              quantity: (
                <Figure sx={{ fontWeight: 500 }} formatOptions={{ max: 0 }}>
                  {result.items.reduce((sum, item) => sum + item.quantity, 0)}
                </Figure>
              ),
              keptBack: (
                <Figure sx={{ fontWeight: 500 }} formatOptions={{ max: 0 }}>
                  {result.items.reduce((sum, item) => sum + item.keptBack, 0)}
                </Figure>
              ),
              asIs: totals.asIs,
              reprocessed: totals.range
                ? approximately(formatIsk(totals.reprocessed))
                : totals.reprocessed,
              difference: totals.range
                ? approximately(signedIsk(totals.difference))
                : signedIsk(totals.difference),
            }}
            tones={{ difference: differenceTone(totals.difference) }}
          />
        </TableBody>
      </ScrollingTable>
      <Typography
        variant="caption"
        color="text.secondary"
        component="p"
        sx={{ mt: 1 }}
      >
        Difference sets what each item gives reprocessed against selling the
        same units as they are; units kept back are sold as they are in both
        columns.
        {totals.range
          ? ` A ~ marks an expected figure; the range beneath it is where ${LIKELY_SHARE} outcomes land.`
          : ""}
        {result.items
          .filter(
            (item) =>
              item.itemType === reprocessingItemTypes.unrefinedMineral &&
              item.batches > 0,
          )
          .map((item) => {
            const [[typeID, range]] = Object.entries(item.outputRanges);
            return ` ${item.name} always gives ${itemNameFrom(typeID, records)}, between ${formatNumberForLocale(range.min, { max: 0 })} and ${formatNumberForLocale(range.max, { max: 0 })} units from its ${formatNumberForLocale(item.batches * item.batchSize, { max: 0 })}.`;
          })
          .join("")}
      </Typography>
    </AppShellPanel>
  );
}

const DRAWER_COLUMNS = (item) => [
  { id: "gives", label: "Gives" },
  {
    id: "perBatch",
    label: `Per ${portionText(item.batchSize)}`,
    align: "right",
  },
  {
    id: "total",
    label: `From ${formatNumberForLocale(item.batches * item.batchSize, { max: 0 })} units`,
    align: "right",
  },
  { id: "value", label: "Market value", align: "right" },
  { id: "costAs", label: "Costs you as this ore", align: "right" },
  { id: "price", label: "Market price", align: "right" },
];

/** What one item gives, mineral by mineral, and what each costs when bought as this ore. */
function ItemDrawer({ item, valued, entry, nameOf, priceOf }) {
  return (
    <Stack spacing={1}>
      <Table size="small" aria-label={`What ${item.name} gives`}>
        <ColumnHeaderRow columns={DRAWER_COLUMNS(item)} />
        <TableBody>
          {Object.entries(item.outputs).map(([typeID, units]) => {
            const price = priceOf(typeID);
            const costAs = valued.costAsThisOre?.[typeID] ?? null;
            return (
              <TableRow key={typeID}>
                <TableCell>{nameOf(typeID)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Figure>
                    {`${formatNumberForLocale(entry?.materials?.[typeID] ?? 0, { max: 0 })} → ${formatNumberForLocale(item.batches > 0 ? units / item.batches : 0, { min: 0, max: 1 })}`}
                  </Figure>
                </TableCell>
                <TableCell align="right">
                  <Figure formatOptions={{ max: 0 }}>{units}</Figure>
                </TableCell>
                <TableCell align="right">
                  <Figure>{units * price}</Figure>
                </TableCell>
                <TableCell align="right">
                  <Figure
                    tone={
                      costAs !== null && costAs < price
                        ? FIGURE_TONE.GOOD
                        : undefined
                    }
                  >
                    {costAs}
                  </Figure>
                </TableCell>
                <TableCell align="right" sx={{ color: "text.secondary" }}>
                  <Figure>{price}</Figure>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary">
        {item.keptBack > 0
          ? `${formatNumberForLocale(item.keptBack, { max: 0 })} units are kept back: ${item.name} is ${reprocessedAtATime(item.batchSize)}. `
          : ""}
        &ldquo;Costs you as this ore&rdquo; shares the ore&apos;s price across
        what it gives by value.
      </Typography>
    </Stack>
  );
}

/**
 * What an item whose outputs vary could give, mineral by mineral: what one portion gives if it picks
 * that mineral, the expected and likely units with a bar of their spread, and the most possible.
 */
function VaryingItemDrawer({ item, nameOf, priceOf }) {
  const theme = useTheme();
  const spreads = useMemo(() => mineralSpreads(item), [item]);
  const choices = Object.keys(spreads).length;
  const erratic = choices > 1;
  const portion = portionText(item.batchSize);
  const several = item.batchSize > 1;
  const colour = resolveSeriesColour(theme, null, 2);
  const axisOf = (spread) =>
    erratic
      ? {
          low: 0,
          high: Math.max(
            spread.likely.high,
            Math.min(spread.bounds.high, 3 * spread.expected),
          ),
        }
      : spread.bounds;
  const columns = [
    { id: "mineral", label: "Mineral" },
    {
      id: "perBatch",
      label: several ? `If ${portion} give it` : "If a unit gives it",
      align: "right",
    },
    { id: "expected", label: "Units, expected", align: "right" },
    {
      id: "spread",
      label: erratic ? "Spread · bar ends at 3× expected" : "Spread",
    },
    { id: "likely", label: "Likely", align: "right" },
    { id: "most", label: "At most", align: "right" },
    { id: "price", label: "Price", align: "right" },
  ];
  const units = (value) => formatNumberForLocale(value, { max: 0 });

  return (
    <Stack spacing={1}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <FigureCaption>
          What each mineral could come to ·{" "}
          {units(item.batches * item.batchSize)} units
        </FigureCaption>
        <ChartLegend
          keys={spreadLegendKeys(theme, {
            possible: erratic ? "None to 3× expected" : "Possible",
            likely: `Likely, ${LIKELY_SHARE}`,
            colour,
          })}
        />
      </Box>
      <Table size="small" aria-label={`What ${item.name} gives`}>
        <ColumnHeaderRow columns={columns} />
        <TableBody>
          {Object.entries(spreads).map(([typeID, spread]) => {
            const name = nameOf(typeID);
            return (
              <TableRow key={typeID}>
                <TableCell>{name}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Figure>{`${units(spread.perBatch.low)} – ${units(spread.perBatch.high)}`}</Figure>
                </TableCell>
                <TableCell align="right">
                  <Figure sx={{ fontWeight: 500 }}>
                    {approximately(units(spread.expected))}
                  </Figure>
                </TableCell>
                <TableCell sx={{ minWidth: 140 }}>
                  <SpreadBar
                    compact
                    axis={axisOf(spread)}
                    likely={spread.likely}
                    expected={spread.expected}
                    colour={colour}
                    label={`${name}: expected ${units(spread.expected)}, likely ${spanText(spread.likely, units)}, at most ${units(spread.bounds.high)}`}
                  />
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ whiteSpace: "nowrap", color: "text.secondary" }}
                >
                  <Figure>{spanText(spread.likely, units)}</Figure>
                </TableCell>
                <TableCell align="right" sx={{ color: "text.secondary" }}>
                  <Figure formatOptions={{ max: 0 }}>
                    {spread.bounds.high}
                  </Figure>
                </TableCell>
                <TableCell align="right" sx={{ color: "text.secondary" }}>
                  <Figure>{priceOf(typeID)}</Figure>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary">
        {erratic
          ? `${several ? `Every ${portion} collapse` : "Each unit collapses"} into one of these ${choices}, in an amount from its range at your ${item.yield.toFixed(1)}% yield. Each is assumed equally likely, so each is expected from one in ${choices} of them, but any one can come from none of them or from all of them.`
          : `${several ? `Every ${portion} give` : "Each unit gives"} ${nameOf(Object.keys(spreads)[0])} in an amount from its range at your ${item.yield.toFixed(1)}% yield.`}
      </Typography>
    </Stack>
  );
}
