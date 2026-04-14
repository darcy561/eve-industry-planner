import reprocessIntoMinerals from "./toMinerals";
import reprocessFromMinerals from "./fromMinerals";
import { getAnalytics, logEvent } from "firebase/analytics";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Performs reprocessing calculation based on the current page state
 * @param {Object} params - The calculation parameters
 * @param {Object} params.pageState - Current page state
 * @param {Object} params.pageActions - Page action functions
 * @returns {Promise<Object>} - Result object with success status and data
 */
export async function calculateReprocessing({
  pageState,
  pageActions,
}) {
  const analytics = getAnalytics();

  pageActions.setPageLoading(true);

  try {
    let result;

    if (pageState.toMinerals) {
      const { reprocessingObjects, mineralTotals, newMarketPrices } =
        await reprocessIntoMinerals(
          pageState.inputText,
          pageState.activeSkills,
          pageState.currentStructure
        );

      pageActions.setReprocessingObjects(reprocessingObjects);
      pageActions.setProcessedInput(mineralTotals);
      useUsersStore.getState().worldData.actions.addMarketData(newMarketPrices);

      result = {
        reprocessingObjects,
        mineralTotals,
        newMarketPrices,
      };
    } else {
      const { newMarketPrices, oreSelection, requestedMinerals } = await reprocessFromMinerals(
        pageState.inputText,
        pageState.activeSkills,
        pageState.currentStructure,
        pageState.marketLocation,
        pageState.marketListing,
        pageState.oreIDsToBeIgnored,
        pageState.reprocessingCalculationSettings
      );

      pageActions.setReprocessingObjects(oreSelection);
      pageActions.setRequestedMinerals(requestedMinerals);
      useUsersStore.getState().worldData.actions.addMarketData(newMarketPrices);

      result = {
        oreSelection,
        newMarketPrices,
      };
    }

    logEvent(analytics, "reprocessing_calculation", {
      calculation_type: pageState.toMinerals ? "toMinerals" : "toMaterials",
      is_logged_in: useUsersStore.getState().account.isLoggedIn,
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    logEvent(analytics, "reprocessing_error", {
      error_message: error.message,
      calculation_type: pageState.toMinerals ? "toMinerals" : "toMaterials",
    });

    return {
      success: false,
      error: error.message,
    };
  } finally {
    pageActions.setPageLoading(false);
  }
}
