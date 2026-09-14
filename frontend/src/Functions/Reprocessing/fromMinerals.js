import parseInputMineralString from "./parseMineralInput";
import ReprocessingItem from "../../Classes/reprocessingItem";
import { fetchPrices } from "../MarketData/priceCache";
import { getMarketPriceForType } from "../MarketData/marketPriceForType";
import oreSelector from "./oreSelector";
import { primeReprocessing, selectableItems } from "../Static/reprocessing";

/**
 * Which ore to buy to produce the minerals a player asked for, priced against the market.
 *
 * Every item selection may choose from is costed, so the choice is made against what each would
 * actually cost rather than against yield alone.
 *
 * @param {string} inputString - mineral names and quantities, one per line
 * @param {Object} skillsMap - the player's reprocessing skills by level
 * @param {Object} chosenStructure - the structure the reprocessing is done in
 * @param {string} marketLocation - which market's prices to cost against
 * @param {string} listingType - buy or sell orders
 * @param {Array<number>} oreIDsToBeIgnored - ores the player has excluded
 * @param {Object} reprocessingCalculationSettings - how selection weighs its options
 * @returns {Promise<{oreSelection: Object, requestedMinerals: Object}>} Prices
 *   resolve into the cache rather than being returned
 */
async function reprocessFromMinerals(
  inputString,
  skillsMap,
  chosenStructure,
  marketLocation,
  listingType,
  oreIDsToBeIgnored,
  reprocessingCalculationSettings,
) {
  const priceRequest = new Set();

  const reprocessingObjects = {};
  await primeReprocessing();
  for (const item of selectableItems()) {
    const obj = new ReprocessingItem(item);
    obj.addToTotalQuantity(obj.batchSize);

    priceRequest.add(obj.id);
    Object.keys(obj.materials).forEach((id) => priceRequest.add(id));

    obj.reprocessMaterials(skillsMap, chosenStructure);

    reprocessingObjects[obj.id] = obj;
  }
  const pricesSettled = fetchPrices({
    wants: [...priceRequest].map((typeID) => ({
      typeID,
      sourceID: marketLocation,
    })),
  });
  const mineralRequestObjects = await parseInputMineralString(inputString);
  await pricesSettled;

  Object.values(reprocessingObjects).forEach((item) => {
    item.unitPrice = getMarketPriceForType(
      item.id,
      marketLocation,
      listingType,
    );
  });

  const oreSelection = oreSelector(
    mineralRequestObjects,
    reprocessingObjects,
    oreIDsToBeIgnored,
    reprocessingCalculationSettings,
  );
  return {
    oreSelection,
    requestedMinerals: mineralRequestObjects,
  };
}

export default reprocessFromMinerals;
