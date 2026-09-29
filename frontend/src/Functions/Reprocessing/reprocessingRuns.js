import { fetchPrices } from "../MarketData/prices/priceCache.js";
import { readMarketPriceForType } from "../MarketData/prices/marketPriceForType.js";
import ReprocessingItem from "../../Classes/reprocessingItem";
import { reprocessingItemTypes } from "../../Context/defaultValues";
import { primeReprocessing, selectableItems } from "../Static/reprocessing";
import {
  parseInputMineralString,
  parseReprocessingInput,
} from "./reprocessingInput";
import oreSelector from "./oreSelector";

/**
 * What a pasted list of ore yields once reprocessed, and what those materials are
 * worth.
 *
 * @param {string} inputString - ore names and quantities, one per line
 * @param {Object} skillsMap - the player's reprocessing skills by level
 * @param {Object} reprocessingStructure - the structure the reprocessing is done in
 * @param {string} marketLocation - the market the page prices against
 * @returns {Promise<{reprocessingObjects: Array<Object>, mineralTotals: Object}>}
 *   Prices resolve into the cache rather than being returned
 */
export async function reprocessIntoMinerals(
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
      marketLocation,
    })),
  });
  const mineralTotals = gatherMaterialTotals(reprocessingObjects);
  await pricesSettled;

  return { reprocessingObjects, mineralTotals };
}

/**
 * Which ore to buy to produce the minerals a player asked for, costed against the
 * market so the choice weighs price rather than yield alone.
 *
 * @param {string} inputString - mineral names and quantities, one per line
 * @param {Object} skillsMap - the player's reprocessing skills by level
 * @param {Object} chosenStructure - the structure the reprocessing is done in
 * @param {string} marketLocation - which market's prices to cost against
 * @param {string} orderType - buy or sell orders
 * @param {Array<number>} oreIDsToBeIgnored - ores the player has excluded
 * @param {Object} reprocessingCalculationSettings - how selection weighs its options
 * @returns {Promise<{oreSelection: Object, requestedMinerals: Object}>} Prices
 *   resolve into the cache rather than being returned
 */
export async function reprocessFromMinerals(
  inputString,
  skillsMap,
  chosenStructure,
  marketLocation,
  orderType,
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
      marketLocation,
    })),
  });
  const mineralRequestObjects = await parseInputMineralString(inputString);
  await pricesSettled;

  Object.values(reprocessingObjects).forEach((item) => {
    item.unitPrice = readMarketPriceForType(item.id, marketLocation, orderType);
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

/**
 * The minerals a set of reprocessed items comes to in total, counting a gas
 * cloud by what it holds rather than by its batch.
 *
 * @param {Array<Object>} objectArray - Reprocessing objects carrying materials
 * @returns {Array<Object>} Combined minerals with their total quantities
 */
function gatherMaterialTotals(objectArray) {
  const outputObj = {};
  for (const obj of objectArray) {
    for (const [key, quantity] of Object.entries(obj.reprocessedMaterials)) {
      if (!outputObj[key]) {
        outputObj[key] = { id: key, quantity: 0 };
      }

      if (obj.itemType === reprocessingItemTypes.gas) {
        outputObj[key].quantity += quantity;
      } else {
        outputObj[key].quantity +=
          quantity * (obj.reprocessableQuantity / obj.batchSize);
      }
    }
  }
  return Object.values(outputObj);
}
