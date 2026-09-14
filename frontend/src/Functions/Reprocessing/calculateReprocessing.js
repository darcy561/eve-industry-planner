import reprocessIntoMinerals from "./toMinerals";
import reprocessFromMinerals from "./fromMinerals";
import { captureException } from "@sentry/react";
import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";

/**
 * Performs reprocessing calculation based on the current page state
 * @param {Object} params - The calculation parameters
 * @param {Object} params.pageState - Current page state
 * @param {Object} params.pageActions - Page action functions
 * @returns {Promise<Object>} - Result object with success status and data
 */
export async function calculateReprocessing({ pageState, pageActions }) {
  pageActions.setPageLoading(true);

  try {
    let result;

    if (pageState.toMinerals) {
      const { reprocessingObjects, mineralTotals } =
        await reprocessIntoMinerals(
          pageState.inputText,
          pageState.activeSkills,
          pageState.currentStructure,
          pageState.marketLocation,
        );

      pageActions.setReprocessingObjects(reprocessingObjects);
      pageActions.setProcessedInput(mineralTotals);

      trackAppEvent(
        AppEvent.REPROCESSING_CALCULATION_TO_MINERALS,
        Math.max(1, reprocessingObjects?.length ?? 0),
      );

      result = { reprocessingObjects, mineralTotals };
    } else {
      const { oreSelection, requestedMinerals } = await reprocessFromMinerals(
        pageState.inputText,
        pageState.activeSkills,
        pageState.currentStructure,
        pageState.marketLocation,
        pageState.listingType,
        pageState.oreIDsToBeIgnored,
        pageState.reprocessingCalculationSettings,
      );

      pageActions.setReprocessingObjects(oreSelection);
      pageActions.setRequestedMinerals(requestedMinerals);

      trackAppEvent(
        AppEvent.REPROCESSING_CALCULATION_FROM_MINERALS,
        Math.max(1, oreSelection?.length ?? 0),
      );

      result = { oreSelection };
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
        listingType: pageState?.listingType,
        oreIDsToBeIgnored: pageState?.oreIDsToBeIgnored,
        reprocessingCalculationSettings:
          pageState?.reprocessingCalculationSettings,
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
