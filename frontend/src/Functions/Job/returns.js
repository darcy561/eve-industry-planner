/**
 * What a build returns, by each route out.
 *
 * States figures and the relationships between them and no verdict. Whether a
 * margin is worth the time depends on a player's capital, their week and the
 * item's turnover, none of which the app holds.
 */

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
 * The two ways out of a finished build.
 *
 * Named rather than repeated as strings: the panel picks its headline by id and
 * states the listing's charges against it, so the producer and the reader have
 * to mean the same thing by them.
 *
 * @type {{LISTED: string, IMMEDIATE: string}}
 */
export const EXIT_ROUTE = { LISTED: "listed", IMMEDIATE: "immediate" };

/**
 * Both exit routes at the price the market is now.
 *
 * Listing a sell order returns the hub sell price less fee and tax; selling into
 * buy orders returns the buy price less tax only, because nothing is listed. The
 * app does not model undercutting, order-book position, or how long a listing
 * sits.
 *
 * Every figure belongs to a route. Nothing here picks one to lead with: a player
 * selling only into buy orders would otherwise be shown a margin that is not
 * theirs, with nothing saying whose it was. The panel chooses, and says which.
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
      // A hub with no orders on this side reports a price of zero, and a real
      // order can never be zero — EVE will not take one. Without saying so the
      // figures below read as a finding rather than as an absence: a build
      // nobody is selling comes out as a total loss of everything it cost.
      hasNoOrders: unitPrice === 0,
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
      // No listing, so no broker fee — the tax is charged either way.
      route(
        EXIT_ROUTE.IMMEDIATE,
        "Into buy orders",
        buyPrice,
        salesTax,
        "less tax",
      ),
    ],
    // Linearised around today's price: the fee and the tax are shares of
    // revenue, so the price that truly breaks even would change them again.
    // Close enough to plan against, and not a solved figure.
    breakEvenPerUnit: breakEven,
    // Break-even alone says what a unit must fetch; the headroom says how far
    // today's price is above it, which is the figure that makes it worth
    // stating at all.
    headroom:
      breakEven === null
        ? null
        : {
            price: sellPrice,
            above: fraction(sellPrice - breakEven, breakEven),
          },
    // Neither side holds an order, so nothing here is priced against anything.
    hasNoOrders: sellPrice === 0 && buyPrice === 0,
  };
}

/**
 * One figure against another, or nothing where the second is nothing.
 *
 * A return measured against no outlay is not infinite, it is unanswerable — and
 * an infinity would colour every comparison beside it.
 *
 * @param {number} value
 * @param {number} of
 * @returns {number|null}
 */
function fraction(value, of) {
  if (!of) return null;
  return value / of;
}
