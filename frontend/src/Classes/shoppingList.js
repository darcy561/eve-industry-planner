import { materialRequirementOf } from "../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { quantityPurchased } from "../Components/Edit Job/Edit Job Hooks/materialSelectors";
import { PRICING_SIDE } from "../Functions/MarketData/defaults/pricingSide";
import {
  resolveFor,
  sideDefaults,
} from "../Functions/MarketData/defaults/priceResolution.js";
import { readMarketPriceForType } from "../Functions/MarketData/prices/marketPriceForType.js";

class ShoppingList {
  constructor(inputJobs = []) {
    this.items = buildShoppingList(inputJobs);
    this.totalVolume = 0;
    this.totalValue = 0;
  }

  calculateTotalVolume() {
    this.totalVolume = 0;
    this.items.forEach((item) => {
      if (!item.isVisible || !item.includeWhenCopying) return;

      this.totalVolume +=
        item.volume * Math.max(item.quantityToPurchase - item.assetQuantity, 0);
    });
  }

  calculateVisibleItems({ displayChildJobMaterials }) {
    this.items.forEach((item) => {
      const quantityZeroOrLess =
        Math.max(item.quantityToPurchase - item.assetQuantity, 0) > 0
          ? false
          : true;
      const hideIntermediaryItems =
        !displayChildJobMaterials && item.hasChild ? true : false;

      if (quantityZeroOrLess) {
        item.isVisible = false;
        return;
      }

      if (hideIntermediaryItems) {
        item.isVisible = false;
        return;
      }

      item.isVisible = true;
    });
  }

  calculateTotalValue() {
    const buying = sideDefaults(PRICING_SIDE.BUYING);

    this.totalValue = 0;
    this.items.forEach((item) => {
      if (!item.isVisible || !item.includeWhenCopying) return;
      const quantityAfterAssets = Math.max(
        item.quantityToPurchase - item.assetQuantity,
        0,
      );
      const { marketLocation, orderType } = resolveFor(
        buying,
        null,
        item.typeID,
      );
      this.totalValue +=
        quantityAfterAssets *
        readMarketPriceForType(item.typeID, marketLocation, orderType);
    });
  }

  buildStringForClipboard() {
    return this.items
      .filter((item) => item.isVisible && item.includeWhenCopying)
      .map(
        (item) =>
          `${item.name} ${Math.max(item.quantityToPurchase - item.assetQuantity, 0)}`,
      )
      .join("\n");
  }

  importAssetsFromClipboard(importedAssets = {}) {
    this.items.forEach((item) => {
      if (!importedAssets[item.name]) return;
      item.assetQuantity = importedAssets[item.name];
    });
  }

  applyAssetsFromMap(assetsByTypeID = new Map(), countAssetsFunction) {
    this.items.forEach((item) => {
      item.assetQuantity = countAssetsFunction(assetsByTypeID, item.typeID);
    });
  }

  clearAssetQuantities() {
    this.items.forEach((item) => {
      item.assetQuantity = 0;
    });
  }

  toggleIncludeWhenCopying(typeID) {
    const item = this.items.find((item) => item.typeID === typeID);
    if (item) {
      item.includeWhenCopying = !item.includeWhenCopying;
    }
  }

  getItemIDs() {
    return this.items.map((item) => {
      return item.typeID;
    });
  }
}

function buildShoppingList(selectedJobObjects = []) {
  const finalShoppingList = [];
  selectedJobObjects.forEach((job) => {
    Object.values(job.build.materials).forEach((material) => {
      const requirement = materialRequirementOf(
        job.build.setup,
        material.typeID,
      );
      if (quantityPurchased(material, requirement) >= requirement) {
        return;
      }
      const childState =
        job.build.childJobs[material.typeID].length > 0 ? true : false;
      const shoppingListEntries = finalShoppingList.filter(
        (item) => item.typeID === material.typeID,
      );

      if (shoppingListEntries.length === 0) {
        finalShoppingList.push(
          buildShoppingListObject(material, requirement, childState),
        );
        return;
      }

      const childJobPresent = shoppingListEntries.find(
        (item) => item.hasChild === childState,
      );

      if (!childJobPresent) {
        finalShoppingList.push(
          buildShoppingListObject(material, requirement, childState),
        );
        return;
      } else {
        childJobPresent.quantityToPurchase +=
          requirement - quantityPurchased(material, requirement);
      }
    });
  });

  finalShoppingList.sort((a, b) => {
    if (a.name < b.name) {
      return -1;
    }
    if (a.name > b.name) {
      return 1;
    }
    return 0;
  });

  return finalShoppingList;
}

function buildShoppingListObject(material, requirement, childJobPresent) {
  return {
    name: material.name,
    typeID: material.typeID,
    quantityRequired: requirement,
    quantityToPurchase: requirement - quantityPurchased(material, requirement),
    assetQuantity: 0,
    volume: material.volume,
    hasChild: childJobPresent,
    isVisible: false,
    includeWhenCopying: true,
  };
}

export default ShoppingList;
