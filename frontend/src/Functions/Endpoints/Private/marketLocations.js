import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const MARKET_LOCATIONS_URL = "/api/v1/user/market-locations";

/**
 * The markets this account may price against, composed by the server.
 *
 * This module is the client and nothing more. What a market is, which of them a
 * reader is offered and how their prices are kept belong to the market package
 * ({@link ../../MarketData/marketSources.js}).
 */

/**
 * Reads the composed set: the account's own markets, plus the ones each
 * organisation it belongs to has shared.
 *
 * Composed on the server rather than here, so the rule for collapsing two rows
 * that name one place, and for which owner wins when they disagree, exists once.
 *
 * @returns {Promise<Array<object>>}
 * @throws where the set could not be read, so a caller can tell an account with
 *   no markets from an answer that did not arrive
 */
export async function fetchMarketLocations() {
  const response = await requestWithPrivateHeaders(
    MARKET_LOCATIONS_URL,
    { method: "GET" },
    { requestName: "fetchMarketLocations" },
  );
  if (!response.ok) {
    throw new Error(
      `market locations: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.json();
  return Array.isArray(body?.marketLocations) ? body.marketLocations : [];
}
