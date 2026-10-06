import { reprocessingItemTypes } from "../../Context/defaultValues";
import { formatIsk } from "../../Functions/Helper/numberParser";
import { signedIsk } from "./differenceFigures";
import { portionText } from "./portionWording";

/** How much of the outcomes a likely range holds, as the page says it. */
export const LIKELY_SHARE = "8 in 10";

/**
 * What a row says about an item whose outputs vary, by its reprocessing kind, or null for an item
 * whose outputs are fixed.
 *
 * @param {{itemType: number, batchSize: number}} item
 * @returns {string|null}
 */
export function varyingOutputChip(item) {
  if (item.itemType === reprocessingItemTypes.erratic) {
    return `One mineral per ${portionText(item.batchSize)}`;
  }
  if (item.itemType === reprocessingItemTypes.unrefinedMineral) {
    return "Amount varies";
  }
  return null;
}

/**
 * A figure marked as the expected one of a range.
 *
 * @param {string} text
 * @returns {string}
 */
export function approximately(text) {
  return `~${text}`;
}

/**
 * Two ends of a span, written with a format.
 *
 * @param {{low: number, high: number}} span
 * @param {(value: number) => string} [format]
 * @returns {string}
 */
export function spanText(span, format = formatIsk) {
  return `${format(span.low)} – ${format(span.high)}`;
}

/**
 * Two ends of a span less a fixed figure, each signed.
 *
 * @param {{low: number, high: number}} span
 * @param {number} against
 * @returns {string}
 */
export function differenceSpanText(span, against) {
  return `${signedIsk(span.low - against)} to ${signedIsk(span.high - against)}`;
}

/**
 * The likely span of a ranged ISK figure, as a line beneath it.
 *
 * @param {{likely: {low: number, high: number}}} range
 * @returns {string}
 */
export function likelyIsk(range) {
  return `likely ${spanText(range.likely)}`;
}

/**
 * The likely span of a ranged value less a fixed one, each end signed.
 *
 * @param {{likely: {low: number, high: number}}} range
 * @param {number} against
 * @returns {string}
 */
export function likelyDifference(range, against) {
  return `likely ${differenceSpanText(range.likely, against)}`;
}

/**
 * How many runs in 100 a ranged value comes out above a fixed one.
 *
 * @param {{shareAbove: (value: number) => number}} range
 * @param {number} against
 * @returns {number}
 */
export function aheadInHundred(range, against) {
  return Math.round(range.shareAbove(against) * 100);
}

/**
 * The line saying why a paste's figures are a range and the odds they assume, naming its erratic
 * ore and unrefined minerals.
 *
 * @param {Array<{name: string, itemType: number, batchSize: number, randomizedMaterials?: Object}>} items
 * @returns {string|null}
 */
export function rangeOddsLine(items) {
  const erratic = items.filter(
    (item) => item.itemType === reprocessingItemTypes.erratic,
  );
  const unrefined = items.filter(
    (item) => item.itemType === reprocessingItemTypes.unrefinedMineral,
  );
  if (erratic.length === 0 && unrefined.length === 0) return null;

  const minerals = (item) => Object.keys(item.randomizedMaterials ?? {}).length;
  const causes = [
    ...erratic.map(
      (item) =>
        `${item.name} collapses into one of ${minerals(item)} minerals for every ${portionText(item.batchSize)}`,
    ),
    ...(unrefined.length > 0
      ? [
          `${listed(unrefined.map((item) => item.name))} ${unrefined.length === 1 ? "gives" : "give"} a varying amount`,
        ]
      : []),
  ];
  const odds =
    erratic.length === 1
      ? ` They assume each of ${erratic[0].name}'s minerals is equally likely, 1 in ${minerals(erratic[0])}.`
      : erratic.length > 1
        ? " They assume each of their minerals is equally likely."
        : "";
  return `${listed(causes)}, so these figures are a range.${odds} Every other figure on the page follows the expected value; the likely range is where ${LIKELY_SHARE} outcomes land.`;
}

/**
 * Names joined as a sentence lists them.
 *
 * @param {Array<string>} names
 * @returns {string}
 */
function listed(names) {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
