import ReprocessingItem from "../../Classes/reprocessingItem";
import { parseNumberWithSeparators } from "../Helper/numberParser";
import { producibleTypeIDs, reprocessableByName } from "../Static/reprocessing";
import { itemRecord, itemRecordByName } from "../Static/items";
import { byName, nameKey } from "../Static/staticFile";

/**
 * The items a player pasted that reprocess, in paste order, lines naming the same one added; each line
 * naming a real item that does not reprocess; and each line naming nothing, as pasted.
 *
 * @param {string} inputString - name and quantity pairs, one per line, tab- or space-separated
 * @returns {{items: Array<ReprocessingItem>,
 *   notReprocessable: Array<{name: string, id: number, quantity: number}>, unread: Array<string>}}
 */
export function parseReprocessingInput(inputString) {
  const matchedItems = new Map();
  const notReprocessable = [];
  const unread = [];

  for (const line of pastedLines(inputString)) {
    const parsed = splitPastedLine(line);
    const ore = parsed && reprocessableByName(parsed.name);
    if (ore) {
      if (!matchedItems.has(ore.id)) {
        matchedItems.set(ore.id, new ReprocessingItem(ore));
      }
      matchedItems.get(ore.id).addToTotalQuantity(Math.floor(parsed.quantity));
      continue;
    }
    const item = parsed && itemRecordByName(parsed.name);
    if (item) {
      notReprocessable.push({
        name: item.name,
        id: item.type_id,
        quantity: parsed.quantity,
      });
      continue;
    }
    unread.push(line);
  }

  return { items: [...matchedItems.values()], notReprocessable, unread };
}

/**
 * The materials a player pasted, keyed by id, taking only those ore, moon ore or ice can give; each
 * line naming a real item no ore gives; and each line naming nothing, as pasted.
 *
 * @param {string} inputString - name and quantity pairs, one per line, tab- or space-separated
 * @returns {{items: Object<number, {name: string, id: number, quantity: number}>,
 *   notFromOre: Array<{name: string, id: number, quantity: number}>, unread: Array<string>}}
 */
export function parseInputMineralString(inputString) {
  const lines = pastedLines(inputString);
  if (lines.length === 0) return { items: {}, notFromOre: [], unread: [] };

  const minerals = mineralsByName();
  const items = {};
  const notFromOre = [];
  const unread = [];

  for (const line of lines) {
    const parsed = splitPastedLine(line);
    const mineral = parsed && minerals.get(nameKey(parsed.name));
    if (mineral) {
      items[mineral.type_id] ??= {
        name: mineral.name,
        id: mineral.type_id,
        quantity: 0,
      };
      items[mineral.type_id].quantity += parsed.quantity;
      continue;
    }
    const item = parsed && itemRecordByName(parsed.name);
    if (item) {
      notFromOre.push({
        name: item.name,
        id: item.type_id,
        quantity: parsed.quantity,
      });
      continue;
    }
    unread.push(line);
  }

  return { items, notFromOre, unread };
}

/**
 * The non-empty lines of a paste, trimmed.
 *
 * @param {string} inputString
 * @returns {Array<string>}
 */
function pastedLines(inputString) {
  if (typeof inputString !== "string") return [];
  return inputString
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * A pasted line's name and quantity, tab-separated as the game copies them or with the quantity
 * last after a space; null when the line carries no quantity.
 *
 * @param {string} line
 * @returns {{name: string, quantity: number}|null}
 */
function splitPastedLine(line) {
  let name;
  let quantity;
  if (line.includes("\t")) {
    [name, quantity] = line.split("\t").map((part) => part.trim());
  } else {
    const parts = line.split(" ");
    quantity = parts.pop();
    name = parts.join(" ");
  }
  if (!quantity) return null;
  const parsed = parseNumberWithSeparators(quantity);
  if (Number.isNaN(parsed)) return null;
  return { name, quantity: parsed };
}

/**
 * The materials a pasted line can name, keyed by the name they are pasted under.
 *
 * @returns {Map<string, {name: string, type_id: number}>}
 */
function mineralsByName() {
  return byName(
    producibleTypeIDs()
      .map((typeID) => {
        const record = itemRecord(typeID);
        return record?.name ? { name: record.name, type_id: typeID } : null;
      })
      .filter(Boolean),
  );
}
