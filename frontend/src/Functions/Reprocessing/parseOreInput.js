import ReprocessingItem from "../../Classes/reprocessingConstructor";
import { parseNumberWithSeparators } from "../Helper/numberParser";

/**
 * Parses a text input string containing ore names and quantities into reprocessing objects.
 * Supports both tab-separated and space-separated formats for ore name and quantity pairs.
 * Creates ReprocessingItem objects for each unique ore type found in the input.
 * 
 * @param {string} inputString - Input string containing ore names and quantities
 * @param {Object} ores - Object containing ore data with names as keys
 * @returns {Array<ReprocessingItem>} Array of ReprocessingItem objects
 * 
 * @example
 * const input = "Tritanium Ore\t1000\nPyerite Ore 500";
 * const ores = { "Tritanium Ore": { id: 34, name: "Tritanium Ore" } };
 * const items = parseReprocessingInput(input, ores);
 * console.log(items[0].totalQuantity); // 1000
 */
function parseReprocessingInput(inputString, ores) {
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

    const ore = Object.values(ores).find(
      (o) => o.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (ore) {
      if (!matchedItems[ore.id]) {
        matchedItems[ore.id] = new ReprocessingItem(ore);
      }
      matchedItems[ore.id].addToTotalQuantity(quantity);
    }
  });
  return Object.values(matchedItems);
}

export default parseReprocessingInput;
