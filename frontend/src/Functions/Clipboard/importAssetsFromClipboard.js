import { checkClipboardReadPermissions } from "./clipboardPermissions";
import readTextFromClipboard from "./readTextFromClipboard";
import { showSnackbarError } from "../../Events/snackbarEvents";
import { parseNumberWithSeparators } from "../Helper/numberParser";

const SPACE_SEPARATED_LINE = /^(.*\S) +(\d[\d.,  ]*)$/;

/**
 * Splits one clipboard line into an item name and quantity text, by tab or by a trailing number.
 * @param {string} line
 * @returns {[string, string | undefined]}
 */
function splitAssetLine(line) {
  if (line.includes("\t")) {
    const [name, quantity] = line.split("\t").map((part) => part.trim());
    return [name, quantity];
  }
  const match = line.trim().match(SPACE_SEPARATED_LINE);
  return match ? [match[1], match[2]] : [line.trim(), undefined];
}

/**
 * Parses clipboard text into item quantities by name, summing repeated names.
 * @param {string} text
 * @returns {Object<string, number>}
 */
export function parseAssetsFromClipboardText(text) {
  const returnObject = {};
  text.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const [itemName, quantity] = splitAssetLine(line);
    if (!itemName || !quantity || !/^\d/.test(quantity)) return;
    const quantityAsNumber = parseNumberWithSeparators(quantity);
    const finalQuantity = isNaN(quantityAsNumber) ? 0 : quantityAsNumber;
    returnObject[itemName] = (returnObject[itemName] ?? 0) + finalQuantity;
  });
  return returnObject;
}

/**
 * Reads the clipboard and returns the asset quantities it lists, keyed by item name.
 * @returns {Promise<Object<string, number>>}
 */
export default async function importAssetsFromClipboard_IconView() {
  try {
    const hasPermission = await checkClipboardReadPermissions();
    if (!hasPermission) {
      showSnackbarError("Clipboard access denied. Please enable permissions.");
      return {};
    }
    const importedText = await readTextFromClipboard();
    if (!importedText) return {};
    return parseAssetsFromClipboardText(importedText);
  } catch (err) {
    console.error(err.message);
    return {};
  }
}
