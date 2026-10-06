import { reprocessingItemTypes } from "../../../Context/defaultValues";
import { readReprocessingItems } from "../../Static/reprocessing";
import { yieldFor } from "./reprocessingSetup";

/**
 * How many units of one material a reprocessing run gives: the one rounding rule every figure uses,
 * rounding each batch for ore, moon ore and ice and the whole run for gas.
 *
 * @param {number} base - units of the material one batch gives at 100%
 * @param {number} batches
 * @param {number} yieldPercent
 * @param {number} itemType - the reprocessing kind of the item reprocessed
 * @returns {number}
 */
export function reprocessedQuantity(base, batches, yieldPercent, itemType) {
  if (itemType === reprocessingItemTypes.gas) {
    return Math.round(base * batches * (yieldPercent / 100));
  }
  return Math.round(base * (yieldPercent / 100)) * batches;
}

/**
 * What items reprocess into in a setup, leaving the input unchanged: per item its batches, units kept
 * back, yield and outputs as totals or ranges, every output combined, and what is not reprocessable.
 *
 * @param {Array<{typeID: number|string, quantity: number}>} items
 * @param {ReturnType<import("./reprocessingSetup").reprocessingSetupFrom>} setup
 * @returns {{items: Array<{typeID: string, name: string, itemType: number, quantity: number,
 *   batchSize: number, batches: number, keptBack: number, yield: number, outputs: Object<string, number>,
 *   outputRanges?: Object<string, {min: number, max: number}>,
 *   randomizedMaterials?: Object<string, {quantityMin: number, quantityMax: number}>}>,
 *   outputs: Object<string, number>, outputRanges: Object<string, {min: number, max: number}>,
 *   notReprocessable: Array<{typeID: string, quantity: number}>}}
 */
export function reprocess(items, setup) {
  const entries = readReprocessingItems() ?? {};
  const held = new Map();
  for (const { typeID, quantity } of items ?? []) {
    const key = String(typeID);
    held.set(key, (held.get(key) ?? 0) + Math.max(0, quantity || 0));
  }

  const results = [];
  const outputs = {};
  const rangedOutputs = new Set();
  const notReprocessable = [];
  for (const [typeID, quantity] of held) {
    const entry = entries[typeID];
    if (!entry) {
      notReprocessable.push({ typeID, quantity });
      continue;
    }

    const batches = Math.floor(quantity / entry.batchSize);
    const yieldPercent = yieldFor(setup, entry);
    const itemOutputs = {};
    for (const [materialID, base] of Object.entries(entry.materials ?? {})) {
      const given = reprocessedQuantity(
        base,
        batches,
        yieldPercent,
        entry.itemType,
      );
      itemOutputs[materialID] = given;
      outputs[materialID] = (outputs[materialID] ?? 0) + given;
    }

    const result = {
      typeID,
      name: entry.name,
      itemType: entry.itemType,
      quantity,
      batchSize: entry.batchSize,
      batches,
      keptBack: quantity % entry.batchSize,
      yield: yieldPercent,
      outputs: itemOutputs,
    };

    const random = randomOutputsOf(entry, batches, yieldPercent);
    if (random) {
      for (const [materialID, expected] of Object.entries(random.expected)) {
        itemOutputs[materialID] = expected;
        outputs[materialID] = (outputs[materialID] ?? 0) + expected;
        rangedOutputs.add(materialID);
      }
      result.outputRanges = random.ranges;
      result.randomizedMaterials = entry.randomizedMaterials;
    }
    results.push(result);
  }

  return {
    items: results,
    outputs,
    outputRanges: combinedRanges(results, rangedOutputs),
    notReprocessable,
  };
}

/**
 * Expected units and range of each mineral an item with random outputs gives over a run, each batch
 * giving one of its minerals at equal odds; null for an item with none.
 *
 * @param {Object} entry - the item's reprocessing file entry
 * @param {number} batches
 * @param {number} yieldPercent
 * @returns {{expected: Object<string, number>, ranges: Object<string, {min: number, max: number}>}|null}
 */
function randomOutputsOf(entry, batches, yieldPercent) {
  const outcomes = Object.entries(entry.randomizedMaterials ?? {});
  if (outcomes.length === 0) return null;

  const share = 1 / outcomes.length;
  const expected = {};
  const ranges = {};
  for (const [materialID, { quantityMin, quantityMax }] of outcomes) {
    expected[materialID] = Math.round(
      batches *
        share *
        ((quantityMin + quantityMax) / 2) *
        (yieldPercent / 100),
    );
    const most = reprocessedQuantity(
      quantityMax,
      batches,
      yieldPercent,
      entry.itemType,
    );
    const least = reprocessedQuantity(
      quantityMin,
      batches,
      yieldPercent,
      entry.itemType,
    );
    ranges[materialID] = { min: outcomes.length > 1 ? 0 : least, max: most };
  }
  return { expected, ranges };
}

/**
 * The range of every combined output that a random item contributes to, its fixed contributions
 * counted at both ends.
 *
 * @param {Array<Object>} results
 * @param {Set<string>} rangedOutputs
 * @returns {Object<string, {min: number, max: number}>}
 */
function combinedRanges(results, rangedOutputs) {
  const ranges = {};
  for (const materialID of rangedOutputs) {
    let min = 0;
    let max = 0;
    for (const item of results) {
      const range = item.outputRanges?.[materialID];
      if (range) {
        min += range.min;
        max += range.max;
      } else {
        min += item.outputs[materialID] ?? 0;
        max += item.outputs[materialID] ?? 0;
      }
    }
    ranges[materialID] = { min, max };
  }
  return ranges;
}
