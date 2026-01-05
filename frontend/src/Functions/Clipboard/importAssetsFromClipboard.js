import { checkClipboardReadPermissions } from "./clipboardPermissions";
import readTextFromClipboard from "./readTextFromClipboard";
import { showSnackbarError } from "../../Events/snackbarEvents";
import { parseNumberWithSeparators } from "../Helper/numberParser";

/**
 * Imports asset quantities from clipboard data.
 * 
 * This method updates asset quantities based on imported data:
 * - Matches items by name
 * - Updates assetQuantity for matching items
 * 
 * @returns {Promise<Object>} Object mapping item names to quantities
 */

export default async function importAssetsFromClipboard_IconView() {
    try {
        let returnObject = {};
        const hasPermission = await checkClipboardReadPermissions();
        if (!hasPermission) {
          showSnackbarError(
            "Clipboard access denied. Please enable permissions."
          );
          return returnObject;
        }
        const importedText = await readTextFromClipboard();
        if (!importedText) return returnObject;
  
        // Split into lines and process each line
        const lines = importedText.split(/\r?\n/).filter(line => line.trim());
        
        lines.forEach((line) => {
          // Skip empty lines
          if (!line.trim()) return;
          
          // Split by tab (since spaces are normalized to tabs)
          const parts = line.split('\t').map(part => part.trim());
          
          // First part is always the item name
          const itemName = parts[0];
          if (!itemName) return;
          
          // Second part must be a quantity (number) - skip line if not
          const quantity = parts[1];
          if (!quantity || !/^\d/.test(quantity)) {
            return; // Skip lines without a number in the second position
          }
          
          // Parse the quantity
          const quantityAsNumber = parseNumberWithSeparators(quantity);
          const finalQuantity = isNaN(quantityAsNumber) ? 0 : quantityAsNumber;
          
          // Accumulate quantities if item name already exists
          if (returnObject[itemName]) {
            returnObject[itemName] += finalQuantity;
          } else {
            returnObject[itemName] = finalQuantity;
          }
        });
        return returnObject;
      } catch (err) {
        console.error(err.message);
        return {};
      }
}