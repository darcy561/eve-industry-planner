import GLOBAL_CONFIG from "../../../global-config-app";
import { resolvePricingSide } from "../defaults/pricingSide";
import { sourceIn } from "./marketSources.js";
import { readMarketSources } from "../../../Hooks/Static/useMarketSources";

const { DEFAULT_REGION } = GLOBAL_CONFIG;

/**
 * Which market a price link opens against: the one the caller gives, or the one
 * the side it is pricing names.
 *
 * @param {object} params
 * @param {string|object|null|undefined} params.given - A market, an id, or nothing
 * @param {string} params.side - One of PRICING_SIDE
 * @param {object|null|undefined} params.accountPricing - `defaultPricing`
 * @param {boolean} [params.needsRegion] - Whether the caller opens a
 *   region-scoped view, which must land somewhere even when the account's market
 *   names no region
 * @returns {object|undefined} A market source
 */
export function resolveMarketLinkTarget({
  given,
  side,
  accountPricing,
  needsRegion = false,
}) {
  const sources = readMarketSources();

  if (typeof given === "string") {
    return sourceIn(sources, given);
  }
  if (given) return given;

  const { marketLocation } = resolvePricingSide({ accountPricing, side });
  const chosen = sourceIn(sources, marketLocation);
  if (chosen || !needsRegion) return chosen;

  return sources.find((source) => source.regionID === DEFAULT_REGION);
}
