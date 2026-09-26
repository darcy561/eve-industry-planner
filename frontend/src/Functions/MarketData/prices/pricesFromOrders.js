/**
 * Below this many orders on a side, the percentile degenerates towards the best
 * price, so the best price is reported instead.
 */
const MIN_ORDERS_FOR_PERCENTILE = 5;

const BUY_PERCENTILE = 0.95;
const SELL_PERCENTILE = 0.05;

/**
 * @typedef {object} DerivedPrices
 * @property {number} buy - Highest bid, or 0 where nobody is buying
 * @property {number} sell - Lowest ask, or 0 where nobody is selling
 * @property {number} buyP95 - Outlier-trimmed bid
 * @property {number} sellP05 - Outlier-trimmed ask
 */

/**
 * The four prices for every type in a set of orders, a type with no order at the
 * location being absent rather than zero.
 *
 * @param {Array<{price: number, type_id: number|string, is_buy_order: boolean,
 *   location_id: number|string}>} orders - Orders as ESI returns them, for any
 *   location
 * @param {number|string} locationID - The one location whose orders count. A
 *   region's orders cover every station in it, so a caller that skips this
 *   prices the wrong market
 * @returns {Map<string, DerivedPrices>}
 */
export function pricesByType(orders, locationID) {
  const wanted = String(locationID);
  /** @type {Map<string, {buy: number[], sell: number[]}>} */
  const sides = new Map();

  for (const order of orders ?? []) {
    if (String(order?.location_id) !== wanted) continue;
    if (!Number.isFinite(order?.price)) continue;

    const typeID = String(order.type_id);
    let held = sides.get(typeID);
    if (!held) {
      held = { buy: [], sell: [] };
      sides.set(typeID, held);
    }

    (order.is_buy_order ? held.buy : held.sell).push(order.price);
  }

  return new Map(
    [...sides].map(([typeID, { buy, sell }]) => [
      typeID,
      pricesFromSides(buy, sell),
    ]),
  );
}

/**
 * The four figures, for a caller that sorted the prices onto each side as it
 * read them and holds no orders to filter.
 *
 * @param {number[]} buyPrices
 * @param {number[]} sellPrices
 * @returns {{buy: number, sell: number, buyP95: number, sellP05: number}}
 */
function pricesFromSides(buyPrices, sellPrices) {
  const buy = highestPrice(buyPrices);
  const sell = lowestPrice(sellPrices);

  return {
    buy,
    sell,
    buyP95: percentilePrice(buyPrices, BUY_PERCENTILE, buy),
    sellP05: percentilePrice(sellPrices, SELL_PERCENTILE, sell),
  };
}

/**
 * The nearest-rank percentile, or the fallback where the sample is too small to
 * carry meaning.
 *
 * @param {number[]} prices
 * @param {number} percentile
 * @param {number} fallback
 * @returns {number}
 */
function percentilePrice(prices, percentile, fallback) {
  if (prices.length < MIN_ORDERS_FOR_PERCENTILE) return fallback;

  const sorted = [...prices].sort((a, b) => a - b);

  let rank = Math.ceil(percentile * sorted.length) - 1;
  rank = Math.max(rank, 0);
  rank = Math.min(rank, sorted.length - 1);

  return sorted[rank];
}

/** @param {number[]} prices @returns {number} 0 for an empty side */
function highestPrice(prices) {
  return prices.length === 0 ? 0 : Math.max(...prices);
}

/** @param {number[]} prices @returns {number} 0 for an empty side */
function lowestPrice(prices) {
  return prices.length === 0 ? 0 : Math.min(...prices);
}
