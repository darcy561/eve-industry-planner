import Job from "../Classes/jobConstructor";
import Setup from "../Classes/jobSetupConstructor";
import { showSnackbarError } from "../Events/snackbarEvents";
import { displayOutdatedAppVersionDialog } from "../Events/notificationDialogEvents";
import useUsersStore from "../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import getItemRecipes from "../Functions/Job Build/getItemRecipes";
import calculateTimeForSetup from "../Functions/Blueprint Calculations/calculateTimeForSetup";
import calculateMaterialsFromSetup from "../Functions/Blueprint Calculations/calculateMaterialsForSetup";
import calculateInstallCostfromSetup from "../Functions/Helper/calculateInstallCostfromSetup";
import {
  findHighestMaterialEfficiencyBlueprint,
  getDefaultStrutureForJobType,
  calculateSetupQuantitiesFromRequiredQuantity,
} from "../Functions/Job Build/setupHelpers";

/**
 * Custom hook that provides comprehensive job building functionality for EVE Online industry planning.
 *
 * This hook handles the complete job creation process:
 * - Building job objects from build requests
 * - Setting up job configurations with ME/TE values
 * - Calculating material quantities and time estimates
 * - Managing blueprint efficiency from character/corporation blueprints
 * - Handling structure and system configurations
 * - Error handling and validation
 * - Install cost calculations
 *
 * The job building process:
 * 1. Validates build requests and fetches item data
 * 2. Creates job objects with proper configurations
 * 3. Sets up blueprint efficiency (ME/TE) from available blueprints
 * 4. Configures default structures and systems
 * 5. Calculates material quantities and time estimates
 * 6. Handles parent-child job relationships
 * 7. Calculates install costs and total quantities
 *
 * @returns {Object} Object containing job building functions
 * @returns {Function} returns.buildJob - Builds job objects from requests
 * @returns {Function} returns.jobBuildErrors - Handles job building errors
 *
 * @example
 * function JobBuilder() {
 *   const { buildJob } = useJobBuild();
 *
 *   const handleBuildJob = async (buildRequest) => {
 *     const job = await buildJob(buildRequest);
 *     if (job) {
 *       console.log("Job built:", job.name);
 *     }
 *   };
 *
 *   return <button onClick={() => handleBuildJob(request)}>Build Job</button>;
 * }
 */
export function useJobBuild() {
  const queryClient = useQueryClient();

  const parentUser = useUsersStore.getState().users.actions.findParentUser();

  const buildJobObject = async (itemJson, buildRequest) => {
    try {
      const outputObject = new Job(itemJson, buildRequest);
      outputObject.buildJobObject(itemJson, buildRequest);
      try {
        await buildSetupOptions(outputObject, buildRequest);

        outputObject.layout.setupToEdit = Object.keys(
          outputObject.build.setup
        )[0];

        return outputObject;
      } catch (err) {
        console.log(err);
        jobBuildErrors(buildRequest, "objectError");
        return undefined;
      }
    } catch (err) {
      console.log(err);
      jobBuildErrors(buildRequest, err.name);
      return undefined;
    }
  };

  /**
   * Builds job objects from build requests
   * @param {Object|Array} buildRequest - Single build request object or array of build request objects
   * @param {number} buildRequest.itemID - Required. The item ID to build
   * @param {number} [buildRequest.itemQty] - Optional. Quantity of items to produce (defaults to item's base quantity)
   * @param {number} [buildRequest.systemID] - Optional. System ID where the job will be executed
   * @param {string} [buildRequest.characterToUse] - Optional. Character hash to use for the job
   * @param {Array} [buildRequest.parentJobs] - Optional. Array of parent job IDs for job hierarchy
   * @param {string} [buildRequest.groupID] - Optional. Group ID to associate the job with
   * @param {Array} [buildRequest.childJobs] - Optional. Array of child job objects for material production
   * @param {boolean} [buildRequest.throwError] - Optional. Whether to throw errors on failure (defaults to true)
   * @returns {Promise<Object|Array|null>} Single job object, array of job objects, or null on error
   */
  const buildJob = async (buildRequest) => {
    try {
      // Normalize input to always be an array
      const requests = Array.isArray(buildRequest)
        ? buildRequest
        : [buildRequest];

      if (requests.length === 0) {
        return Array.isArray(buildRequest) ? [] : undefined;
      }

      // Validate all requests have itemID
      for (const request of requests) {
        if (!request.hasOwnProperty("itemID")) {
          jobBuildErrors(request, "Item Data Missing From Request");
          return Array.isArray(buildRequest) ? [] : undefined;
        }
      }

      // Get unique item IDs
      const itemIDs = [...new Set(requests.map((request) => request.itemID))];

      // Fetch all item data in one call (cache-first)
      const itemsData = await getItemRecipes(itemIDs);

      if (!itemsData || itemsData.length === 0) {
        jobBuildErrors(requests[0], "Outdated App Version");
        return Array.isArray(buildRequest) ? [] : undefined;
      }

      // Build job objects for each request
      const results = [];
      for (const request of requests) {
        const itemJson = itemsData.find(
          (item) => item.itemID === request.itemID
        );
        if (itemJson) {
          const jobObject = await buildJobObject(itemJson, request);
          if (jobObject) {
            results.push(jobObject);
          }
        }
      }

      // Return single object for single request, array for multiple
      return Array.isArray(buildRequest) ? results : results[0];
    } catch (err) {
      console.log(err.message);
      return Array.isArray(buildRequest) ? [] : null;
    }
  };

  const jobBuildErrors = (buildRequest, newJob) => {
    if (buildRequest.throwError !== undefined && !buildRequest.throwError) {
      return null;
    }
    if (buildRequest.throwError === undefined || buildRequest.throwError) {
      if (newJob === "TypeError") {
        showSnackbarError("No blueprint found for this item.");
      } else if (newJob === "objectError") {
        showSnackbarError("Error building job object, please try again");
      } else if (newJob === "Outdated App Version") {
        displayOutdatedAppVersionDialog();
      } else if (newJob === "Item Data Missing From Request") {
        showSnackbarError("Item Data Missing From Request");
      } else {
        showSnackbarError("Unkown Error Contact Admin");
      }
    }
  };

  async function buildSetupOptions(inputJobObject, buildRequestObject) {
    const rawTimeValue = inputJobObject.rawData.time;

    const requiredQuantity =
      buildRequestObject?.itemQty ||
      inputJobObject.rawData.products[0].quantity;

    const { ME, TE } = findHighestMaterialEfficiencyBlueprint(
      inputJobObject.jobType,
      inputJobObject.blueprintTypeID,
      queryClient
    );
    const structureData = getDefaultStrutureForJobType(inputJobObject.jobType);

    const setupQuantities = calculateSetupQuantitiesFromRequiredQuantity(
      inputJobObject.maxProductionLimit,
      inputJobObject.rawData.products[0].quantity,
      requiredQuantity
    );

    for (let i = 0; i < setupQuantities.length; i++) {
      let newSetup = new Setup({
        ME,
        TE,
        ...structureData,
        ...setupQuantities[i],
        systemID: buildRequestObject?.systemID || structureData.systemID,
        characterToUse:
          buildRequestObject?.characterToUse || parentUser.CharacterHash,
        rawTimeValue,
        jobType: inputJobObject.jobType,
      });

      newSetup.applyInitialRawMaterialQuantities(
        inputJobObject.rawData.materials
      );
      newSetup.recalculate(inputJobObject.skills, queryClient);

      inputJobObject.attachNewSetupToJob(newSetup);
    }
  }

  return {
    buildJob,
    jobBuildErrors,
  };
}
