import { reprocessingItemTypes } from "../../Context/defaultValues";

/**
 * Combines mineral quantities from multiple reprocessing objects into totals.
 * Aggregates materials from different ore types, handling gas materials differently
 * from other materials in quantity calculations.
 * 
 * @param {Array<Object>} objectArray - Array of reprocessing objects with materials
 * @returns {Array<Object>} Array of combined mineral objects with total quantities
 * 
 * @example
 * const reprocessingObjects = [
 *   { reprocessedMaterials: { 34: 100 }, itemType: 'ore', reprocessableQuantity: 1000, batchSize: 100 },
 *   { reprocessedMaterials: { 34: 50 }, itemType: 'ore', reprocessableQuantity: 500, batchSize: 100 }
 * ];
 * const totals = gatherMaterialTotals(reprocessingObjects);
 * console.log(totals[0].quantity); // Combined quantity for mineral 34
 */
function gatherMaterialTotals(objectArray) {
  const outputObj = {};
  for (const obj of objectArray) {
    for (const [key, quantity] of Object.entries(obj.reprocessedMaterials)) {
      if (!outputObj[key]) {
        outputObj[key] = { id: key, quantity: 0 };
      }

      if (obj.itemType === reprocessingItemTypes.gas) {
        outputObj[key].quantity += quantity;
      } else {
        outputObj[key].quantity +=
          quantity * (obj.reprocessableQuantity / obj.batchSize);
      }
    }
  }
  return Object.values(outputObj);
}

export default gatherMaterialTotals;
