import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Passes build costs from child jobs to their parent jobs.
 * Collects materials and costs from child jobs and distributes them to parent jobs
 * as purchase costs, updating Firebase with the changes.
 *
 * @param {Array|Object} jobsToPass - Job object(s) to pass costs from
 * @returns {Promise<Object>} Promise that resolves to notification text
 *
 * @example
 * const result = await passBuildCostsToParentJobs([job1, job2]);
 * console.log(result.messageText); // "2 Costs Imported into 1 Job."
 */
export async function passBuildCostsToParentJobs(jobsToPass) {
  const { jobsFromIdsOrObjects } = useUsersStore.getState().jobData.actions;
  const matchedObjects = await jobsFromIdsOrObjects(jobsToPass);

  const { collectedMaterials, parentJobMap } =
    collectMaterialsAndParentJobs(matchedObjects);

  const parentJobs = findNeededParentJobs(parentJobMap);

  const { successfulJobImportCount, priceItemsImportedCount } =
    distributeItemCostsBetweenJobs(
      collectedMaterials,
      parentJobs,
      parentJobMap
    );

  useUsersStore
    .getState()
    .jobData.actions.updateOrAddJobsToJobArray(parentJobs);

  await saveJobsViaApi(parentJobs);

  return {
    messageText: buildNotificationText(
      successfulJobImportCount,
      priceItemsImportedCount
    ),
  };
}

/**
 * Collects materials and parent job mappings from chosen jobs.
 *
 * @param {Array<Object>} chosenJobs - Array of job objects to collect from
 * @returns {Object} Object containing collectedMaterials and parentJobMap
 *
 * @private
 */
function collectMaterialsAndParentJobs(chosenJobs) {
  const collectedMaterials = {};
  const parentJobMap = {};

  for (let job of chosenJobs) {
    const materialID = job.itemID;
    const quantity = job.totalQuantityProduced;
    const itemCost = job.buildCostPerItem();

    if (!collectedMaterials[materialID]) {
      collectedMaterials[materialID] = {
        totalQuantity: 0,
        costs: [],
      };
    }

    collectedMaterials[materialID].totalQuantity += quantity;

    // One entry per child job, never pooled by price: the entry's id is the
    // child it came from, which is what the purchase row records and what stops
    // a second import charging the same output twice.
    collectedMaterials[materialID].costs.push({
      id: job.jobID,
      cost: itemCost,
      quantity,
    });

    for (const parentID of job.parentJobs) {
      if (!parentJobMap[materialID]) {
        parentJobMap[materialID] = new Set();
      }

      parentJobMap[materialID].add(parentID);
    }
  }
  return { collectedMaterials, parentJobMap };
}

/**
 * Finds all needed parent jobs from the job array.
 *
 * @param {Object} parentMap - Map of material IDs to parent job IDs
 * @returns {Array<Object>}
 * @private
 */
function findNeededParentJobs(parentMap) {
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const parentJobs = [];
  const seen = new Set();

  for (const parentIDs of Object.values(parentMap)) {
    for (const parentID of parentIDs) {
      const job = findJobInJobArray(parentID);
      if (job && !seen.has(job.jobID)) {
        seen.add(job.jobID);
        parentJobs.push(job);
      }
    }
  }

  return parentJobs;
}

/**
 * Distributes collected material costs to jobs.
 *
 * @param {Object} collectedMaterials - Materials collected from child jobs
 * @param {Array<Object>} jobSelection - Array of job objects to distribute costs to
 * @param {Object} materialIDMap - Map of material IDs to job IDs that have the material
 * @returns {Object} Return object containing:
 * @returns {number} returns.successfulJobImportCount - Number of jobs that received costs
 * @returns {number} returns.priceItemsImportedCount - Number of price items imported
 * @returns {Set<string>} returns.modifiedJobIDs - Set of job IDs that were modified
 * @example
 * const result = distributeItemCostsBetweenJobs(collectedMaterials, jobSelection, materialIDMap);
 * console.log(result.successfulJobImportCount); // Number of jobs
 * console.log(result.priceItemsImportedCount); // Number of price items
 * console.log(result.modifiedJobIDs); // Set of modified job IDs
 */
export function distributeItemCostsBetweenJobs(collectedMaterials, jobSelection, materialIDMap) {

  let priceItemsImportedCount = 0;
  const modifiedJobIDs = new Set(); 
  for (const job of jobSelection) {
    for (const materialID of Object.keys(collectedMaterials)) {
      if (!materialIDMap[materialID]?.has(job.jobID)) continue;

      // Convert materialID to number for comparison (Object.keys returns strings)
      const materialIDNum = Number(materialID);
      const material = job.build.materials.find((i) => i.typeID == materialIDNum);
      if (!material) continue;
      const materialToImport = collectedMaterials[materialID];
      if (!materialToImport) continue;

      for (const costEntry of materialToImport.costs) {
        if (material.quantityRemaining <= 0) break;

        if (costEntry.quantity <= 0) continue;

        if (isMaterialPurchased(material, costEntry.id, job)) continue;

        const { taken, leftOver } = job.importPurchaseToMaterial(materialIDNum, {
          itemCount: costEntry.quantity,
          itemCost: costEntry.cost,
          childID: costEntry?.id || null,
        });

        if (taken > 0) {
          modifiedJobIDs.add(job.jobID);
          priceItemsImportedCount++;
        }

        costEntry.quantity = leftOver;
      }
    }
  }

  return { successfulJobImportCount : modifiedJobIDs.size, priceItemsImportedCount, modifiedJobIDs };
}

/**
 * Builds notification text for successful cost imports.
 *
 * @param {number} successfulParentImportCount - Number of successful parent imports
 * @param {number} priceItemsImportedCount - Number of price items imported
 * @returns {string|null} Notification text or null if no items imported
 *
 * @private
 */

export function buildNotificationText(
  successfulJobImportCount,
  priceItemsImportedCount
) {
  if (priceItemsImportedCount === 0) {
    return null;
  }

  let costLabel = "Cost";
  if (priceItemsImportedCount !== 1) {
    costLabel = "Costs";
  }

  let jobLabel = "Job";
  if (successfulJobImportCount !== 1) {
    jobLabel = "Jobs";
  }

  return `${priceItemsImportedCount} ${costLabel} Imported into ${successfulJobImportCount} ${jobLabel}.`;
}

/**
 * Checks if a material has already been purchased from a specific job.
 *
 * @param {Object} material - Material object to check
 * @param {string} jobID - Job ID to check for
 * @param {Object} parentJob - Parent job object
 * @returns {boolean} True if material is already purchased from this job
 *
 * @private
 */

function isMaterialPurchased(material, jobID, parentJob) {
  return (
    material.purchasing.some((i) => i.childID === jobID) &&
    parentJob.build.childJobs[material.typeID]?.includes(jobID)
  );
}
