import GLOBAL_CONFIG from "../../global-config-app";
import { sourceIn } from "../MarketData/marketSources";
import { readMarketSources } from "../../Hooks/Static/useMarketSources";

/**
 * The kinds of location a job can be sold from. A preset hub's broker fee is
 * derived from the seller's skills and standings; a structure's is the rate its
 * owner set, which only the player can supply.
 *
 * @enum {string}
 */
export const SALE_LOCATION_KIND = {
  HUB: "hub",
  STRUCTURE: "structure",
};

/**
 * Stand-ins for saved citadels, so the panels that price a sale can be built and
 * tested before the stored list exists.
 *
 * Deliberately not exported: they carry the full shape a stored row will, and
 * every caller reaches them through the functions below, so replacing the source
 * with the stored list is a change to this file alone.
 *
 * There are two, and they disagree on every field that changes a figure — fee,
 * hub, and which is the default — so a consumer that quietly assumes one
 * citadel, or reads the default where it should read the chosen row, produces a
 * visibly wrong number rather than a coincidentally right one.
 *
 * @type {SaleStructure[]}
 */
const PLACEHOLDER_SALE_STRUCTURES = [
  {
    id: "placeholder-sale-structure",
    structureID: 1035466617946,
    name: "Placeholder Citadel",
    brokerFee: 1.5,
    priceHub: "jita",
    default: true,
  },
  {
    id: "placeholder-sale-structure-2",
    structureID: 1041366702033,
    name: "Second Placeholder Citadel",
    brokerFee: 3.25,
    priceHub: "amarr",
    default: false,
  },
];

/**
 * @typedef {object} SaleStructure
 * @property {string} id - Stable id of the saved row
 * @property {number} structureID - The in-game structure
 * @property {string} name - What the structure is called
 * @property {number} brokerFee - The rate its owner set, as a percentage
 * @property {string} priceHub - Which market source its figures price against
 * @property {boolean} default - Whether it is the one used when none is chosen
 */

/**
 * @typedef {object} SaleLocation
 * @property {string} kind - One of SALE_LOCATION_KIND
 * @property {string} id - Hub id, or the saved row's id
 * @property {string} name - Display name
 * @property {number|null} feeStationID - The NPC station whose owner's standings
 *   set the broker fee. Null at a structure, whose owner sets a rate instead —
 *   it is not the station the figures are priced against, which is priceHubID
 * @property {string} priceHubID - The market the figures are priced against
 * @property {string} priceHubName - What that hub is called
 * @property {number|null} brokerFee - The owner's rate for a structure; null at a
 *   hub, where the rate is derived from the seller instead
 */

/**
 * The saved citadels a player can sell from.
 *
 * @returns {SaleStructure[]}
 */
export function getSaleStructures() {
  return PLACEHOLDER_SALE_STRUCTURES;
}

/**
 * The saved citadel used when a job names none.
 *
 * @returns {SaleStructure|null}
 */
export function getDefaultSaleStructure() {
  const structures = getSaleStructures();
  return structures.find((i) => i.default) ?? structures[0] ?? null;
}

/**
 * Normalises a hub or a saved citadel into the one shape a caller pricing a sale
 * reads, so neither kind is handled twice.
 *
 * @param {string|null} [saleLocationID] - A saved citadel's id or an NPC station's,
 *   or null to fall back to the hub
 * @param {string} [hubID] - A market source id, used when no location is named
 * @returns {SaleLocation|null}
 */
export function resolveSaleLocation(saleLocationID, hubID) {
  if (saleLocationID) {
    const structure = getSaleStructures().find((i) => i.id === saleLocationID);
    if (structure) return saleLocationFromStructure(structure);

    // A named NPC station is a choice like any other. Falling through to the
    // hub argument here sold the job from whichever hub the materials happened
    // to be priced against, quietly ignoring the station that was picked.
    const chosen = sourceIn(readMarketSources(), saleLocationID);
    if (chosen) return saleLocationFromHub(chosen);
  }

  const sources = readMarketSources();
  const hub =
    sourceIn(sources, hubID) ??
    sourceIn(sources, GLOBAL_CONFIG.DEFAULT_MARKET_OPTION);
  if (!hub) return null;

  return saleLocationFromHub(hub);
}

/**
 * @param {{id: string, name: string, stationID: number}} hub
 * @returns {SaleLocation}
 */
function saleLocationFromHub(hub) {
  return {
    kind: SALE_LOCATION_KIND.HUB,
    id: hub.id,
    name: hub.name,
    feeStationID: hub.stationID,
    priceHubID: hub.id,
    priceHubName: hub.name,
    brokerFee: null,
  };
}

/**
 * @param {SaleStructure} structure
 * @returns {SaleLocation}
 */
function saleLocationFromStructure(structure) {
  // A structure has no market of its own, so its figures price against a hub.
  const sources = readMarketSources();
  const hub =
    sourceIn(sources, structure.priceHub) ??
    sourceIn(sources, GLOBAL_CONFIG.DEFAULT_MARKET_OPTION);

  return {
    kind: SALE_LOCATION_KIND.STRUCTURE,
    id: structure.id,
    name: structure.name,
    // No standings apply: the owner sets the rate.
    feeStationID: null,
    priceHubID: hub?.id ?? null,
    priceHubName: hub?.name ?? null,
    brokerFee: structure.brokerFee,
  };
}
