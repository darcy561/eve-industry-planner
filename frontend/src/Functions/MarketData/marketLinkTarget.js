import GLOBAL_CONFIG from "../../global-config-app";
import { resolvePricingSide } from "./pricingSide.js";

const { MARKET_OPTIONS, DEFAULT_REGION } = GLOBAL_CONFIG;

/**
 * Which market a price link opens against.
 *
 * The market a link points at is the one the figure beside it came from, so a
 * caller that knows passes it. Where a caller has none to give, the side it is
 * pricing decides — a link beside a sale price should not open the market the
 * materials were bought on.
 *
 * A caller may hand over a `MARKET_OPTIONS` row or the id of one, because the
 * components this serves accept either from their own callers.
 *
 * @param {object} params
 * @param {string|object|null|undefined} params.given - A row, an id, or nothing
 * @param {string} params.side - One of PRICING_SIDE
 * @param {object|null|undefined} params.accountPricing - `defaultPricing`
 * @param {boolean} [params.needsRegion] - Whether the caller opens a
 *   region-scoped view, which must land somewhere even when the account's market
 *   names no region
 * @returns {object|undefined} A MARKET_OPTIONS row
 */
export function resolveMarketLinkTarget({
  given,
  side,
  accountPricing,
  needsRegion = false,
}) {
  if (typeof given === "string") {
    return MARKET_OPTIONS.find((option) => option.id === given);
  }
  if (given) return given;

  const { marketLocation } = resolvePricingSide({ accountPricing, side });
  const chosen = MARKET_OPTIONS.find((option) => option.id === marketLocation);
  if (chosen || !needsRegion) return chosen;

  // Price history is drawn per region, so a market the list does not carry still
  // has to open somewhere rather than opening nothing.
  return MARKET_OPTIONS.find((option) => option.regionID === DEFAULT_REGION);
}
