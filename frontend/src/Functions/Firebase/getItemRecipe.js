import { getToken } from "firebase/app-check";
import { appCheck } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import { getRuntimeEnv } from "../../utils/runtime-config";

/**
 * Retrieves item recipes from Firebase API with support for single items or arrays.
 * Handles both GET requests for single items and POST requests for multiple items.
 * 
 * @param {string|string[]} itemRequests - Single item ID or array of item IDs to retrieve recipes for
 * @returns {Promise<Object|Array|null>} Promise that resolves to recipe object, array of recipes, or null
 * 
 * @throws {Error} Throws error if API request fails
 * 
 * @example
 * // Single item
 * const recipe = await getItemRecipesFromFirebase("34");
 * console.log(recipe); // Single recipe object
 * 
 * @example
 * // Multiple items
 * const recipes = await getItemRecipesFromFirebase(["34", "35", "36"]);
 * console.log(recipes); // Array of recipe objects
 */
export default async function getItemRecipesFromFirebase(itemRequests) {
  const isSingleItem = !Array.isArray(itemRequests) || itemRequests.length === 1;
  
  try {
    let URL = `${getRuntimeEnv("API_URL")}/item`;
    const actualItemID = Array.isArray(itemRequests) ? itemRequests[0] : itemRequests;

    const appCheckToken = await getToken(appCheck);

    if (isSingleItem) {
      URL += `/${actualItemID}`;
    }

    const response = await fetch(URL, {
      method: isSingleItem ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-AppCheck": appCheckToken.token,
        accountID: getCurrentFirebaseUser(),
        appVersion: __APP_VERSION__,
      },
      body: !isSingleItem
        ? JSON.stringify({
            idArray: itemRequests,
          })
        : undefined,
    });

    if (!response.ok) {
      throw new Error(`Error retrieving item recipe: ${response.statusText}`);
    }

    const result = await response.json();
    
    // If we treated a single-item array as a single request, wrap the result in an array
    if (Array.isArray(itemRequests) && itemRequests.length === 1) {
      return [result];
    }
    
    return result;
  } catch (err) {
    console.error(`Error retrieving item recipe:`, err);

    if (isSingleItem) {
      return null;
    }
    return [];
  }
}
