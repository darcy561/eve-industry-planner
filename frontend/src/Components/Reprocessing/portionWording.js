import { formatNumberForLocale } from "../../Functions/Helper/numberParser";

/**
 * The amount an item reprocesses in, as a reader says it: "unit" where one reprocesses alone, or
 * "100 units" where it takes that many.
 *
 * @param {number} batchSize
 * @returns {string}
 */
export function portionText(batchSize) {
  return batchSize > 1
    ? `${formatNumberForLocale(batchSize, { max: 0 })} units`
    : "unit";
}

/**
 * The note beside an item's kind saying how many units it takes to reprocess, or nothing where one
 * unit is enough.
 *
 * @param {number} batchSize
 * @returns {string|null}
 */
export function reprocessedAtATime(batchSize) {
  return batchSize > 1
    ? `reprocessed ${formatNumberForLocale(batchSize, { max: 0 })} at a time`
    : null;
}
