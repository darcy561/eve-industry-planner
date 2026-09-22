import GLOBAL_CONFIG from "../../global-config-app";
import useUsersStore from "../../Zustand/usersStore";
import { SOURCE_KIND, sourceIn } from "../MarketData/marketSources";
import { readMarketSources } from "../../Hooks/Static/useMarketSources";

/**
 * The kinds of place a job can be sold from.
 *
 * An NPC station's broker fee is derived from the seller's skills and standings;
 * a citadel's is the rate its owner set. That is the difference every consumer
 * reads this to find.
 *
 * @enum {string}
 */
export const SALE_LOCATION_KIND = {
  NPC_STATION: "npcStation",
  CITADEL: "citadel",
};

/**
 * A saved market as it is stored, which is what these read — not the class the
 * four build kinds are held in, which a market left when it got its own lane.
 *
 * @typedef {object} SaleStructure
 * @property {string} id
 * @property {string} name
 * @property {number} regionID
 * @property {number} [structureID] - A citadel holds one, a station none
 * @property {number} [stationID] - And the other way about
 * @property {number} [brokerFee] - The rate a citadel's owner set; a station's
 *   is worked out from the seller's skills and standings instead
 * @property {boolean} [default]
 */

/**
 * @typedef {object} SaleLocation
 * @property {string} kind - One of SALE_LOCATION_KIND
 * @property {string} id - The market source id, or the saved citadel's id
 * @property {string} name - Display name
 * @property {number|null} feeStationID - The NPC station whose owner's standings
 *   set the broker fee. Null at a citadel, whose owner sets a rate instead —
 *   it is not the station the figures are priced against, which is pricedAtID
 * @property {string} pricedAtID - The market the figures are priced against
 * @property {string} pricedAtName - What that market is called
 * @property {number|null} brokerFee - The owner's rate at a citadel; null at an
 *   NPC station, where the rate is derived from the seller instead
 */

/**
 * The saved citadels a job can sell from.
 *
 * @returns {SaleStructure[]}
 */
export function getSaleCitadels() {
  return readMarketSources().filter(
    (market) => market.kind === SOURCE_KIND.CITADEL,
  );
}

/**
 * The market a job sells from when it names none: the one the account chose.
 *
 * The account's own choice rather than a flag on one of the saved markets. A
 * reader buys in one place and lists in another as a matter of course, so the
 * question has two answers and they are kept where both are asked.
 *
 * A choice naming a market that is no longer saved — removed, or an
 * organisation stopped sharing it — resolves to the trading hub rather than to
 * nothing, which is the same answer as before anything was chosen.
 *
 * Read imperatively rather than through a hook because the callers here run in
 * a query function and a reducer as well as in render.
 *
 * @returns {SaleStructure|null}
 */
export function getDefaultSaleStructure() {
  const sources = readMarketSources();
  const chosen =
    useUsersStore.getState().applicationSettings.defaultPricing?.selling
      ?.market;

  return (
    sourceIn(sources, chosen) ??
    sourceIn(sources, GLOBAL_CONFIG.DEFAULT_MARKET_OPTION) ??
    null
  );
}

/**
 * Normalises an NPC station or a saved citadel into the one shape a caller
 * pricing a sale reads, so neither kind is handled twice.
 *
 * @param {string|null} [saleLocationID] - A saved citadel's id or a market
 *   source id, or null to fall back to the market named below
 * @param {string} [marketID] - A market source id, used when no location is named
 * @returns {SaleLocation|null}
 */
export function resolveSaleLocation(saleLocationID, marketID) {
  if (saleLocationID) {
    const named = sourceIn(readMarketSources(), saleLocationID);
    if (named?.kind === SOURCE_KIND.CITADEL) {
      return saleLocationFromCitadel(named);
    }

    // A named NPC station is a choice like any other, and is not overridden by
    // the market the materials happen to be priced against.
    if (named) return saleLocationFromStation(named);
  }

  const sources = readMarketSources();
  const station =
    sourceIn(sources, marketID) ??
    sourceIn(sources, GLOBAL_CONFIG.DEFAULT_MARKET_OPTION);
  if (!station) return null;

  return saleLocationFromStation(station);
}

/**
 * @param {{id: string, name: string, stationID: number}} station
 * @returns {SaleLocation}
 */
function saleLocationFromStation(station) {
  return {
    kind: SALE_LOCATION_KIND.NPC_STATION,
    id: station.id,
    name: station.name,
    feeStationID: station.stationID,
    pricedAtID: station.id,
    pricedAtName: station.name,
    brokerFee: null,
  };
}

/**
 * @param {SaleStructure} citadel
 * @returns {SaleLocation}
 */
function saleLocationFromCitadel(citadel) {
  // Every citadel prices against the default market rather than against its own
  // orders, which are readable. Changing it moves the figures on this stage, so
  // it is a decision of its own rather than a consequence of the read existing.
  const pricedAt = sourceIn(
    readMarketSources(),
    GLOBAL_CONFIG.DEFAULT_MARKET_OPTION,
  );

  return {
    kind: SALE_LOCATION_KIND.CITADEL,
    id: citadel.id,
    name: citadel.name,
    // No standings apply: the owner sets the rate.
    feeStationID: null,
    pricedAtID: pricedAt?.id ?? null,
    pricedAtName: pricedAt?.name ?? null,
    brokerFee: citadel.brokerFee,
  };
}
