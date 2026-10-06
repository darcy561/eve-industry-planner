import { combinedValueRange, normalCumulative } from "./randomOutputValue";
import { reprocessedQuantity } from "./reprocess";

/**
 * What each mineral of an item with random outputs could come to over its run, in units: what one
 * batch gives if it gives that mineral, and the expected, likely and possible units.
 *
 * @param {Object} item - a `reprocess` result for an item with random outputs
 * @returns {Object<string, {perBatch: {low: number, high: number}, expected: number,
 *   spread: number, likely: {low: number, high: number}, bounds: {low: number, high: number}}>}
 */
export function mineralSpreads(item) {
  const outcomes = Object.entries(item.randomizedMaterials ?? {});
  return Object.fromEntries(
    outcomes.map(([typeID, { quantityMin, quantityMax }]) => {
      const perBatch = {
        low: reprocessedQuantity(quantityMin, 1, item.yield, item.itemType),
        high: reprocessedQuantity(quantityMax, 1, item.yield, item.itemType),
      };
      const units = unitsOfOneMineral(item.batches, outcomes.length, perBatch);
      return [
        typeID,
        {
          perBatch,
          expected: item.outputs?.[typeID] ?? units.expected,
          spread: units.spread,
          likely: units.likely,
          bounds: item.outputRanges?.[typeID]
            ? {
                low: item.outputRanges[typeID].min,
                high: item.outputRanges[typeID].max,
              }
            : units.bounds,
        },
      ];
    }),
  );
}

/**
 * The units one mineral gives over a run when each batch picks it at equal odds among `choices`: the
 * number of batches picking it weighted by its odds, and the amounts those batches give.
 *
 * @param {number} batches
 * @param {number} choices - how many minerals a batch picks between
 * @param {{low: number, high: number}} perBatch - what a batch gives if it picks this mineral
 * @returns {{expected: number, spread: number, likely: {low: number, high: number},
 *   bounds: {low: number, high: number}}}
 */
function unitsOfOneMineral(batches, choices, perBatch) {
  const odds = 1 / choices;
  const mean = (perBatch.low + perBatch.high) / 2;
  const spread = (perBatch.high - perBatch.low) / Math.sqrt(12);
  const weights = picksWeights(batches, odds);
  const below = (units) =>
    weights.reduce((share, [picks, weight]) => {
      if (picks === 0) return share + (units >= 0 ? weight : 0);
      const deviation = spread * Math.sqrt(picks);
      const reached =
        deviation === 0
          ? Number(units >= picks * mean)
          : normalCumulative((units - picks * mean) / deviation);
      return share + weight * reached;
    }, 0);
  const bounds = {
    low: choices > 1 ? 0 : batches * perBatch.low,
    high: batches * perBatch.high,
  };
  const percentile = (share) => {
    let [low, high] = [bounds.low, bounds.high];
    for (let step = 0; step < 60 && high - low > 0.5; step++) {
      const middle = (low + high) / 2;
      if (below(middle) < share) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  };
  const meanOfSquares =
    (perBatch.low ** 2 + perBatch.low * perBatch.high + perBatch.high ** 2) / 3;
  return {
    expected: batches * odds * mean,
    spread: Math.sqrt(
      Math.max(0, batches * (odds * meanOfSquares - (odds * mean) ** 2)),
    ),
    likely: { low: percentile(0.1), high: percentile(0.9) },
    bounds,
  };
}

/**
 * The odds of each number of batches picking one mineral, leaving out counts too unlikely to matter.
 *
 * @param {number} batches
 * @param {number} odds - the chance one batch picks it
 * @returns {Array<[number, number]>} picks and their odds
 */
function picksWeights(batches, odds) {
  if (odds >= 1) return [[batches, 1]];
  const centre = batches * odds;
  const reach = 10 * Math.sqrt(batches * odds * (1 - odds)) + 10;
  const from = Math.max(0, Math.floor(centre - reach));
  const to = Math.min(batches, Math.ceil(centre + reach));
  const logChoose = (k) =>
    logFactorial(batches) - logFactorial(k) - logFactorial(batches - k);
  const weights = [];
  for (let picks = from; picks <= to; picks++) {
    weights.push([
      picks,
      Math.exp(
        logChoose(picks) +
          picks * Math.log(odds) +
          (batches - picks) * Math.log(1 - odds),
      ),
    ]);
  }
  return weights;
}

/**
 * The natural log of n factorial, exact for small n and by Stirling's series beyond.
 *
 * @param {number} n
 * @returns {number}
 */
function logFactorial(n) {
  if (n < 2) return 0;
  if (n < 50) {
    let total = 0;
    for (let k = 2; k <= n; k++) total += Math.log(k);
    return total;
  }
  return (
    n * Math.log(n) -
    n +
    0.5 * Math.log(2 * Math.PI * n) +
    1 / (12 * n) -
    1 / (360 * n ** 3)
  );
}

/**
 * The likely units of each output a random item gives, across a whole result: fixed units added, and
 * the random items' spreads combined.
 *
 * @param {Object} result - a `reprocess` result
 * @returns {Object<string, {low: number, high: number}>}
 */
export function likelyOutputUnits(result) {
  const spreads = result.items
    .filter((item) => item.randomizedMaterials)
    .map(mineralSpreads);

  return Object.fromEntries(
    Object.keys(result.outputRanges ?? {}).map((typeID) => {
      const fixed = result.items
        .filter((item) => !item.randomizedMaterials)
        .reduce((sum, item) => sum + (item.outputs[typeID] ?? 0), 0);
      const parts = spreads.map((spread) => spread[typeID]).filter(Boolean);
      return [typeID, combinedValueRange(fixed, parts).likely];
    }),
  );
}
