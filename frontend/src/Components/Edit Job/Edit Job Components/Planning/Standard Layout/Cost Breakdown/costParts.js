import { alpha, darken, lighten } from "@mui/material/styles";

import {
  chartRoleColours,
  chartSeriesColours,
} from "../../../../../../Styled Components/Charts/chartTheme";

/**
 * The colour each part of a build's cost is drawn in.
 *
 * The proportion bar and the dot beside each table row read this, so a segment
 * and its row cannot drift apart — the bar is only legible because the dot next
 * to a figure names which band of it that figure is.
 *
 * Taken from the shared chart palette rather than from shades of one colour: the
 * parts are distinct things rather than more or less of one, and a page whose
 * charts and bars draw the same idea in the same colour reads as one page.
 *
 * What it costs to sell keeps the loss colour the rest of the app uses for money
 * going out, so the two bands stay tellable apart at a glance — which is the one
 * thing the rotation on its own would lose.
 *
 * The extras are a category each, and how many there are is up to the player, so
 * they cannot come from a list of any length. They are shades of one colour
 * instead: derived rather than chosen, so there is a shade for however many
 * there turn out to be, and every one of them still reads as an extra.
 */

/**
 * The order build parts take from the palette, so a part keeps its colour.
 *
 * Every id `buildCostBreakdown` can emit is named. One left out falls to the
 * end of the list and takes whatever the rotation hands a part that is not
 * there — which is how `paid` came to be drawn in the same colour as `bought`,
 * two bins of the same band that a build can carry at once.
 */
const BUILD_ORDER = [
  "bought",
  "built",
  "paid",
  "install",
  "invention",
  "extras",
];

/** The two selling charges, as fractions of the loss colour. */
const SELL_WEIGHTS = { brokerFee: 1, salesTax: 0.55 };

/** How far a shade may move from the colour it is a shade of. */
const SHADE_SPREAD = 0.45;

/**
 * One of however many shades of a colour, spread evenly either side of it.
 *
 * @param {string} colour
 * @param {number} index
 * @param {number} count
 * @returns {string}
 */
function shadeOf(colour, index, count) {
  if (count <= 1 || index <= 0) return colour;

  // Alternating either side keeps the first few far apart, where a build with
  // two or three categories spends all of its time.
  const step = Math.ceil(index / 2);
  const reach = (step / Math.ceil((count - 1) / 2)) * SHADE_SPREAD;

  return index % 2 === 1 ? lighten(colour, reach) : darken(colour, reach);
}

/**
 * @param {object} theme
 * @param {string} id - A cost line's id
 * @param {string[]} [extrasIds] - Every extras line on the breakdown, in order,
 *   so each category takes a different shade of the one extras colour
 * @returns {string} A CSS colour
 */
export function costPartColour(theme, id, extrasIds = []) {
  if (id.startsWith("extras")) {
    const extras = buildPalette(theme)[BUILD_ORDER.indexOf("extras")];
    const position = extrasIds.indexOf(id);

    return shadeOf(extras, position < 0 ? 0 : position, extrasIds.length || 1);
  }

  return basePartColour(theme, id);
}

/**
 * The colours the build band draws from.
 *
 * The whole rotation rather than the six full-strength ones: there are more
 * components than there are theme colours once the selling band has taken one,
 * and a band that runs out starts drawing two parts the same. The loss colour is
 * removed by value, so a part cannot take the colour of a charge.
 *
 * @param {object} theme
 * @returns {string[]}
 */
function buildPalette(theme) {
  const loss = chartRoleColours(theme).loss;

  return chartSeriesColours(theme).filter((colour) => colour !== loss);
}

/**
 * @param {object} theme
 * @param {string} id
 * @returns {string}
 */
function basePartColour(theme, id) {
  if (id in SELL_WEIGHTS) {
    return alpha(chartRoleColours(theme).loss, SELL_WEIGHTS[id]);
  }

  const palette = buildPalette(theme);
  const position = BUILD_ORDER.indexOf(id);

  return palette[
    (position < 0 ? BUILD_ORDER.length : position) % palette.length
  ];
}

/**
 * Every line of a breakdown as a part the proportion bar can draw, in the order
 * the table lists them.
 *
 * @param {import("../../../../../../Functions/Job/costBreakdown.js").CostBreakdown} cost
 * @param {object} theme
 * @returns {Array<{id: string, label: string, value: number, colour: string}>}
 */
export function costParts(cost, theme) {
  const lines = [
    ...(cost?.toBuild?.lines ?? []),
    ...(cost?.toSell?.lines ?? []),
  ];
  const extrasIds = extrasIdsOf(lines);

  return lines.map((line) => ({
    id: line.id,
    label: line.label,
    value: line.value,
    colour: costPartColour(theme, line.id, extrasIds),
  }));
}

/**
 * The extras lines a breakdown holds, in the order it lists them.
 *
 * @param {Array<{id: string}>} lines
 * @returns {string[]}
 */
export function extrasIdsOf(lines = []) {
  return lines
    .filter((line) => line.id.startsWith("extras"))
    .map((line) => line.id);
}
