import { getFullItemList } from "./getCachedData";

/**
 * Retrieves the name of an EVE Online item by its type ID.
 * Fetches the full item list from cache and returns the item name or "Unknown Item" if not found.
 * 
 * @param {string|number} typeID - EVE Online type ID of the item
 * @returns {Promise<string>} Promise that resolves to the item name or "Unknown Item"
 * 
 * @throws {Error} Throws error if typeID is missing or invalid format
 * 
 * @example
 * const itemName = await getItemNameFromTypeID(34);
 * console.log(itemName); // "Tritanium"
 * 
 * @example
 * const itemName = await getItemNameFromTypeID("34");
 * console.log(itemName); // "Tritanium"
 */
async function getItemNameFromTypeID(typeID) {
  try {
    if (!typeID) {
      throw new Error("Missing TypeID");
    }
    if (typeof typeID !== "string" && typeof typeID !== "number") {
      throw new Error("Invalid TypeID format");
    }

    const fullItemList = await getFullItemList();
    if (!fullItemList) {
      throw new Error("Full item list not loaded");
    }

    return fullItemList[typeID]?.name || "Unknown Item";
  } catch (err) {
    console.error(err.message);
    return "Unknown item";
  }
}

export default getItemNameFromTypeID;
