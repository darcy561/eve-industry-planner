import GLOBAL_CONFIG from "../../global-config-app";
import { sourceIn } from "../MarketData/marketSources";
import { readMarketSources } from "../../Hooks/Static/useMarketSources";
import useUsersStore from "../../Zustand/usersStore";
import { structureKinds } from "../../Context/defaultValues";

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
 * @typedef {import("../../Classes/structure").default} SaleStructure
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
  return (
    useUsersStore.getState().applicationSettings.customStructures ?? []
  ).filter(
    (structure) =>
      structure.jobType === structureKinds.market &&
      Boolean(structure.structureID),
  );
}

/**
 * The saved citadel a job sells from when it names none.
 *
 * Read imperatively rather than through a hook because the callers here run in
 * a query function and a reducer as well as in render.
 *
 * @returns {SaleStructure|null}
 */
export function getDefaultSaleStructure() {
  return useUsersStore
    .getState()
    .applicationSettings.actions.getDefaultCustomStructureWithJobType(
      structureKinds.market,
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
    const citadel = useUsersStore
      .getState()
      .applicationSettings.actions.getCustomStructureWithID(saleLocationID);
    if (citadel?.jobType === structureKinds.market && citadel.structureID) {
      return saleLocationFromCitadel(citadel);
    }

    // A named NPC station is a choice like any other. Falling through to the
    // argument below sold the job from whichever market the materials happened
    // to be priced against, quietly ignoring the station that was picked.
    const chosen = sourceIn(readMarketSources(), saleLocationID);
    if (chosen) return saleLocationFromStation(chosen);
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
  // A saved citadel is a market, but nothing can read its book yet: that needs
  // `/markets/structures/` and the docking character the row carries. Until
  // then every citadel prices against the same default market, so a reader
  // selling from one sees an estimate rather than nothing.
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
