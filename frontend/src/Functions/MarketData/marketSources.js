import GLOBAL_CONFIG from "../../global-config-app";

/**
 * Where a price can come from.
 *
 * A caller asking for a price names a source and never learns which kind it is;
 * the kind decides who fetches it and where it is held, which is the loader's
 * concern rather than any surface's.
 *
 * @enum {string}
 */
export const SOURCE_KIND = {
  /** One of the hubs this server walks hourly and serves prices for. */
  HUB: "hub",
};

/**
 * @typedef {object} MarketSource
 * @property {string} id
 * @property {string} name
 * @property {number} regionID - The region whose order book carries it
 * @property {number} stationID - The station its prices are filtered to
 * @property {string} kind - One of SOURCE_KIND
 */

/**
 * The hubs this server prices, as sources.
 *
 * Built from the constant rather than fetched: the four are static
 * configuration that moves only when a deploy moves them, and
 * `global-config-app.parity.test.js` is what stops them drifting from
 * `esicore.DefaultMarketLocations`. Nothing waits on a request to know a market
 * exists.
 *
 * @returns {MarketSource[]}
 */
function serverHeldSources() {
  return GLOBAL_CONFIG.MARKET_OPTIONS.map((hub) => ({
    ...hub,
    kind: SOURCE_KIND.HUB,
  }));
}

/**
 * Every market a price may be asked for.
 *
 * Today that is the hubs alone. Reader-saved sources join here once there are
 * any, which is why callers read this rather than the hub list directly — the
 * seam is one function rather than every surface.
 *
 * @returns {MarketSource[]}
 */
export function allMarketSources() {
  return serverHeldSources();
}

/**
 * One source from a registry, or undefined.
 *
 * @param {MarketSource[]} sources
 * @param {string} id
 * @returns {MarketSource|undefined}
 */
export function sourceIn(sources, id) {
  return sources?.find((source) => source.id === id);
}

/**
 * What a source is called, falling back to its id.
 *
 * A source the registry does not carry is still named rather than blanked: an
 * id a reader can see is what lets them recognise a stale choice and change it.
 *
 * @param {MarketSource[]} sources
 * @param {string} id
 * @returns {string}
 */
export function sourceNameIn(sources, id) {
  return sourceIn(sources, id)?.name ?? id;
}
