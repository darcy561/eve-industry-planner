import ReprocessingItem from "../../Classes/reprocessingItem";
import { parseNumberWithSeparators } from "../Helper/numberParser";
import { reprocessableByName } from "../Static/reprocessing";

/**
 * The ores a player pasted, as reprocessing items.
 *
 * Lines naming the same ore are added together rather than becoming two items.
 *
 * @param {string} inputString - name and quantity pairs, one per line, tab- or space-separated
 * @returns {Array<ReprocessingItem>}
 */
function parseReprocessingInput(inputString) {
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

export default parseReprocessingInput;
