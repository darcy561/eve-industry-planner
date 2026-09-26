import { readAdjustedPrice, readPrice } from "./priceCache";

/**
 * One material's price at a market, on one of the four bases the server
 * publishes.
 *
 * @param {number} typeID
 * @param {string} marketLocation - A market source id
 * @param {string} orderType - buy, sell, buyP95 or sellP05
 * @returns {number} 0 where nothing holds a figure for the type at that market
 */
export function readMarketPriceForType(typeID, marketLocation, orderType) {
  return readPrice(typeID, marketLocation)?.[orderType] || 0;
}

/**
 * CCP's adjusted price for a type, which belongs to no market.
 *
 * @param {number} typeID
 * @returns {number} 0 where nothing holds one. Zero rather than undefined
 *   because the one caller multiplies by this, and undefined would cost NaN
 */
export function readAdjustedPriceForType(typeID) {
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
export function readPriceRefreshedAt(typeID, marketLocation) {
  const updated = marketLocation
    ? readPrice(typeID, marketLocation)?.refreshedAt
    : undefined;

  return Number.isFinite(updated) && updated > 0 ? updated : undefined;
}
