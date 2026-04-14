import Setup from "../../Classes/jobSetup";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import {
  findHighestMaterialEfficiencyBlueprint,
  getDefaultStrutureForJobType,
  calculateSetupQuantitiesFromRequiredQuantity,
} from "../../Functions/Job Build/setupHelpers";

/**
 * Custom hook that provides setup management functionality for EVE Online industry jobs.
 *
 * This hook provides functions to:
 * - Add new setups to existing jobs
 *
 * Setup management includes:
 * - Creating new Setup objects with proper ME/TE values
 *
 * @returns {Object} Object containing setup management functions
 * @returns {Function} returns.addNewSetup - Adds a new setup to a job
 *
 * @example
 * function SetupManager() {
 *   const { addNewSetup } = useSetupManagement();
 *
 *   const handleAddSetup = (job) => {
 *     addNewSetup(job);
 *     console.log("New setup added to job");
 *   };
 *
 *   return <div>Setup management interface</div>;
 * }
 */
export function useSetupManagement() {
  const queryClient = useQueryClient();

  function addNewSetup(chosenJob) {
    const rawTimeValue = chosenJob.rawData.time;

    const requiredQuantity = chosenJob.rawData.products[0].quantity;

    const { ME, TE } = findHighestMaterialEfficiencyBlueprint(
      chosenJob.jobType,
      chosenJob.blueprintTypeID,
      queryClient
    );
    const structureData = getDefaultStrutureForJobType(chosenJob.jobType);

    const setupQuantities = calculateSetupQuantitiesFromRequiredQuantity(
      chosenJob.maxProductionLimit,
      chosenJob.rawData.products[0].quantity,
      requiredQuantity
    );

    const newSetup = new Setup({
      ME,
      TE,
      ...structureData,
      ...setupQuantities[0],
      characterToUse:
        useUsersStore.getState().account.actions.getMainCharacterHash(),
      rawTimeValue,
      jobType: chosenJob.jobType,
    });

    newSetup.applyInitialRawMaterialQuantities(chosenJob.rawData.materials);
    newSetup.recalculate(chosenJob.skills, queryClient);

    chosenJob.attachNewSetupToJob(newSetup);
  }

  return {
    addNewSetup,
  };
}
