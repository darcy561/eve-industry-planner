import parseInputMineralString from "./parseMineralInput";
import ReprocessingItem from "../../Classes/reprocessingItem";
import getMarketData from "../MarketData/findMarketData";
import oreSelector from "./oreSelector";
import { primeReprocessing, selectableItems } from "../Static/reprocessing";
import useUsersStore from "../../Zustand/usersStore";

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
 * @returns {Promise<{oreSelection: Object, newMarketPrices: Object, requestedMinerals: Object}>}
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
  const marketDataRequest = getMarketData(priceRequest);
  const mineralRequestObjects = await parseInputMineralString(inputString);
  const newMarketPrices = await marketDataRequest;

  Object.values(reprocessingObjects).forEach((item) => {
    const itemPriceObject = useUsersStore
      .getState()
      .worldData.actions.findMarketData(item.id, newMarketPrices);

    item.unitPrice = itemPriceObject[marketLocation][listingType] ?? 0;
  });

  const oreSelection = oreSelector(
    mineralRequestObjects,
    reprocessingObjects,
    oreIDsToBeIgnored,
    reprocessingCalculationSettings,
  );
  return {
    oreSelection,
    newMarketPrices,
    requestedMinerals: mineralRequestObjects,
  };
}

export default reprocessFromMinerals;
