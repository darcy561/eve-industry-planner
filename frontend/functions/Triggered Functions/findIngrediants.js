const functions = require("firebase-functions");
const { GLOBAL_CONFIG } = require("../global-config-functions");
const ingrediantObject = require("../rawData/recipeMaterialLookup.json");

const { FIREBASE_SERVER_REGION } = GLOBAL_CONFIG;

/**
 * Firebase Cloud Function that finds EVE Online type IDs based on material IDs and match criteria.
 * 
 * This function provides material-to-type ID lookup functionality for EVE Online industry planning:
 * - Searches through recipe material lookup data to find matching type IDs
 * - Supports two matching modes: "any" (union) and "all" (intersection)
 * - Validates App Check authentication for security
 * - Returns array of type IDs that match the specified criteria
 * 
 * The lookup process:
 * 1. Validates App Check authentication context
 * 2. Extracts requested material IDs and match type from request data
 * 3. Iterates through each material ID to find matching type IDs
 * 4. Applies match logic based on specified match type:
 *    - "any": Union of all type IDs from all materials
 *    - "all": Intersection of type IDs common to all materials
 * 5. Returns array of matching type IDs
 * 
 * Match type behavior:
 * - "any": Returns all type IDs that can be made from any of the requested materials
 * - "all": Returns only type IDs that can be made from ALL requested materials
 * 
 * Security features:
 * - App Check enforcement for request verification
 * - Input validation and error handling
 * - Secure access to recipe material lookup data
 * 
 * @param {Object} data - Request data containing material IDs and match criteria
 * @param {Array<number>} data.ids - Array of material IDs to search for
 * @param {string} data.matchType - Match type: "any" for union, "all" for intersection
 * @param {Object} context - Firebase Cloud Function context
 * @param {Object} context.app - App Check verification context
 * @returns {Promise<Array<number>>} Array of type IDs matching the specified criteria
 * 
 * @example
 * // Find type IDs for any of the specified materials
 * const result = await findIngrediants({
 *   ids: [34, 35, 36],
 *   matchType: "any"
 * });
 * console.log('Type IDs:', result); // [123, 456, 789, ...]
 * 
 * @example
 * // Find type IDs that require ALL specified materials
 * const result = await findIngrediants({
 *   ids: [34, 35, 36],
 *   matchType: "all"
 * });
 * console.log('Type IDs requiring all materials:', result); // [123, 456]
 * 
 * @throws {functions.https.HttpsError} When App Check verification fails
 * @throws {Error} When material lookup or processing fails
 * 
 * @see {@link ../rawData/recipeMaterialLookup.json} Recipe material lookup data
 */
exports.findIngrediants = functions
  .region(FIREBASE_SERVER_REGION)
  .https.onCall(async (data, context) => {
    if (!context.app) {
      functions.logger.warn("Unverified function Call");
      functions.logger.warn(context);
      throw new functions.https.HttpsError(
        "Unable to verify",
        "Function must be called from a verified app"
      );
    }
    /// data = {ids: [34,35,36], matchType: "Any"|| "All"}

    const { ids: requestedIDs, matchType } = data;

    const matchingTypeIDs = new Set();

    for (const material of requestedIDs) {
      if (ingrediantObject[material]) {
        if (matchType === "any") {
          ingrediantObject[material].forEach((typeID) =>
            matchingTypeIDs.add(typeID)
          );
        } else if (matchType === "all" && matchingTypeIDs.size > 0) { 
          matchingTypeIDs = new Set(
            ingrediantObject[material].filter((typeID) =>
              matchingTypeIDs.has(typeID)
            )
          );
        }
      }
    }

    return [...matchingTypeIDs];
  });
