const NORMAL_FROM_BATCHES = 30;
const SIMULATED_RUNS = 20000;
const TENTH_PERCENTILE_Z = 1.2815515655446004;

/**
 * What a run of an item with random outputs is worth: the expected value and its spread, the range
 * eight in ten runs land in, the least and most a run can give, and the share of runs worth more.
 *
 * @param {{batches: number, yield: number,
 *   randomizedMaterials: Object<string, {quantityMin: number, quantityMax: number}>}} item - a
 *   `reprocess` result for an item with random outputs
 * @param {(typeID: string) => number} priceOf - the price of one unit of a mineral
 * @returns {{expected: number, spread: number, likely: {low: number, high: number},
 *   bounds: {low: number, high: number}, shareAbove: (value: number) => number}}
 */
export function randomOutputValue(item, priceOf) {
  const outcomes = batchOutcomes(item, priceOf);
  const batches = item.batches;
  if (batches === 0 || outcomes.length === 0) {
    return {
      expected: 0,
      spread: 0,
      likely: { low: 0, high: 0 },
      bounds: { low: 0, high: 0 },
      shareAbove: (value) => (value < 0 ? 1 : 0),
    };
  }

  const mean =
    outcomes.reduce((sum, { low, high }) => sum + (low + high) / 2, 0) /
    outcomes.length;
  const meanOfSquares =
    outcomes.reduce(
      (sum, { low, high }) => sum + (low * low + low * high + high * high) / 3,
      0,
    ) / outcomes.length;
  const expected = batches * mean;
  const bounds = {
    low: batches * Math.min(...outcomes.map(({ low }) => low)),
    high: batches * Math.max(...outcomes.map(({ high }) => high)),
  };

  if (batches >= NORMAL_FROM_BATCHES) {
    const spread =
      Math.sqrt(batches) * Math.sqrt(Math.max(0, meanOfSquares - mean * mean));
    return {
      expected,
      spread,
      likely: {
        low: Math.max(bounds.low, expected - TENTH_PERCENTILE_Z * spread),
        high: Math.min(bounds.high, expected + TENTH_PERCENTILE_Z * spread),
      },
      bounds,
      shareAbove: (value) =>
        spread === 0
          ? Number(expected > value)
          : 1 - normalCumulative((value - expected) / spread),
    };
  }

  const runs = simulatedRuns(outcomes, batches);
  const runMean = runs.reduce((sum, run) => sum + run, 0) / runs.length;
  return {
    expected,
    spread: Math.sqrt(
      runs.reduce((sum, run) => sum + (run - runMean) ** 2, 0) / runs.length,
    ),
    likely: {
      low: runs[Math.floor(runs.length * 0.1)],
      high: runs[Math.floor(runs.length * 0.9)],
    },
    bounds,
    shareAbove: (value) =>
      runs.filter((run) => run > value).length / runs.length,
  };
}

/**
 * A fixed amount plus ranged parts as one range: a single part shifted exactly, several combined by
 * adding their spreads in quadrature and reading the normal approximation.
 *
 * @param {number} fixed
 * @param {Array<{expected: number, spread: number, likely: {low: number, high: number},
 *   bounds: {low: number, high: number}, shareAbove: (value: number) => number}>} parts
 * @returns {{expected: number, spread: number, likely: {low: number, high: number},
 *   bounds: {low: number, high: number}, shareAbove: (value: number) => number}}
 */
export function combinedValueRange(fixed, parts) {
  if (parts.length === 1) {
    const [part] = parts;
    return {
      expected: fixed + part.expected,
      spread: part.spread,
      likely: { low: fixed + part.likely.low, high: fixed + part.likely.high },
      bounds: { low: fixed + part.bounds.low, high: fixed + part.bounds.high },
      shareAbove: (value) => part.shareAbove(value - fixed),
    };
  }

  const expected = parts.reduce((sum, part) => sum + part.expected, fixed);
  const spread = Math.sqrt(
    parts.reduce((sum, part) => sum + part.spread * part.spread, 0),
  );
  const bounds = {
    low: parts.reduce((sum, part) => sum + part.bounds.low, fixed),
    high: parts.reduce((sum, part) => sum + part.bounds.high, fixed),
  };
  return {
    expected,
    spread,
    likely: {
      low: Math.max(bounds.low, expected - TENTH_PERCENTILE_Z * spread),
      high: Math.min(bounds.high, expected + TENTH_PERCENTILE_Z * spread),
    },
    bounds,
    shareAbove: (value) =>
      spread === 0
        ? Number(expected > value)
        : 1 - normalCumulative((value - expected) / spread),
  };
}

/**
 * The least and most one batch is worth for each mineral it can give.
 *
 * @param {Object} item
 * @param {(typeID: string) => number} priceOf
 * @returns {Array<{low: number, high: number}>}
 */
function batchOutcomes(item, priceOf) {
  const share = item.yield / 100;
  return Object.entries(item.randomizedMaterials ?? {}).map(
    ([typeID, { quantityMin, quantityMax }]) => {
      const price = priceOf(typeID) ?? 0;
      return {
        low: quantityMin * share * price,
        high: quantityMax * share * price,
      };
    },
  );
}

/**
 * Every simulated run's value, sorted, from a fixed seed so the same item gives the same figures on
 * every render.
 *
 * @param {Array<{low: number, high: number}>} outcomes
 * @param {number} batches
 * @returns {Array<number>}
 */
function simulatedRuns(outcomes, batches) {
  const random = seededRandom(batches * 7919 + outcomes.length);
  const runs = new Array(SIMULATED_RUNS);
  for (let run = 0; run < SIMULATED_RUNS; run++) {
    let value = 0;
    for (let batch = 0; batch < batches; batch++) {
      const { low, high } = outcomes[Math.floor(random() * outcomes.length)];
      value += low + random() * (high - low);
    }
    runs[run] = value;
  }
  return runs.sort((a, b) => a - b);
}

/**
 * A repeatable source of numbers between 0 and 1 from a seed.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The share of a standard normal distribution below a value.
 *
 * @param {number} z
 * @returns {number}
 */
export function normalCumulative(z) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const erf =
    1 -
    t *
      (0.254829592 +
        t *
          (-0.284496736 +
            t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
