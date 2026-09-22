import { vi } from "vitest";

/**
 * Markets a reader has saved, and the registry mock that offers them.
 *
 * `allMarketSources()` is the one seam a saved market joins the app at, so a
 * test about pricing one stands that seam up rather than the settings store
 * beneath it. Every such test needs the same three lines of `importOriginal`
 * plumbing and the same source literals, which is what lives here.
 *
 * @see Functions/MarketData/marketSources
 */

/** The station and structure ids the fixtures use, for a test to assert on. */
export const SAVED_STATION_ID = 60004588;
export const SAVED_STRUCTURE_ID = 1035466617946;

/**
 * A saved NPC station, which this server prices as it prices a hub.
 *
 * @param {object} [overrides]
 * @returns {object} A market source
 */
export function savedStation(overrides = {}) {
  return {
    id: "saved-station",
    name: "A station the reader saved",
    regionID: 10000030,
    stationID: SAVED_STATION_ID,
    kind: "station",
    ...overrides,
  };
}

/**
 * A saved citadel, which the browser reads on the reader's own characters.
 *
 * @param {object} [overrides]
 * @returns {object} A market source
 */
export function savedCitadel(overrides = {}) {
  return {
    id: "saved-citadel",
    name: "A citadel the reader saved",
    regionID: 10000002,
    structureID: SAVED_STRUCTURE_ID,
    kind: "citadel",
    ...overrides,
  };
}

/**
 * The registry module, with the real hubs plus whatever this test saved.
 *
 * `vi.mock` is hoisted above a file's imports, so this is reached from inside
 * the factory rather than passed to it:
 *
 * ```js
 * vi.mock("./marketSources", async () => {
 *   const { marketSourcesWith, savedCitadel } = await import(
 *     "../../tests/marketSourceFixtures.js"
 *   );
 *   return marketSourcesWith(savedCitadel());
 * });
 * ```
 *
 * Everything else the module exports stays real: the kinds and the tier map are
 * facts a test about pricing should be held to rather than free to invent.
 *
 * @param {...(object|(() => object[]))} saved - Sources to offer beyond the
 *   hubs. A function is called at read time, for a test that changes what is
 *   saved between cases
 * @returns {Promise<object>} The mocked module
 */
export async function marketSourcesWith(...saved) {
  const real = await vi.importActual(
    "../Functions/MarketData/marketSources.js",
  );

  return {
    ...real,
    allMarketSources: () => [
      ...real.allMarketSources(),
      ...saved.flatMap((source) =>
        typeof source === "function" ? source() : source,
      ),
    ],
  };
}

/**
 * A market as an account has it stored, on the lane a market lives on.
 *
 * The stored row, as against the source a price is asked for — `savedCitadel`
 * above is what the registry hands a caller, this is what the settings document
 * holds. A test that seeds a reader's markets wants this one.
 *
 * @param {object} [overrides]
 * @returns {object} A stored market location
 */
export function storedCitadel(overrides = {}) {
  return {
    id: "market-1",
    name: "Perimeter Azbel",
    regionID: 10000002,
    structureID: SAVED_STRUCTURE_ID,
    brokerFee: 2.5,
    ...overrides,
  };
}

/**
 * An NPC station as an account has it stored.
 *
 * No broker fee: a station's is worked out from the seller's skills and
 * standings, and a stored number there would quote the untrained rate without
 * saying so.
 *
 * @param {object} [overrides]
 * @returns {object} A stored market location
 */
export function storedStation(overrides = {}) {
  return {
    id: "market-station-1",
    name: "Rens VI - Moon 8",
    regionID: 10000030,
    stationID: SAVED_STATION_ID,
    ...overrides,
  };
}
