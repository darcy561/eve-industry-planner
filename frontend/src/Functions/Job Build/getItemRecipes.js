import { primeRecipes, recipeFor } from "../Static/recipes";
import fetchBlueprints from "../Endpoints/Public/blueprints";

/**
 * The recipes for the items asked about.
 *
 * The cached file answers first, and the API only when it cannot: a recipe the file does not carry
 * is one published since the build the app holds, which is the case the fallback exists for. A
 * partial answer is not used — the API is asked for the whole set rather than the found recipes
 * being mixed with fetched ones, so every recipe in one build request comes from one source.
 *
 * @param {string|number|Array<string|number>} itemRequests
 * @returns {Promise<Array<Object>>}
 */
export default async function getItemRecipes(itemRequests) {
  const itemIDs = Array.isArray(itemRequests) ? itemRequests : [itemRequests];

  try {
    await primeRecipes();
    const found = itemIDs.map((itemID) => recipeFor(itemID)).filter(Boolean);

    if (found.length === itemIDs.length) {
      return found;
    }
  } catch (error) {
    console.warn("Recipes: reading the cached list failed", error);
  }

  return await fetchBlueprints(itemRequests);
}
