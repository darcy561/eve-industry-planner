import { Fragment } from "react";
import { Box, Button, TableBody, TableCell, TableRow } from "@mui/material";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import {
  BandRow,
  ColumnHeaderRow,
  ScrollingTable,
  SummaryRow,
} from "../../Styled Components/Table/tableParts";
import {
  Figure,
  FigureCaption,
} from "../../Styled Components/Typography/figures";
import { ProportionBar } from "../../Styled Components/Charts";
import { ItemName } from "../../Styled Components/Item/ItemName";
import { useItemList } from "../../Hooks/Static/useItems";
import { useMarketGroupTree } from "../../Hooks/Static/useMarketGroups";
import { itemNameFrom } from "../../Functions/Static/items";
import {
  formatIsk,
  formatNumberForLocale,
  formatPercentage,
} from "../../Functions/Helper/numberParser";
import writeTextToClipboard from "../../Functions/Clipboard/writeTextToClipboard";
import { itemListText } from "../../Functions/Clipboard/itemListText";
import { approximately, spanText } from "./rangeFigures";

const COLUMNS = [
  { id: "material", label: "Material" },
  { id: "quantity", label: "Quantity", align: "right" },
  { id: "likely", label: "Likely", align: "right" },
  { id: "price", label: "Unit price", align: "right" },
  { id: "value", label: "Value", align: "right" },
  { id: "from", label: "From" },
];
const SHOWN_IN_BAR = 5;

/**
 * What the pasted items give, grouped by kind of material, each with its price, value and the items
 * it comes from, then the market value less selling fees and tax.
 */
export default function WhatYouGetPanel({
  result,
  likelyOutputs = {},
  valuation,
  fees,
  setup,
  marketLocation,
}) {
  const { records } = useItemList();
  const varies = (typeID) => Boolean(likelyOutputs[typeID]);
  const showLikely = Object.keys(likelyOutputs).length > 0;
  const columns = COLUMNS.filter(
    (column) => column.id !== "likely" || showLikely,
  );
  const approximate = (typeID, text) =>
    varies(typeID) ? approximately(text) : text;
  const { groups } = useMarketGroupTree();
  const nameOf = (typeID) => itemNameFrom(typeID, records);

  const rows = valuation.shareByOutput
    .filter(({ typeID }) => (result.outputs[typeID] ?? 0) > 0)
    .map(({ typeID, value }) => ({
      typeID,
      name: nameOf(typeID),
      quantity: result.outputs[typeID] ?? 0,
      value,
      unitPrice: result.outputs[typeID] ? value / result.outputs[typeID] : 0,
      band:
        groups[String(records[typeID]?.market_group_id)]?.name ??
        "Other materials",
      from: result.items
        .filter((item) => (item.outputs[typeID] ?? 0) > 0)
        .map((item) => item.name),
    }));
  const bands = [...new Set(rows.map((row) => row.band))];
  const shown = rows.slice(0, SHOWN_IN_BAR);
  const rest = rows
    .slice(SHOWN_IN_BAR)
    .reduce((sum, row) => sum + row.value, 0);
  const { totals } = valuation;
  const parts = [
    ...shown.map((row) => ({
      id: row.typeID,
      name: row.name,
      label: `${row.name} ${formatPercentage(row.value / totals.marketValue)}`,
      value: row.value,
    })),
    ...(rest > 0
      ? [
          {
            id: "rest",
            name: "Everything else",
            label: `Everything else ${formatPercentage(rest / totals.marketValue)}`,
            value: rest,
          },
        ]
      : []),
  ];

  return (
    <AppShellPanel
      title="What you get"
      componentName="WhatYouGetPanel"
      paperSx={{ height: "auto" }}
      action={
        <Button
          size="small"
          variant="outlined"
          onClick={() =>
            writeTextToClipboard(
              itemListText(
                rows.map(({ name, quantity }) => ({ name, quantity })),
              ),
              "Copied what you get",
            )
          }
        >
          Copy as list
        </Button>
      }
    >
      {parts.length > 0 ? (
        <Box
          component="figure"
          sx={{ m: 0, mb: 2 }}
          aria-label="Share of market value by material"
        >
          <FigureCaption>Where the value is</FigureCaption>
          <ProportionBar
            parts={parts}
            showLegend
            describe={(part) =>
              `${part.name} · ${formatIsk(part.value)} · ${formatPercentage(part.value / totals.marketValue)}`
            }
          />
        </Box>
      ) : null}
      <ScrollingTable minWidth="sm" aria-label="What you get">
        <ColumnHeaderRow columns={columns} />
        <TableBody>
          {bands.map((band) => (
            <Fragment key={band}>
              {bands.length > 1 ? (
                <BandRow colSpan={columns.length}>{band}</BandRow>
              ) : null}
              {rows
                .filter((row) => row.band === band)
                .map((row) => (
                  <TableRow key={row.typeID}>
                    <TableCell>
                      <ItemName
                        typeID={row.typeID}
                        name={row.name}
                        regionID={marketLocation}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Figure>
                        {approximate(
                          row.typeID,
                          formatNumberForLocale(row.quantity, { max: 0 }),
                        )}
                      </Figure>
                    </TableCell>
                    {showLikely ? (
                      <TableCell
                        align="right"
                        sx={{ whiteSpace: "nowrap", color: "text.secondary" }}
                      >
                        <Figure>
                          {varies(row.typeID)
                            ? spanText(likelyOutputs[row.typeID], (value) =>
                                formatNumberForLocale(value, { max: 0 }),
                              )
                            : null}
                        </Figure>
                      </TableCell>
                    ) : null}
                    <TableCell align="right">
                      <Figure>{row.unitPrice}</Figure>
                    </TableCell>
                    <TableCell align="right">
                      <Figure>
                        {approximate(row.typeID, formatIsk(row.value))}
                      </Figure>
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {row.from.join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
            </Fragment>
          ))}
          <SummaryRow
            columns={columns}
            label="Market value"
            values={{ value: totals.marketValue }}
          />
          <SummaryRow
            quiet
            columns={columns}
            label={`Selling fees · ${formatPercentage(fees.feePercent / 100)}`}
            values={{ value: -totals.fees }}
          />
          {setup.taxPercent > 0 ? (
            <SummaryRow
              quiet
              columns={columns}
              label={`Reprocessing tax · ${formatPercentage(setup.taxPercent / 100)}`}
              values={{ value: -totals.tax }}
            />
          ) : null}
          {totals.keptBackValue > 0 ? (
            <SummaryRow
              quiet
              columns={columns}
              label="Kept back, sold as they are"
              values={{ value: totals.keptBackValue }}
            />
          ) : null}
          <SummaryRow
            columns={columns}
            label="After fees and tax"
            values={{ value: totals.reprocessed }}
          />
        </TableBody>
      </ScrollingTable>
    </AppShellPanel>
  );
}
