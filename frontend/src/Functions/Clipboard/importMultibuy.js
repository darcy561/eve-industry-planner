import { checkClipboardReadPermissions } from "./clipboardPermissions";
import readTextFromClipboard from "./readTextFromClipboard";
import { showSnackbarError } from "../../Events/snackbarEvents";
import { parseNumberWithSeparators } from "../Helper/numberParser";

/**
 * Imports multibuy data from clipboard.
 * 
 * This function reads text from clipboard, parses it, and returns an array of objects.
 * 
 * @returns {Promise<Array>} Array of objects with imported name, quantity, and cost
 * @returns {Array} Empty array if clipboard access is denied or text is not found
 */

export default async function importMultibuyFromClipboard() {
    try {
        const returnArray = [];
        const hasPermission = await checkClipboardReadPermissions();
        if (!hasPermission) {
          showSnackbarError(
            "Clipboard access denied. Please enable permissions."
          );
          return returnArray;
        }
        const importedText = await readTextFromClipboard();
  
        if (!importedText) {
          return returnArray;
        }
        // Allow spaces in number fields (for European format like "2 313,00")
        const matchedItems = [
          ...importedText.matchAll(
            /^(.*)\t([0-9,.\s]*)\t([0-9,.\s]*)\t([0-9,.\s]*)$/gm
          ),
        ].filter((match) => {
          // Filter out rows that don't have a quantity or cost and are not empty
          return match[2] && match[3];
        });
  
        for (let item of matchedItems) {
          returnArray.push({
            importedName: item[1] || "",
            importedQuantity: parseNumberWithSeparators(item[2]),
            importedCost: parseNumberWithSeparators(item[3]),
          });
        }
        return returnArray;
      } catch (err) {
        console.error(err.message);
        return [];
      }
}
