import { fetchPrices } from "../MarketData/priceCache";
import gatherMaterialTotals from "./combineMinerals";
import parseReprocessingInput from "./parseOreInput";
import { primeReprocessing } from "../Static/reprocessing";

/**
 * What a pasted list of ore yields once reprocessed, and what those materials are worth.
 *
 * @param {string} inputString - ore names and quantities, one per line
 * @param {Object} skillsMap - the player's reprocessing skills by level
 * @param {Object} reprocessingStructure - the structure the reprocessing is done in
 * @param {string} marketLocation - the market the page prices against
 * @returns {Promise<{reprocessingObjects: Array<Object>, mineralTotals: Object}>}
 *   Prices resolve into the cache rather than being returned
 */
async function reprocessIntoMinerals(
  inputString,
  skillsMap,
  reprocessingStructure,
  marketLocation,
) {
  const priceRequest = new Set();
  await primeReprocessing();
  const reprocessingObjects = parseReprocessingInput(inputString);
  for (let material of reprocessingObjects) {
    material.reprocessMaterials(skillsMap, reprocessingStructure);
    priceRequest.add(material.id);
    Object.keys(material.materials).forEach((id) => priceRequest.add(id));
  }
  const pricesSettled = fetchPrices({
    wants: [...priceRequest].map((typeID) => ({
      typeID,
      sourceID: marketLocation,
    })),
  });
  const mineralTotals = gatherMaterialTotals(reprocessingObjects);
  await pricesSettled;

  return { reprocessingObjects, mineralTotals };
}

export default reprocessIntoMinerals;
