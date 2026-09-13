import getMarketData from "../MarketData/findMarketData";
import gatherMaterialTotals from "./combineMinerals";
import parseReprocessingInput from "./parseOreInput";
import { primeReprocessing } from "../Static/reprocessing";

/**
 * What a pasted list of ore yields once reprocessed, and what those materials are worth.
 *
 * @param {string} inputString - ore names and quantities, one per line
 * @param {Object} skillsMap - the player's reprocessing skills by level
 * @param {Object} reprocessingStructure - the structure the reprocessing is done in
 * @returns {Promise<{reprocessingObjects: Array<Object>, mineralTotals: Object, newMarketPrices: Object}>}
 */
async function reprocessIntoMinerals(
  inputString,
  skillsMap,
  reprocessingStructure,
) {
  const priceRequest = new Set();
  await primeReprocessing();
  const reprocessingObjects = parseReprocessingInput(inputString);
  for (let material of reprocessingObjects) {
    material.reprocessMaterials(skillsMap, reprocessingStructure);
    priceRequest.add(material.id);
    Object.keys(material.materials).forEach((id) => priceRequest.add(id));
  }
  const marketPricesRequest = getMarketData(priceRequest);
  const mineralTotals = gatherMaterialTotals(reprocessingObjects);
  const newMarketPrices = await marketPricesRequest;

  return {
    reprocessingObjects,
    mineralTotals,
    newMarketPrices,
  };
}

export default reprocessIntoMinerals;
