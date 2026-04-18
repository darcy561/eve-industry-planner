import reprocessIntoMinerals from "./toMinerals";
import reprocessFromMinerals from "./fromMinerals";
import { captureException } from "@sentry/react";
import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";
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

      trackAppEvent(
        AppEvent.REPROCESSING_CALCULATION_TO_MINERALS,
        Math.max(1, reprocessingObjects?.length ?? 0)
      );

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

      trackAppEvent(
        AppEvent.REPROCESSING_CALCULATION_FROM_MINERALS,
        Math.max(1, oreSelection?.length ?? 0)
      );

      result = {
        oreSelection,
        newMarketPrices,
      };
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    captureException(error, {
      tags: {
        feature: "reprocessing",
      },
      extra: {
        inputText: pageState?.inputText,
        toMinerals: pageState?.toMinerals,
        selectedUser: pageState?.selectedUser,
        marketLocation: pageState?.marketLocation,
        marketListing: pageState?.marketListing,
        oreIDsToBeIgnored: pageState?.oreIDsToBeIgnored,
        reprocessingCalculationSettings: pageState?.reprocessingCalculationSettings,
        activeSkills: pageState?.activeSkills,
        currentStructure: pageState?.currentStructure,
      },
    });

    return {
      success: false,
      error: error.message,
    };
  } finally {
    pageActions.setPageLoading(false);
  }
}
