import ReprocessingItem from "../../Classes/reprocessingItem";
import { parseNumberWithSeparators } from "../Helper/numberParser";
import { reprocessableByName } from "../Static/reprocessing";
import { primeItems, itemRecord } from "../Static/items";
import { byName, nameKey } from "../Static/staticFile";

const mineralIDS = new Set([34, 35, 36, 37, 38, 39, 40, 11399]);
const moonMineralIDS = new Set([
  16634, 16643, 16647, 16641, 16640, 16650, 16635, 16648, 16633, 16646, 16651,
  16644, 16652, 16639, 16636, 16649, 16653, 16638, 16637, 16642,
]);
const iceProductIDs = new Set([
  16272, 16274, 17889, 16273, 17888, 17887, 16275,
]);
const unrefinedMineralIDS = new Set([90289]);

/**
 * The ores a player pasted, as reprocessing items, with lines naming the same ore
 * added together.
 *
 * @param {string} inputString - name and quantity pairs, one per line, tab- or space-separated
 * @returns {Array<ReprocessingItem>}
 */
export function parseReprocessingInput(inputString) {
  if (typeof inputString !== "string" || !inputString.trim()) {
    return [];
  }

  const lines = inputString.split("\n").map((line) => line.trim());
  const matchedItems = {};

  lines.forEach((line) => {
    if (!line) return;

    let name, quantity;

    if (line.includes("\t")) {
      [name, quantity] = line.split("\t").map((part) => part.trim());
    } else {
      const parts = line.split(" ");
      quantity = parts.pop();
      name = parts.join(" ");
    }

    if (!quantity || isNaN(parseNumberWithSeparators(quantity))) return;
    quantity = Math.floor(parseNumberWithSeparators(quantity));

    const ore = reprocessableByName(name);
    if (ore) {
      if (!matchedItems[ore.id]) {
        matchedItems[ore.id] = new ReprocessingItem(ore);
      }
      matchedItems[ore.id].addToTotalQuantity(quantity);
    }
  });
  return Object.values(matchedItems);
}

/**
 * The minerals a player pasted, keyed by id, taking only the names that are really
 * minerals.
 *
 * @param {string} inputString - Input string containing mineral names and quantities
 * @returns {Promise<Object>} Promise that resolves to object with mineral IDs as keys
 */
export async function parseInputMineralString(inputString) {
  if (typeof inputString !== "string" || !inputString.trim()) {
    return [];
  }

  await primeItems();
  // Only these types can match, so the name they are pasted under is resolved from them rather
  // than by searching every item in the game once per line.
  const minerals = mineralsByName();
  const lines = inputString.split("\n").map((line) => line.trim());
  const matchedMinerals = {};

  lines.forEach((line) => {
    if (!line) return;

    let name, quantity;

    if (line.includes("\t")) {
      [name, quantity] = line.split("\t").map((part) => part.trim());
    } else {
      const parts = line.split(" ");
      quantity = parts.pop();
      name = parts.join(" ");
    }

    if (!quantity || isNaN(parseNumberWithSeparators(quantity))) return;
    quantity = parseNumberWithSeparators(quantity);

    const mineral = minerals.get(nameKey(name));

    if (mineral) {
      if (!matchedMinerals[mineral.type_id]) {
        matchedMinerals[mineral.type_id] = {
          name: mineral.name,
          id: mineral.type_id,
          quantity: 0,
          remaining: 0,
        };
      }
      matchedMinerals[mineral.type_id].quantity += quantity;
      matchedMinerals[mineral.type_id].remaining += quantity;
    }
  });

  return matchedMinerals;
}

/**
 * The types a pasted line can name, keyed by the name they are pasted under.
 *
 * @returns {Map<string, {name: string, type_id: number}>}
 */
function mineralsByName() {
  const types = [
    ...mineralIDS,
    ...moonMineralIDS,
    ...iceProductIDs,
    ...unrefinedMineralIDS,
  ];
  return byName(
    types
      .map((typeID) => {
        const record = itemRecord(typeID);
        return record?.name ? { name: record.name, type_id: typeID } : null;
      })
      .filter(Boolean),
  );
}
