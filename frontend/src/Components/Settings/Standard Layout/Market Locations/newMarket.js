import {
  LOCATION_KIND,
  resolveLocationKind,
} from "../../../../Functions/Assets/assetLocationConstants";
import {
  customStructureLocationMap,
  structureKinds,
} from "../../../../Context/defaultValues";

/**
 * The highest broker fee a citadel's owner can be charging, as a percentage.
 *
 * The server refuses a lane holding more than this, so a field that took one
 * would build a document every later save is refused for — and the refusal
 * reaches a reader as nothing but a figure that never sticks.
 */
export const MAX_BROKER_FEE_PERCENT = 100;

/**
 * The prefix every market id already carries, read from the table that names
 * one per kind rather than restated here — a second spelling would mint ids in
 * a shape beside the one a reader's saved markets have.
 */
const ID_PREFIX = customStructureLocationMap[structureKinds.market];

/**
 * A market as it is stored, built from what a reader chose and what was derived
 * from it.
 *
 * One place mints the row, so the fields a market carries are decided here
 * rather than by whichever surface happens to be saving one. Which sort of
 * market it is follows from the place: an EVE location id says that by the
 * range it falls in, and the id lands in the field that says so — never both,
 * because a row holding both is a market of neither sort.
 *
 * @param {object} chosen
 * @param {string} chosen.name
 * @param {number} chosen.locationID - The station or citadel the reader picked
 * @param {import("../Structure/describeMarketLocation").MarketLocationFacts} chosen.facts
 * @param {number} [chosen.brokerFee] - A citadel's rate. An NPC station's comes
 *   from the seller's skills and standings, so one stored here would quote the
 *   untrained rate without saying so
 * @returns {object}
 */
export function newMarketLocation({ name, locationID, facts, brokerFee = 0 }) {
  const atStation = resolveLocationKind(locationID) === LOCATION_KIND.STATION;

  return {
    id: `${ID_PREFIX}-${crypto.randomUUID()}`,
    name,
    regionID: facts.regionID,
    ...(atStation
      ? {
          stationID: locationID,
          raceID: facts.raceID ?? 0,
          ownerID: facts.ownerID ?? 0,
        }
      : { structureID: locationID, brokerFee }),
  };
}
