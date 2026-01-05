import { getFirestore } from "firebase-admin/firestore";
import { error, log, warn } from "firebase-functions/logger";

/**
 * Retrieves recipe data for multiple EVE Online items.
 * 
 * This endpoint provides batch item recipe information for industry planning:
 * - Fetches multiple item recipe data from Firestore Items collection
 * - Returns complete recipe information for all available items
 * - Handles missing items gracefully by excluding them from results
 * - Provides parallel database queries for efficient data retrieval
 * - Logs missing items for monitoring and debugging
 * - Provides comprehensive error handling and logging
 * 
 * @param {Object} req - Express request object
 * @param {Array<number>} req.body.idArray - Array of EVE Online type IDs
 * @param {string} req.header.accountID - Account ID for logging
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Sends JSON response with item recipe data array
 * 
 * @example
 * // Request body:
 * {
 *   "idArray": [34, 35, 36]
 * }
 * 
 * // Response:
 * [
 *   {
 *     "typeID": 34,
 *     "name": "Tritanium",
 *     "materials": [
 *       {
 *         "typeID": 35,
 *         "quantity": 100
 *       }
 *     ],
 *     "outputQuantity": 1
 *   },
 *   {
 *     "typeID": 35,
 *     "name": "Pyerite",
 *     "materials": [],
 *     "outputQuantity": 1
 *   }
 * ]
 */
async function retrieveMultipleItemRecipies(req, res) {
  try {
    const db = getFirestore();

    const { idArray } = req.body;
    const accountID = req.header("accountID");
    
    if (!idArray || !Array.isArray(idArray) || idArray.length === 0) {
      return res.status(400).send("Invalid or empty ID array");
    }

    const returnArray = [];
    const missingIDs = [];

    const promises = idArray.map((id) =>
      db.collection("Items").doc(id.toString()).get()
    );

    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const doc = result.value;
        if (doc.exists) {
          returnArray.push(doc.data());
        } else {
          missingIDs.push([index]);
        }
      } else {
        warn(`Error fetching document for ID ${idArray[index]}`, result.reason);
        missingIDs.push(idArray[index]);
      }
    });

    log(`${accountID} - ${returnArray.length} item recipies successfully retrieved`);
    if (missingIDs.length > 0) {
      warn(`${accountID} - ${missingIDs.length} items missing: [${missingIDs.join(", ")}]`);
    }

    return res
      .status(200)
      .setHeader("Content-Type", "application/json")
      .send(returnArray);
  } catch (err) {
    error(`${accountID} - Error retrieving multiple item recipes`, err);
    return res
      .status(500)
      .send("An error occurred while retrieving item data. Please try again.");
  }
}

export default retrieveMultipleItemRecipies;
