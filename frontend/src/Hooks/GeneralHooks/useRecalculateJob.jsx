import Setup from "../../Classes/jobSetup";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import calculateTimeForSetup from "../../Functions/Blueprint Calculations/calculateTimeForSetup";
import calculateMaterialsFromSetup from "../../Functions/Blueprint Calculations/calculateMaterialsForSetup";
import calculateInstallCostfromSetup from "../../Functions/Helper/calculateInstallCostfromSetup";
import {
  findHighestMaterialEfficiencyBlueprint,
  getDefaultStrutureForJobType,
  calculateSetupQuantitiesFromRequiredQuantity,
} from "../../Functions/Job Build/setupHelpers";

/**
 * Custom hook that provides job recalculation functionality for EVE Online industry jobs.
 *
 * This hook:
 * - Recalculates job setups for new production quantities
 * - Updates material quantities and costs based on new requirements
 * - Recalculates time estimates and install costs
 * - Maintains blueprint efficiency (ME/TE) and structure data
 * - Updates total product quantities across all setups
 *
 * The recalculation process:
 * 1. Determines new setup quantities based on required production
 * 2. Creates new Setup objects with updated quantities
 * 3. Recalculates time, resources, and install costs
 * 4. Updates total material quantities for the job
 * 5. Updates total product quantities
 *
 * @returns {Object} Object containing recalculation functions
 * @returns {Function} returns.recalculateJobForNewTotal - Recalculates job for new total quantity
 *
 * @example
 * function JobRecalculator() {
 *   const { recalculateJobForNewTotal } = useRecalcuateJob();
 *
 *   const handleQuantityChange = (job, newQuantity) => {
 *     recalculateJobForNewTotal(job, newQuantity);
 *     console.log("Job recalculated for new quantity:", newQuantity);
 *   };
 *
 *   return <div>Job recalculation interface</div>;
 * }
 */
export function useRecalcuateJob() {
  const queryClient = useQueryClient();

  /**
   * Recalculates a job for a new total production quantity.
   * Updates all setups, materials, and costs based on the new quantity requirement.
   *
   * @param {Object} inputJob - The job object to recalculate
   * @param {number} requiredQuantity - The new total quantity to produce
   * @returns {void}
   *
   * @private
   */
  function recalculateJobForNewTotal(inputJob, requiredQuantity) {
    if (!inputJob || !requiredQuantity) return;

    const newSetupQuantities = calculateSetupQuantitiesFromRequiredQuantity(
      inputJob.maxProductionLimit,
      inputJob.rawData.products[0].quantity,
      requiredQuantity
    );

    const { ME, TE } = findHighestMaterialEfficiencyBlueprint(
      inputJob.jobType,
      inputJob.blueprintTypeID,
      queryClient
    );
    const structureData = getDefaultStrutureForJobType(inputJob.jobType);
    const rawTimeValue = inputJob.rawData.time;

    inputJob.build.setup = {};
    newSetupQuantities.forEach((newItem, index) => {
      const newSetup = new Setup({
        ME,
        TE,
        ...structureData,
        ...newItem,
        characterToUse:
          useUsersStore.getState().account.actions.getMainCharacterHash(),
        ...inputJob.rawData.time,
        jobType: inputJob.jobType,
        rawTimeValue,
      });

      inputJob.rawData.materials.forEach((material) => {
        newSetup.materialCount[material.typeID] = {
          typeID: material.typeID,
          quantity: material.quantity,
          rawQuantity: material.quantity,
        };
      });

      newSetup.recalculate(inputJob.skills, queryClient);

      inputJob.build.setup[newSetup.id] = newSetup;

      if (!index) {
        inputJob.layout.setupToEdit = newSetup.id;
      }
    });

    inputJob.recalculateTotalMaterialQuantities();

    inputJob.recalculateTotalQuantityProduced();
  }

  return {
    recalculateJobForNewTotal,
  };
}
