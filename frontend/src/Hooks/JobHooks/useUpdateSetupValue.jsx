import { useRecalcuateJob } from "../GeneralHooks/useRecalculateJob";
import getSystemIndexes from "../../Functions/System Indexes/findSystemIndex";
import checkJobTypeIsBuildable from "../../Functions/Helper/checkJobTypeIsBuildable";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Custom hook that provides functionality to update setup values and recalculate jobs in EVE Online industry planning.
 *
 * This hook handles setup value updates:
 * - Recalculates jobs from setup changes
 * - Fetches system index data for cost calculations
 * - Updates watchlist items when setup values change
 * - Handles material job recalculation for buildable items
 * - Updates world data with new system indexes
 *
 * The setup update process:
 * 1. Fetches system index data for the setup's system
 * 2. Recalculates the setup with new system index values
 * 3. Updates the active job with new calculations
 * 4. Adds system index data to world data store
 * 5. For watchlist items, recalculates related material jobs
 *
 * @returns {Object} Object containing setup update functions
 * @returns {Function} returns.recalcuateJobFromSetup - Recalculates job from setup changes
 * @returns {Function} returns.recalculateWatchListItems - Recalculates watchlist items
 *
 * @example
 * function SetupUpdater() {
 *   const { recalcuateJobFromSetup, recalculateWatchListItems } = useUpdateSetupValue();
 *
 *   const handleSetupChange = async (setup, state, actions) => {
 *     await recalcuateJobFromSetup(setup, state, actions);
 *     console.log("Job recalculated from setup changes");
 *   };
 *
 *   return <div>Setup value management</div>;
 * }
 */
export function useUpdateSetupValue() {
  const { recalculateJobForNewTotal } = useRecalcuateJob();
  const queryClient = useQueryClient();

  async function recalcuateJobFromSetup(setupObject, state, actions) {
    const systemIndexResults = await getSystemIndexes(setupObject.systemID);

    state.activeJob.recalculateSelectedSetup(
      setupObject.id,
      queryClient,
      undefined,
      systemIndexResults
    );

    actions.updateActiveJob(state.activeJob);
    useUsersStore
      .getState()
      .worldData.actions.addSystemIndex(systemIndexResults);
  }

  function recalculateWatchListItems(
    requestedTypeID,
    mainTypeID,
    setupID,
    materialObject
  ) {
    materialObject[requestedTypeID].recalculateSelectedSetup(
      setupID,
      queryClient
    );

    if (requestedTypeID === mainTypeID) {
      const mainJob = materialObject[mainTypeID];

      for (let material of mainJob.build.materials) {
        if (!checkJobTypeIsBuildable(material.jobType)) continue;

        const materialJob = materialObject[material.typeID];
        recalculateJobForNewTotal(materialJob, material.quantity);
      }
    }
  }

  return {
    recalcuateJobFromSetup,
    recalculateWatchListItems,
  };
}
