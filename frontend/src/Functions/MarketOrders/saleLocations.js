import GLOBAL_CONFIG from "../../global-config-app";
import useUsersStore from "../../Zustand/usersStore";
import {
  SOURCE_KIND,
  allMarketSources,
  savedCitadels,
  sourceIn,
} from "../MarketData/registry/marketSources.js";

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
 *   set the broker fee. Null at a citadel, whose owner sets a rate instead
 * @property {number|null} brokerFee - The owner's rate at a citadel; null at an
 *   NPC station, where the rate is derived from the seller instead
 */

/**
 * The saved citadels a job can sell from.
 *
 * @returns {SaleStructure[]}
 */
export function getSaleCitadels() {
  return savedCitadels(allMarketSources());
}

/**
 * The market a job sells from when it names none: the one the account chose.
 *
 * A choice naming a market no longer saved resolves to the trading hub rather
 * than to nothing.
 *
 * @returns {SaleStructure|null}
 */
export function getDefaultSaleStructure() {
  const sources = allMarketSources();
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
 * An NPC station or a saved citadel in the one shape a caller pricing a sale
 * reads. A sale is priced at the place it happens, so a citadel answers for
 * itself and one that cannot be read carries no figures rather than a hub's.
 *
 * @param {string|null} [saleLocationID] - A saved citadel's id or a market
 *   source id, or null to fall back to the market named below
 * @param {string} [marketID] - A market source id, used when no location is named
 * @returns {SaleLocation|null}
 */
export function resolveSaleLocation(saleLocationID, marketID) {
  if (saleLocationID) {
    const named = sourceIn(allMarketSources(), saleLocationID);
    if (named?.kind === SOURCE_KIND.CITADEL) {
      return saleLocationFromCitadel(named);
    }

    if (named) return saleLocationFromStation(named);
  }

  const sources = allMarketSources();
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
    brokerFee: null,
  };
}

/**
 * @param {SaleStructure} citadel
 * @returns {SaleLocation}
 */
function saleLocationFromCitadel(citadel) {
  return {
    kind: SALE_LOCATION_KIND.CITADEL,
    id: citadel.id,
    name: citadel.name,
    feeStationID: null,
    brokerFee: citadel.brokerFee,
  };
}
