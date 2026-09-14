import GLOBAL_CONFIG from "../../global-config-app";
import { resolvePricingSide } from "./pricingSide.js";
import { sourceIn } from "./marketSources.js";
import { readMarketSources } from "../../Hooks/Static/useMarketSources";

const { DEFAULT_REGION } = GLOBAL_CONFIG;

/**
 * Which market a price link opens against.
 *
 * The market a link points at is the one the figure beside it came from, so a
 * caller that knows passes it. Where a caller has none to give, the side it is
 * pricing decides — a link beside a sale price should not open the market the
 * materials were bought on.
 *
 * A caller may hand over a source or the id of one, because the components this
 * serves accept either from their own callers.
 *
 * @param {object} params
 * @param {string|object|null|undefined} params.given - A row, an id, or nothing
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

  // Price history is drawn per region, so a market the registry does not carry
  // still has to open somewhere rather than opening nothing.
  return sources.find((source) => source.regionID === DEFAULT_REGION);
}
