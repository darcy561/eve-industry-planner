import { getRecipeListFromCache } from "../Helper/getCachedData";
import staticFile from "./staticFile";

/**
 * How every buildable item is made, held where a job can be built without awaiting twice.
 *
 * Building a job is an interactive action a player repeats, so the recipes it needs are read from
 * memory rather than asked for one at a time.
 */

// Keyed on the way in rather than searched on the way out: the file is a flat array, and a job asks
// for several items at once, which was a walk of every recipe per item. Ids are keyed as strings
// because a caller may hold either form — see recipeFor.
const recipes = staticFile(
  getRecipeListFromCache,
  (list) =>
    new Map(
      (Array.isArray(list) ? list : []).map((recipe) => [
        String(recipe?.itemID),
        recipe,
      ]),
    ),
);

export const primeRecipes = recipes.prime;
export const resetRecipes = recipes.reset;

/**
 * One item's recipe, or undefined where the file has not loaded or does not carry it.
 *
 * The id is compared as a string, because a caller may hold it either way — a material's type id
 * arrives as a number, an id read back off a stored document as a string — and the file's own ids
 * are numbers. Matching on the raw value sent a string-holding caller to the network for a recipe
 * that was already in memory.
 *
 * @param {number|string} itemID
 * @returns {Object|undefined}
 */
export function recipeFor(itemID) {
  return recipes.read()?.get(String(itemID));
}
