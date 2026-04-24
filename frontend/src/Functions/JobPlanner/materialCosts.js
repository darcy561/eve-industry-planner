import uuid from "react-uuid";

export function materialPriceObjectFactory(
  typeID,
  itemCount,
  itemCost,
  childJobID = null
) {
  return {
    typeID,
    id: uuid(),
    childID: childJobID,
    childJobImport: Boolean(childJobID),
    itemCount,
    itemCost,
  };
}

/**
 * Adds material cost entries to a job and recalculates totals.
 *
 * @param {Object} inputJob
 * @param {Array<Object>} inputPriceArray
 * @returns {{ newMaterialArray: Array, newTotalPurchaseCost: number }}
 */
export function addMaterialCostsToJob(inputJob, inputPriceArray) {
  const newMaterialArray = [...inputJob.build.materials];
  for (const itemPriceObject of inputPriceArray) {
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
    materialPriceObjectFactory(
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

  if (material.quantityPurchased >= material.quantity) {
    material.purchaseComplete =
      material.quantityPurchased === material.quantity;
  }
}

function filterInvalidEntries(material) {
  const invalidItems = material.purchasing.filter((item) => {
    return (
      Number.isNaN(item.itemCount) ||
      item.itemCount < 0 ||
      Number.isNaN(item.itemCost) ||
      item.itemCost < 0
    );
  });

  if (invalidItems.length > 0) {
    material.purchasing = material.purchasing.filter(
      (item) => !invalidItems.includes(item)
    );
  }
}