import { readAdjustedPrice, readPrice } from "./priceCache";

/**
 * Every price a surface reads comes through here.
 *
 * One accessor so that a caller asks for a figure and never learns how it is
 * held — which market it came from decides who fetched it and where it lives,
 * and that is the loader's business rather than any surface's.
 *
 * Reading and asking are separate. These answer from what is already held and
 * report absence rather than waiting, which is what keeps the synchronous
 * callers working: a shopping list row and a basis comparison both read a price
 * inside a reduce, and neither can await.
 */

/**
 * One material's price at a market, on one of the four bases the server
 * publishes.
 *
 * @param {number} typeID
 * @param {string} marketLocation - A market source id
 * @param {string} listingType - buy, sell, buyP95 or sellP05
 * @returns {number} 0 where nothing holds a figure for the type at that market
 */
export function getMarketPriceForType(typeID, marketLocation, listingType) {
  return readPrice(typeID, marketLocation)?.[listingType] || 0;
}

/**
 * CCP's adjusted price for a type, which belongs to no market.
 *
 * @param {number} typeID
 * @returns {number} 0 where nothing holds one. Zero rather than undefined
 *   because the one caller multiplies by this, and undefined would cost NaN
 */
export function getAdjustedPriceForType(typeID) {
  return readAdjustedPrice(typeID) ?? 0;
}

/**
 * When the figures held for a type at a market were last refreshed.
 *
 * @param {number} typeID
 * @param {string} marketLocation
 * @returns {number|undefined} Milliseconds, or undefined where nothing holds a
 *   figure for the type
 */
export function getPriceRefreshedAt(typeID, marketLocation) {
  const updated = marketLocation
    ? readPrice(typeID, marketLocation)?.refreshedAt
    : undefined;

  return Number.isFinite(updated) && updated > 0 ? updated : undefined;
}
