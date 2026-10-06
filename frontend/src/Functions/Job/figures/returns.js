import { isPriced } from "../../MarketData/prices/isPriced";

/**
 * @typedef {object} ExitRoute
 * @property {string} id
 * @property {string} label
 * @property {number} unitPrice - What one unit fetches on this route
 * @property {string} deducts - What is taken off the revenue, in words
 * @property {number} revenue - Before what selling costs
 * @property {number} net - After it
 * @property {number|null} perUnit
 * @property {number|null} margin - Net over revenue, as a fraction
 * @property {number|null} returnOnOutlay - Net over what it cost, as a fraction
 * @property {boolean} hasNoOrders - Whether the hub holds no orders on this side
 */

/**
 * @typedef {object} Returns
 * @property {ExitRoute[]} routes - Each with its own figures
 * @property {number|null} breakEvenPerUnit - What each unit must fetch to cover
 *   the build and the selling
 * @property {{price: number, above: number|null}|null} headroom - What a unit
 *   fetches today against what it must, and by how much as a fraction
 * @property {boolean} hasNoOrders - Whether the hub holds nothing on either side
 */

/**
 * The two ways out of a finished build, by the id the panel picks its headline with.
 *
 * @type {{LISTED: string, IMMEDIATE: string}}
 */
export const EXIT_ROUTE = { LISTED: "listed", IMMEDIATE: "immediate" };

/**
 * Both exit routes at the price the market is now: a listed sell order less fee and tax, and
 * selling into buy orders less tax only; every figure belongs to a route and none is picked.
 *
 * @param {object} params
 * @param {number} params.sellPrice - Unit price listing into the sell side
 * @param {number} params.buyPrice - Unit price selling into buy orders
 * @param {number} params.quantityProduced
 * @param {number} params.buildCost - What making it cost, selling excluded
 * @param {number} params.brokerFee - ISK, charged only on a listing
 * @param {number} params.salesTax - ISK, charged on either route
 * @returns {Returns}
 */
export function calculateReturns({
  sellPrice = 0,
  buyPrice = 0,
  quantityProduced = 0,
  buildCost = 0,
  brokerFee = 0,
  salesTax = 0,
}) {
  const route = (id, label, unitPrice, cost, deducts) => {
    const revenue = unitPrice * quantityProduced;
    const net = revenue - cost - buildCost;
    return {
      id,
      label,
      unitPrice,
      deducts,
      revenue,
      net,
      perUnit: quantityProduced > 0 ? net / quantityProduced : null,
      margin: fraction(net, revenue),
      returnOnOutlay: fraction(net, buildCost),
      hasNoOrders: !isPriced(unitPrice),
    };
  };

  const breakEven =
    quantityProduced > 0
      ? (buildCost + brokerFee + salesTax) / quantityProduced
      : null;

  return {
    routes: [
      route(
        EXIT_ROUTE.LISTED,
        "Sell order",
        sellPrice,
        brokerFee + salesTax,
        "less fee and tax",
      ),
      route(
        EXIT_ROUTE.IMMEDIATE,
        "Into buy orders",
        buyPrice,
        salesTax,
        "less tax",
      ),
    ],
    breakEvenPerUnit: breakEven,
    headroom:
      breakEven === null
        ? null
        : {
            price: sellPrice,
            above: fraction(sellPrice - breakEven, breakEven),
          },
    hasNoOrders: !isPriced(sellPrice) && !isPriced(buyPrice),
  };
}

/**
 * One figure against another, or null where the second is nothing, since a return on no outlay
 * is unanswerable rather than infinite.
 *
 * @param {number} value
 * @param {number} of
 * @returns {number|null}
 */
function fraction(value, of) {
  if (!of) return null;
  return value / of;
}
