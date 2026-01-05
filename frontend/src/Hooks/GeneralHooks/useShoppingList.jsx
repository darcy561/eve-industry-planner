import { logEvent } from "firebase/analytics";
import { analytics } from "../../firebase";
import { showSnackbarError } from "../../Events/snackbarEvents";
import getCurrentFirebaseUser from "../../Functions/Firebase/currentFirebaseUser";
import manageListenerRequests from "../../Functions/Firebase/manageListenerRequests";
import retrieveJobIDsFromGroupObjects from "../../Functions/Helper/getJobIDsFromGroupObjects";
import convertJobIDsToObjects from "../../Functions/Helper/convertJobIDsToObjects";
import seperateGroupAndJobIDs from "../../Functions/Helper/seperateGroupAndJobIDs";
import useUsersStore from "../../Zustand/usersStore";
import importAssetsFromClipboard_IconView from "../../Functions/Clipboard/importAssetsFromClipboard";
/**
 * Custom hook that provides shopping list functionality for EVE Online industry jobs.
 * 
 * This hook provides functions to:
 * - Build shopping lists from job IDs and group IDs
 * - Calculate item prices and volumes
 * - Import asset quantities from clipboard
 * - Generate copyable text for external tools
 * - Manage visibility of items based on asset quantities
 * - Handle both individual jobs and job groups
 * 
 * Shopping list features:
 * - Combines materials from multiple jobs/groups
 * - Deducts owned asset quantities from requirements
 * - Calculates total costs and volumes
 * - Supports clipboard import for asset quantities
 * - Generates multibuy-compatible text output
 * 
 * @returns {Object} Object containing shopping list functions
 * @returns {Function} returns.buildShoppingList - Builds shopping list from job/group IDs
 * @returns {Function} returns.calculateItemPrice - Calculates price for an item
 * @returns {Function} returns.calculateVolumeTotal - Calculates volume for an item
 * @returns {Function} returns.clearAssetQuantities - Clears asset quantities from items
 * @returns {Function} returns.generateTextToCopy - Generates copyable text for items
 * @returns {Function} returns.importAssetsFromClipboard - Imports asset quantities from clipboard
 * @returns {Function} returns.isItemVisable - Determines if item should be visible
 * 
 * @example
 * function ShoppingListManager() {
 *   const { buildShoppingList, calculateItemPrice } = useShoppingList();
 * 
 *   const handleBuildList = async (jobIDs) => {
 *     const items = await buildShoppingList(jobIDs);
 *     const totalPrice = items.reduce((sum, item) => sum + calculateItemPrice(item), 0);
 *     console.log("Total cost:", totalPrice);
 *   };
 * 
 *   return <div>Shopping list interface</div>;
 * }
 */
export function useShoppingList() {
  const { addRetrievedJobsToJobArray } = useUsersStore.getState().jobData.actions
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const { defaultMarket, defaultOrders } = useUsersStore.getState().applicationSettings;

  async function buildShoppingList(inputJobIDs) {
    const retrievedJobs = [];

    const { groupIDs, jobIDs } = seperateGroupAndJobIDs(inputJobIDs);

    const groupJobIDs = retrieveJobIDsFromGroupObjects(groupIDs);

    const requestedJobObjects = await convertJobIDsToObjects(
      [...jobIDs, ...groupJobIDs],
      retrievedJobs
    );

    logEvent(analytics, "Build Shopping List", {
      UID: getCurrentFirebaseUser(),
      buildCount: requestedJobObjects.length,
      loggedIn: isLoggedIn,
    });
    manageListenerRequests(retrievedJobs);

    addRetrievedJobsToJobArray(retrievedJobs)
    return requestedJobObjects;
  }

  function buildShoppingListObject(material, childJobPresent) {
    return {
      name: material.name,
      typeID: material.typeID,
      quantity: material.quantity - material.quantityPurchased,
      assetQuantity: 0,
      volume: material.volume,
      hasChild: childJobPresent,
      isVisible: false,
    };
  }

  function buildCopyText(item) {
    return `${item.name} ${Math.max(
      item.quantity - (item.assetQuantity || 0),
      0
    )}\n`;
  }

  function calculateItemPrice(item, alternativePriceLocation) {
    const itemPriceObject = useUsersStore
      .getState()
      .worldData.actions.findMarketData(
        item.typeID,
        alternativePriceLocation
      );
    const individualItemPrice = itemPriceObject[defaultMarket][defaultOrders];

    return (
      individualItemPrice * Math.max(item.quantity - item.assetQuantity, 0)
    );
  }

  function calculateVolumeTotal(item) {
    return item.volume * Math.max(item.quantity - item.assetQuantity, 0);
  }

  function isAssetQuantityVisable(item) {
    return Math.max(item.quantity - item.assetQuantity, 0) > 0 ? true : false;
  }

  function isChildJobVisable(childJobDisplayFlag, item) {
    return !childJobDisplayFlag && !item.hasChild ? true : false;
  }

  function isItemVisable(remvoveAssetFlag, childJobDisplayFlag, item) {
    const quantity = isAssetQuantityVisable(item);
    const childJob = isChildJobVisable(childJobDisplayFlag, item);

    if (remvoveAssetFlag && quantity && childJob) return true;

    if (!remvoveAssetFlag && childJob) return true;

    return false;
  }

  function generateTextToCopy(inputItems) {
    return inputItems.map((item) => buildCopyText(item)).join("");
  }

  function clearAssetQuantities(itemList) {
    itemList.forEach((item) => (item.assetQuantity = 0));
  }

  async function importAssetsFromClipboard(itemList) {
    try {
      const newItemList = [...itemList];
      const importedAssets = await importAssetsFromClipboard_IconView();
      for (let item of newItemList) {
        const matchedItem = importedAssets[item.name];
        if (!matchedItem) continue;
        item.assetQuantity = matchedItem;
        if (item.assetQuantity >= item.quantity) {
          item.isVisible = false;
        }
      }
      return newItemList;
    } catch (error) {
      console.error("Failed to import assets from clipboard:", error);
      showSnackbarError(error.message || "Failed to import assets from clipboard");
    }
  }

  return {
    buildShoppingList,
    calculateItemPrice,
    calculateVolumeTotal,
    clearAssetQuantities,
    generateTextToCopy,
    importAssetsFromClipboard,
    isItemVisable,
  };
}
