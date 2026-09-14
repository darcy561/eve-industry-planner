/**
 * What an order book comes to: the four prices a market is read on.
 *
 * The server derives these for the markets it walks, and this derives them for
 * the markets the browser fetches itself — a reader's saved station or citadel.
 * A figure from either sits in the same column, so the two must agree, and
 * nothing connects them at runtime. `testing/fixtures/market-derivation/books.json`
 * is written from the server's own derivation and read by the parity test beside
 * this file, so a change to one side without the other fails rather than quietly
 * giving one market a different meaning.
 */

/**
 * Below this many orders on a side, the percentile degenerates towards the best
 * price, so the best price is reported instead.
 */
const MIN_ORDERS_FOR_PERCENTILE = 5;

const BUY_PERCENTILE = 0.95;
const SELL_PERCENTILE = 0.05;

/**
 * @typedef {object} BookPrices
 * @property {number} buy - Highest bid, or 0 where nobody is buying
 * @property {number} sell - Lowest ask, or 0 where nobody is selling
 * @property {number} buyP95 - Outlier-trimmed bid
 * @property {number} sellP05 - Outlier-trimmed ask
 */

/**
 * The four prices for one type at one location.
 *
 * @param {Array<{price: number, is_buy_order: boolean, location_id: number|string}>} orders -
 *   Orders as ESI returns them, for any location
 * @param {number|string} locationID - The one location whose orders count. A
 *   region's orders cover every station in it, so a caller that skips this
 *   prices the wrong market
 * @returns {BookPrices}
 */
export function deriveBookPrices(orders, locationID) {
  const wanted = String(locationID);
  const buyPrices = [];
  const sellPrices = [];

  for (const order of orders ?? []) {
    if (String(order?.location_id) !== wanted) continue;
    const price = order?.price;
    if (!Number.isFinite(price)) continue;

    if (order.is_buy_order) {
      buyPrices.push(price);
    } else {
      sellPrices.push(price);
    }
  }

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

  // Nearest-rank: ceil(p * N) as a 1-based rank, clamped into the array.
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
