import { getFirestore } from "firebase-admin/firestore";
import { error, log, warn } from "firebase-functions/logger";

/**
 * Retrieves recipe data for a single EVE Online item.
 * 
 * This endpoint provides item recipe information for industry planning:
 * - Fetches item recipe data from Firestore Items collection
 * - Returns complete recipe information including materials and quantities
 * - Sets appropriate cache headers for performance optimization
 * - Handles missing items with 404 responses
 * - Provides comprehensive logging and error handling
 * 
 * @param {Object} req - Express request object
 * @param {string} req.params.itemID - EVE Online type ID
 * @param {string} req.header.accountID - Account ID for logging
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Sends JSON response with item recipe data
 * 
 * @example
 * // Request: GET /item/34
 * 
 * // Response:
 * {
 *   "typeID": 34,
 *   "name": "Tritanium",
 *   "materials": [
 *     {
 *       "typeID": 35,
 *       "quantity": 100
 *     }
 *   ],
 *   "outputQuantity": 1
 * }
 */
async function retrieveItemRecipe(req, res) {
  try {
    const db = getFirestore();

    const { itemID } = req.params;
    const accountID = req.header("accountID");

    if (typeof itemID !== "string" || itemID.trim() === "") {
      warn("Missing or invalid itemID in request");
      return res.status(400).send("Invalid or missing itemID");
    }

    const docRef = db.collection("Items").doc(itemID);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      log(`${accountID} - Item recipie retrieved successfully for itemID: ${itemID}`);
      return res
        .status(200)
        .set("Cache-Control", "public, max-age=1800, s-maxage=3600")
        .send(data);
    } else {
      warn(`${accountID} - Item not found: ${itemID}`);
      return res.status(404).send("Item not found");
    }
  } catch (err) {
    error(`${accountID} - Error retrieving item data`, err);
    return res
      .status(500)
      .send(
        "An error occurred while retrieving item data. Please try again later."
      );
  }
}

export default retrieveItemRecipe;
