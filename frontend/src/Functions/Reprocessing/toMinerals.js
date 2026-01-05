import getMarketData from "../MarketData/findMarketData";
import gatherMaterialTotals from "./combineMinerals";
import parseReprocessingInput from "./parseOreInput";
import { getReprocessingData } from "../Helper/getCachedData";

/**
 * Processes ore input string and converts it into mineral outputs with market pricing.
 * Parses the input, calculates reprocessing yields based on skills and structure,
 * and fetches current market prices for all materials.
 * 
 * @param {string} inputString - Input string containing ore quantities and types
 * @param {Object} skillsMap - Map of reprocessing skills and their levels
 * @param {Object} reprocessingStructure - Structure object with reprocessing bonuses
 * @returns {Promise<Object>} Promise that resolves to reprocessing results object
 * 
 * @example
 * const result = await reprocessIntoMinerals(
 *   "1000 Tritanium Ore",
 *   { reprocessing: 5, metallurgy: 4 },
 *   { reprocessingYield: 0.5 }
 * );
 * console.log(result.mineralTotals); // Total minerals produced
 */
async function reprocessIntoMinerals(
  inputString,
  skillsMap,
  reprocessingStructure,
) {
  const priceRequest = new Set();
  const ore = await getReprocessingData();
  const reprocessingObjects = parseReprocessingInput(inputString, ore);
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
