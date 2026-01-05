import parseInputMineralString from "./parseMineralInput";
import { reprocessingItemTypes } from "../../Context/defaultValues";
import ReprocessingItem from "../../Classes/reprocessingConstructor";
import getMarketData from "../MarketData/findMarketData";
import oreSelector from "./oreSelecter";
import { getReprocessingData } from "../Helper/getCachedData";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Processes mineral input string and finds optimal ore selection to produce those minerals.
 * Analyzes all available ores, calculates costs and yields, then selects the most
 * efficient combination based on market prices and user preferences.
 *
 * @param {string} inputString - Input string containing mineral quantities and types
 * @param {Object} skillsMap - Map of reprocessing skills and their levels
 * @param {Object} chosenStructure - Structure object with reprocessing bonuses
 * @param {string} marketLocation - Market location for price lookup
 * @param {string} marketListing - Market listing type (buy/sell orders)
 * @param {Array<number>} oreIDsToBeIgnored - Array of ore IDs to exclude from selection
 * @param {Object} reprocessingCalculationSettings - Settings for ore selection algorithm
 * @returns {Promise<Object>} Promise that resolves to ore selection results
 *
 * @example
 * const result = await reprocessFromMinerals(
 *   "1000 Tritanium",
 *   { reprocessing: 5 },
 *   { reprocessingYield: 0.5 },
 *   "jita",
 *   "sell",
 *   [123, 456],
 *   { preferCompressed: true }
 * );
 * console.log(result.oreSelection); // Selected ores
 */
async function reprocessFromMinerals(
  inputString,
  skillsMap,
  chosenStructure,
  marketLocation,
  marketListing,
  oreIDsToBeIgnored,
  reprocessingCalculationSettings
) {
  const priceRequest = new Set();

  const reprocessingObjects = {};
  const ore = await getReprocessingData();
  const items = Object.values(ore);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (
      item.itemType !== reprocessingItemTypes.ore &&
      item.itemType !== reprocessingItemTypes.unrefinedOre &&
      item.itemType !== reprocessingItemTypes.moonOre &&
      item.itemType !== reprocessingItemTypes.ice
    )
      continue;

    const obj = new ReprocessingItem(item);
    obj.addToTotalQuantity(obj.batchSize);

    priceRequest.add(obj.id);
    Object.keys(obj.materials).forEach((id) => priceRequest.add(id));

    obj.reprocessMaterials(skillsMap, chosenStructure);

    reprocessingObjects[obj.id] = obj;
  }
  const marketDataRequest = getMarketData(priceRequest);
  const mineralRequestObjects = await parseInputMineralString(inputString);
  const newMarketPrices = await marketDataRequest;

  Object.values(reprocessingObjects).forEach((item) => {
    const itemPriceObject = useUsersStore
      .getState()
      .worldData.actions.findMarketData(item.id, newMarketPrices);

    item.unitPrice = itemPriceObject[marketLocation][marketListing] ?? 0;
  });

  const oreSelection = oreSelector(
    mineralRequestObjects,
    reprocessingObjects,
    oreIDsToBeIgnored,
    reprocessingCalculationSettings
  );
  return {
    oreSelection,
    newMarketPrices,
    requestedMinerals: mineralRequestObjects,
  };
}

export default reprocessFromMinerals;
