import uuid from "react-uuid";

/**
 * Custom hook that provides functionality to add material costs to EVE Online industry jobs.
 * 
 * This hook handles material cost management:
 * - Adds price entries to job materials
 * - Handles "all remaining" quantity purchases
 * - Recalculates and fixes invalid item entries
 * - Filters out invalid cost entries
 * - Updates purchase completion status
 * - Calculates total purchase costs
 * 
 * The cost addition process:
 * 1. Finds matching materials by type ID
 * 2. Handles special "allRemaining" quantity case
 * 3. Recalculates quantities and costs
 * 4. Filters invalid entries (negative values, NaN)
 * 5. Updates purchase completion status
 * 6. Calculates total purchase cost
 * 
 * @param {Object} inputJob - The job object to add costs to
 * @param {Array<Object>} inputPriceArray - Array of price objects to add
 * @returns {Object} Object containing updated material array and total cost
 * @returns {Array} returns.newMaterialArray - Updated material array with costs
 * @returns {number} returns.newTotalPurchaseCost - Total purchase cost for all materials
 * 
 * @example
 * function CostAdder() {
 *   const { newMaterialArray, newTotalPurchaseCost } = useAddMaterialCostsToJob(job, priceArray);
 *   
 *   console.log("Total cost:", newTotalPurchaseCost);
 *   return <div>Costs added to {newMaterialArray.length} materials</div>;
 * }
 */
export function useAddMaterialCostsToJob(inputJob, inputPriceArray) {
  let newMaterialArray = [...inputJob.build.materials];
  for (let itemPriceObject of inputPriceArray) {
    const matchedMaterial = newMaterialArray.find(
      (i) => i.typeID === itemPriceObject.typeID
    );
    if (!matchedMaterial) continue;

    if (itemPriceObject.itemCount === "allRemaining") {
      addAllRemainingItems(matchedMaterial, itemPriceObject);
    } else {
      recalculateAndFixInvalidItemEntries(matchedMaterial, itemPriceObject);
    }
  }

  const newTotalPurchaseCost = newMaterialArray.reduce(
    (acc, entry) => acc + entry.purchasedCost,
    0
  );
  return { newMaterialArray, newTotalPurchaseCost };
}

/**
 * Builds a material price object for cost tracking.
 * 
 * @param {number} typeID - EVE Online type ID of the material
 * @param {number|string} itemCount - Quantity of items (number or "allRemaining")
 * @param {number} itemCost - Cost per item
 * @param {string|null} [childJobID=null] - Child job ID if importing from child job
 * @returns {Object} Material price object with unique ID
 * 
 * @example
 * const priceObject = useBuildMaterialPriceObject(34, 100, 5.50, "job_123");
 * console.log(priceObject.id); // Unique UUID
 */
export function useBuildMaterialPriceObject(
  typeID,
  itemCount,
  itemCost,
  childJobID = null
) {
  return {
    typeID,
    id: uuid(),
    childID: childJobID,
    childJobImport: childJobID ? true : false,
    itemCount,
    itemCost,
  };
}

function recalculateAndFixInvalidItemEntries(material, itemPriceObject) {
  if (
    material.purchaseComplete &&
    material.quantityPurchased < material.quantity
  ) {
    material.purchaseComplete = false;
  }

  if (material.purchaseComplete) return;

  material.purchasing.push(itemPriceObject);

  filterInvalidEntries(material);

  const { newQuantity, newPurchaseCost } = material.purchasing.reduce(
    (acc, entry) => {
      const maxAllowedQuantity = material.quantity - acc.newQuantity;
      const itemCountToAdd = Math.min(entry.itemCount, maxAllowedQuantity);

      return {
        newQuantity: acc.newQuantity + itemCountToAdd,
        newPurchaseCost: acc.newPurchaseCost + itemCountToAdd * entry.itemCost,
      };
    },
    { newQuantity: 0, newPurchaseCost: 0 }
  );

  material.quantityPurchased = newQuantity;
  material.purchasedCost = newPurchaseCost;

  if (material.quantityPurchased >= material.quantity) {
    material.purchaseComplete = true;
  }
}

function addAllRemainingItems(material, itemPriceObject) {
  if (
    material.purchaseComplete &&
    material.quantityPurchased < material.quantity
  ) {
    material.purchaseComplete = false;
  }

  if (material.purchaseComplete) return;
  filterInvalidEntries(material);
  const remainingItemsRequired = material.quantity - material.quantityPurchased;
  material.purchasing.push(
    useBuildMaterialPriceObject(
      material.typeID,
      remainingItemsRequired,
      itemPriceObject.itemCost,
      itemPriceObject.childID
    )
  );

  const { newQuantity, newPurchaseCost } = material.purchasing.reduce(
    (acc, entry) => ({
      newQuantity: acc.newQuantity + entry.itemCount,
      newPurchaseCost: acc.newPurchaseCost + entry.itemCount * entry.itemCost,
    }),
    { newQuantity: 0, newPurchaseCost: 0 }
  );

  material.quantityPurchased = newQuantity;
  material.purchasedCost = newPurchaseCost;

  // Only mark as complete if the exact quantity has been purchased
  if (material.quantityPurchased >= material.quantity) {
    material.purchaseComplete =
      material.quantityPurchased === material.quantity;
  }
}

function filterInvalidEntries(material) {
  const invalidItems = material.purchasing.filter((item) => {
    return (
      isNaN(item.itemCount) ||
      item.itemCount < 0 ||
      isNaN(item.itemCost) ||
      item.itemCost < 0
    );
  });

  if (invalidItems.length > 0) {
    material.purchasing = material.purchasing.filter(
      (item) => !invalidItems.includes(item)
    );
  }
}
