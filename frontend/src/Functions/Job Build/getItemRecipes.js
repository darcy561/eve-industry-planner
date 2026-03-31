import { getRecipeListFromCache } from "../Helper/getCachedData";
import fetchBlueprints from "../Endpoints/Public/blueprints";

/**
 * Retrieves item recipes with cache-first strategy.
 * First attempts to get recipes from cached data, then falls back to the public blueprints API.
 * 
 * @param {string|string[]} itemRequests - The ID of the item to retrieve the recipe for or an array of item IDs
 * @returns {Promise<Object|Array>} The recipe for the item or an array of recipes for the items
 * 
 * @example
 * const recipe = await getItemRecipes("34");
 * console.log(recipe); // Tritanium recipe
 * 
 * @example
 * const recipes = await getItemRecipes(["34", "35"]);
 * console.log(recipes); // Array of recipes
 */
export default async function getItemRecipes(itemRequests) {
  const isSingleItem =
    !Array.isArray(itemRequests) || itemRequests.length === 1;

  // First, try to get data from cached recipe list
  try {
    const recipeList = await getRecipeListFromCache();

    if (recipeList && Array.isArray(recipeList)) {
      const itemIDs = Array.isArray(itemRequests)
        ? itemRequests
        : [itemRequests];

      const foundItems = itemIDs
        .map((itemID) =>
          recipeList.find(
            (item) => item.itemID === itemID || item.itemID === String(itemID)
          )
        )
        .filter(Boolean);

      // If we found all requested items in cache, return them
      if (foundItems.length === itemIDs.length) {
        return foundItems;
      }
    } else if (recipeList && typeof recipeList === "object") {
      console.log("recipe list is an object");
      // Handle case where recipe list is an object (key-value mapping)
      const itemIDs = Array.isArray(itemRequests)
        ? itemRequests
        : [itemRequests];

      const foundItems = itemIDs
        .map((itemID) => {
          const key = String(itemID);
          return recipeList[key] || recipeList[itemID];
        })
        .filter(Boolean);

      // If we found all requested items in cache, return them
      if (foundItems.length === itemIDs.length) {
        return foundItems;
      }
    }
  } catch (cacheError) {
    console.warn("failed to get items from cache");
    console.warn(cacheError);
  }

  // Fallback to public blueprints API call
  return await fetchBlueprints(itemRequests);
}
