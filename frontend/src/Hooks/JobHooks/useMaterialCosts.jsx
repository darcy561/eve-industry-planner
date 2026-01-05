import uuid from "react-uuid";

/**
 * Custom hook that provides material cost management functionality for EVE Online industry jobs.
 * 
 * This hook handles material cost operations:
 * - Adding price entries to materials
 * - Recalculating total purchase costs
 * - Fixing invalid item entries
 * - Converting price objects with unique IDs
 * - Managing purchase completion status
 * 
 * The cost management process:
 * 1. Adds price entries to material purchasing arrays
 * 2. Filters out invalid entries (negative values, NaN)
 * 3. Recalculates quantities and costs
 * 4. Updates purchase completion status
 * 5. Calculates total purchase cost
 * 
 * @returns {Object} Object containing material cost functions
 * @returns {Function} returns.addPriceEntry - Adds a price entry to a material
 * 
 * @example
 * function MaterialCostManager() {
 *   const { addPriceEntry } = useMaterialCosts();
 * 
 *   const handleAddPrice = (job, material, priceObject) => {
 *     const { newMaterialArray, newTotalPurchaseCost } = addPriceEntry(job, material, priceObject);
 *     console.log("Total cost:", newTotalPurchaseCost);
 *   };
 * 
 *   return <div>Material cost management</div>;
 * }
 */
export function useMaterialCosts() {
  function addPriceEntry(inputJob, inputMaterial, priceObject) {
    let newMaterialArray = [...inputJob.build.materials];
    let outputMaterial = { ...inputMaterial };

    outputMaterial.purchasing.push(convertPriceObject(priceObject));

    const newTotalPurchaseCost = recaclculateTotalPurchaseCost(
      newMaterialArray,
      outputMaterial
    );

    return { newMaterialArray, newTotalPurchaseCost };
  }

  function recaclculateTotalPurchaseCost(inputMaterialArray, inputMaterial) {
    for (let material of inputMaterialArray) {
      recalculateAndFixInvalidItemEntries(material);
    }
    return inputMaterialArray.reduce(
      (acc, entry) => acc + entry.purchasedCost,
      0
    );
  }

  function recalculateAndFixInvalidItemEntries(material) {
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

    const { newQuantity, newPurchaseCost } = material.purchasing.reduce(
      (acc, entry) => ({
        newQuantity: acc.newQuantity + entry.itemCount,
        newPurchaseCost: acc.newPurchaseCost + entry.itemCount * entry.itemCost,
      }),
      { newQuantity: 0, newPurchaseCost: 0 }
    );

    material.quantityPurchased = newQuantity;
    material.purchasedCost = newPurchaseCost;

    if (material.quantityPurchased >= material.quantity) {
      material.purchaseComplete = true;
    }
  }

  function convertPriceObject(inputPriceObject) {
    return {
      id: uuid(),
      childID: inputPriceObject?.jobID || null,
      childJobImport: inputPriceObject.jobID ? true : false,
      itemCount: inputPriceObject.itemCount,
      itemCost: inputPriceObject.itemCost,
    };
  }

  return { addPriceEntry };
}
