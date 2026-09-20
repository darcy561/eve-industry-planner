import getStationData from "../EveESI/World/getStationData";
import getSystemData from "../EveESI/World/getSystemData";
import getConstellationData from "../EveESI/World/getConstellationData";
import {
  LOCATION_KIND,
  resolveLocationKind,
} from "../Assets/assetLocationConstants";

/**
 * @typedef {object} MarketLocationFacts
 * @property {number} regionID - The region whose order book carries it
 * @property {number} [raceID] - The race that built the station
 * @property {number} [ownerID] - The corporation that owns it
 */

/**
 * What a saved market needs to know about the place it is, asked once.
 *
 * A reader names a station or a citadel; everything else is derived. An order
 * book is read per region and then narrowed, so a market with no region can be
 * offered in a picker and price nothing — which is why this is asked for at the
 * point one is saved rather than left to whatever reads it later.
 *
 * A station also answers what its broker fee is worked out from. The race names
 * the faction a standing is held against and the owner is the corporation
 * holding the other, and neither changes for the life of the station, so they
 * are read here and stored rather than fetched per quote.
 *
 * A citadel is not asked: `/universe/structures/` needs the docking character,
 * and its region comes from the system the reader is told it sits in.
 *
 * @param {number} locationID - The station or structure a reader chose
 * @param {number} [systemID] - The system a citadel sits in, when known
 * @returns {Promise<MarketLocationFacts|null>} Null when the chain could not be walked
 */
export default async function describeMarketLocation(locationID, systemID) {
  const atStation = resolveLocationKind(locationID) === LOCATION_KIND.STATION;

  if (!atStation) {
    const regionID = await regionOfSystem(systemID);
    return regionID ? { regionID } : null;
  }

  const station = await getStationData(locationID);
  if (!station) return null;

  const regionID = await regionOfSystem(station.system_id);
  if (!regionID) return null;

  return {
    regionID,
    raceID: station.race_id ?? 0,
    ownerID: station.owner ?? 0,
  };
}

/**
 * The region a system sits in, by way of its constellation.
 *
 * @param {number} systemID
 * @returns {Promise<number|null>}
 */
async function regionOfSystem(systemID) {
  if (!systemID) return null;

  const system = await getSystemData(systemID);
  if (!system?.constellation_id) return null;

  const constellation = await getConstellationData(system.constellation_id);
  return constellation?.region_id ?? null;
}
