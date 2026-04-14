import convertJobIDsToObjects from "../../Functions/Helper/convertJobIDsToObjects";
import checkJobTypeIsBuildable from "../../Functions/Helper/checkJobTypeIsBuildable";
import { useJobBuild } from "../useJobBuild";
import buildParentChildRelationships from "../../Functions/Helper/buildParentChildRelationships";
import retrieveJobIDsFromGroupObjects from "../../Functions/Helper/getJobIDsFromGroupObjects";
import materialTreeShaker from "../../Functions/Helper/materialTreeShaker";
import { useRecalcuateJob } from "../GeneralHooks/useRecalculateJob";
import getMissingESIData from "../../Functions/Shared/getMissingESIData";
import recalculateInstallCostsWithNewData from "../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import { getAvailableBlueprintsByMaterialID } from "../../Functions/Helper/getAvailableBlueprints";
import firebaseBatchUpdateJobs from "../../Functions/Firebase/batchUpdateJobs";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import { getAnalytics, logEvent } from "firebase/analytics";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Custom hook that provides functionality to build next-level materials for EVE Online industry jobs.
 * 
 * This hook handles the complex process of building material dependency trees:
 * - Analyzes job materials and determines which can be built
 * - Creates new jobs for buildable materials
 * - Manages parent-child relationships between jobs
 * - Handles blueprint availability restrictions
 * - Supports both single-level and full tree building
 * - Updates Firebase with new job data
 * - Fetches missing ESI data and recalculates costs
 * - Provides progress tracking with skeleton elements
 * 
 * The material building process:
 * 1. Converts job IDs to job objects
 * 2. Builds type ID and job ID maps for efficient lookup
 * 3. Generates material requests for buildable items
 * 4. Processes materials in batches with depth control
 * 5. Builds parent-child relationships
 * 6. Shakes the material tree to optimize quantities
 * 7. Fetches ESI data and recalculates costs
 * 8. Updates Firebase and local state
 * 
 * @returns {Object} Object containing material building functions
 * @returns {Function} returns.buildNextMaterials - Builds next-level materials for jobs
 * 
 * @example
 * function MaterialBuilder() {
 *   const { buildNextMaterials } = useBuildJobTree();
 * 
 *   const handleBuildMaterials = async (jobIDs, setSkeletonCount) => {
 *     await buildNextMaterials(jobIDs, setSkeletonCount, true);
 *     console.log("Material tree built successfully");
 *   };
 * 
 *   return <button onClick={() => handleBuildMaterials(jobIDs, setSkeleton)}>Build Materials</button>;
 * }
 */
function useBuildJobTree() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { getActiveGroupObject, updateOrAddJobsToJobArray } = useUsersStore.getState().jobData.actions;
  const { enableSkipMissingBlueprints: ignoreItemsWithoutBlueprints } =
    useUsersStore.getState().applicationSettings;
  const checkTypeIDisExempt =
    useUsersStore.getState().applicationSettings.actions.checkTypeIDisExempt;
  const { buildJob } = useJobBuild();
  const { recalculateJobForNewTotal } = useRecalcuateJob();
  const queryClient = useQueryClient();
  const activeGroupObject = getActiveGroupObject();

  async function buildNextMaterials(
    inputJobIDs,
    setNumberOfVisibleSkeletonElements,
    buildFullItemTree = false
  ) {
    const analytics = getAnalytics();

    // Log start of material building
    logEvent(analytics, "material_build_start", {
      job_count: inputJobIDs.length,
      is_full_tree: buildFullItemTree,
      has_blueprint_restriction: ignoreItemsWithoutBlueprints,
    });

    try {
      if (!inputJobIDs || !setNumberOfVisibleSkeletonElements) {
        throw new Error("missing inputs");
      }
      const retrievedJobs = [];

      const jobIDsIncludedInGroup = retrieveJobIDsFromGroupObjects(
        activeGroupID
      );

      const allJobObjects = await convertJobIDsToObjects(
        [...new Set([...inputJobIDs, ...jobIDsIncludedInGroup])],
        retrievedJobs
      );

      const requestedJobObjects = await convertJobIDsToObjects(
        inputJobIDs,
        retrievedJobs
      );

      // Load available blueprints if needed
      const availableBlueprints = ignoreItemsWithoutBlueprints
        ? await getAvailableBlueprintsByMaterialID(queryClient)
        : new Set();

      const typeIDMap = buildTypeIDMap(allJobObjects);
      const jobIDMap = buildJobIDMap(allJobObjects);

      const materialRequests = generateMaterialRequests(
        requestedJobObjects,
        typeIDMap,
        availableBlueprints
      );

      setNumberOfVisibleSkeletonElements(materialRequests.length);
      const newJobs = await processMaterials(
        jobIDMap,
        typeIDMap,
        materialRequests,
        buildFullItemTree,
        setNumberOfVisibleSkeletonElements,
        availableBlueprints
      );
      buildParentChildRelationships([...allJobObjects, ...newJobs]);
      materialTreeShaker(
        [...allJobObjects, ...newJobs],
        recalculateJobForNewTotal
      );
      const { requestedMarketData, requestedSystemIndexes } =
        await getMissingESIData([...allJobObjects, ...newJobs]);
      recalculateInstallCostsWithNewData(
        [...allJobObjects, ...newJobs],
        requestedMarketData,
        requestedSystemIndexes
      );

      setNumberOfVisibleSkeletonElements(0);

      activeGroupObject.addJobsToGroup(newJobs);

      if (isLoggedIn) {
        await firebaseBatchUpdateJobs(newJobs);
      }

      updateOrAddJobsToJobArray([...retrievedJobs, ...newJobs]);
      useUsersStore
        .getState()
        .worldData.actions.addMarketData(requestedMarketData);
      useUsersStore
        .getState()
        .worldData.actions.addSystemIndex(requestedSystemIndexes);

      // Log successful completion of material building
      logEvent(analytics, "material_build_complete", {
        total_jobs_created: newJobs.length,
        is_full_tree: buildFullItemTree,
        has_blueprint_restriction: ignoreItemsWithoutBlueprints,
        market_data_retrieved: Object.keys(requestedMarketData).length,
        system_indexes_retrieved: Object.keys(requestedSystemIndexes).length,
      });

      showSnackbarSuccess(`${newJobs.length} Jobs Added`);
    } catch (err) {
      console.error(err);

      // Log failure of material building
      logEvent(analytics, "material_build_error", {
        error_message: err.message,
        is_full_tree: buildFullItemTree,
        has_blueprint_restriction: ignoreItemsWithoutBlueprints,
      });
    } finally {
    }
  }

  function buildTypeIDMap(inputJobs) {
    const materialMap = {};

    for (const job of inputJobs) {
      const existingEntry = materialMap[job.itemID];

      const newEntry = buildTypeIDMapObject(job);

      if (existingEntry) {
        materialMap[job.itemID] = mergeTypeIDMapEntries(
          existingEntry,
          newEntry
        );
      } else {
        materialMap[job.itemID] = newEntry;
      }
    }
    return materialMap;
  }

  function buildTypeIDMapObject(job) {
    return {
      name: job.name,
      typeID: job.itemID,
      relatedJobID: job.jobID,
      parentJobs: new Set(job.parentJob),
      groupID: activeGroupID,
    };
  }

  function mergeTypeIDMapEntries(existingEntry, newEntry) {
    return {
      ...existingEntry,
      quantityRequired:
        existingEntry.quantityRequired + newEntry.quantityRequired,
      parentJobs: new Set([
        ...existingEntry.parentJobs,
        ...newEntry.parentJobs,
      ]),
      requiresRecalculation:
        existingEntry.requiresRecalculation || newEntry.requiresRecalculation,
      buildableMaterials:
        existingEntry.buildableMaterials || newEntry.buildableMaterials,
    };
  }

  function buildJobIDMap(inputJobs) {
    const jobMap = {};
    for (const job of inputJobs) {
      jobMap[job.jobID] = job;
    }
    return jobMap;
  }

  function generateMaterialRequests(inputJobs, typeIDMap, availableBlueprints) {
    return inputJobs.flatMap((job) => {
      return job.build.materials
        .filter(
          (material) =>
            checkMaterialIsBuildable(material, availableBlueprints) &&
            !typeIDMap[material.typeID]
        )
        .map((material) => ({
          typeID: material.typeID,
          groupID: job.groupID,
          relatedJobID: job.jobID,
        }));
    });
  }

  function checkMaterialIsBuildable(material, availableBlueprints) {
    if (ignoreItemsWithoutBlueprints) {
      return (
        availableBlueprints.has(material.typeID) &&
        !checkTypeIDisExempt(material.typeID) &&
        checkJobTypeIsBuildable(material.jobType)
      );
    }

    return (
      !checkTypeIDisExempt(material.typeID) &&
      checkJobTypeIsBuildable(material.jobType)
    );
  }

  async function processMaterials(
    jobIDMap,
    typeIDMap,
    materialRequests,
    buildFullItemTree,
    setNumberOfVisibleSkeletonElements,
    availableBlueprints
  ) {
    const newJobs = [];
    const processingQueue = [...materialRequests];
    const materialsAwaitingRequest = [];
    const processedJobMaterialPairs = new Set();
    const relatedJobIDs = new Set(
      materialRequests.map((request) => request.relatedJobID)
    );
    let currentDepth = 0;
    const MAX_DEPTH = 100;

    while (processingQueue.length > 0 && currentDepth < MAX_DEPTH) {
      const currentMaterial = processingQueue.shift();
      const jobMaterialKey = `${currentMaterial.relatedJobID}-${currentMaterial.typeID}`;

      if (processedJobMaterialPairs.has(jobMaterialKey)) {
        continue;
      }

      processedJobMaterialPairs.add(jobMaterialKey);

      try {
        const matchedMaterial = typeIDMap[currentMaterial.typeID];
        if (matchedMaterial) {
          updateExistingItemInTypeIDMap(currentMaterial, typeIDMap);
        } else {
          manageMaterialRequestQueue(materialsAwaitingRequest, currentMaterial);
        }
        if (
          processingQueue.length === 0 &&
          materialsAwaitingRequest.length > 0
        ) {
          const newJobObjects = await retrieveNewMaterials(
            materialsAwaitingRequest,
            newJobs
          );
          addNewItemsToTypeIDMap(newJobObjects, typeIDMap);
          addNewItemsToJobIDMap(newJobObjects, jobIDMap);

          newJobObjects.forEach((job) => relatedJobIDs.add(job.jobID));

          materialsAwaitingRequest.length = 0;
        }
        if (
          processingQueue.length === 0 &&
          materialsAwaitingRequest.length === 0 &&
          buildFullItemTree
        ) {
          currentDepth++;

          const nextLevelOfRequests = generateMaterialRequests(
            Object.values(jobIDMap).filter((job) =>
              relatedJobIDs.has(job.jobID)
            ),
            typeIDMap,
            availableBlueprints
          ).filter(
            (request) =>
              !processedJobMaterialPairs.has(
                `${request.relatedJobID}-${request.typeID}`
              )
          );

          if (nextLevelOfRequests.length === 0) {
            break;
          }

          setNumberOfVisibleSkeletonElements(
            (prev) => (prev += nextLevelOfRequests.length)
          );
          processingQueue.push(...nextLevelOfRequests);
        }
      } catch (materialError) {
        console.error("error processing job:", materialError);
      }
    }

    if (currentDepth >= MAX_DEPTH) {
      console.warn(
        "Reached maximum depth while building material tree. Some materials may be missing."
      );
    }

    return newJobs;
  }

  function addNewItemsToTypeIDMap(newJobs, typeIDMap) {
    for (const job of newJobs) {
      typeIDMap[job.itemID] = buildTypeIDMapObject(job);
    }
  }

  function addNewItemsToJobIDMap(newJobs, jobIDMap) {
    for (const job of newJobs) {
      jobIDMap[job.jobID] = job;
    }
  }

  function updateExistingItemInTypeIDMap(inputMaterial, materialMap) {
    const matchedMaterial = materialMap[inputMaterial.typeID];
    matchedMaterial.parentJobs.add(inputMaterial.relatedJobID);
  }

  function manageMaterialRequestQueue(queue, newRequest) {
    const existingMaterial = queue.find((i) => i.itemID === newRequest.typeID);
    if (existingMaterial) {
      updateBuildRequest(existingMaterial, newRequest);
    } else {
      queue.push(createBuildRequest(newRequest));
    }
  }

  async function retrieveNewMaterials(queue, newJobsStorage) {
    try {
      const newJobs = await buildJob(queue);
      newJobsStorage.push(...newJobs);
      return newJobs;
    } catch (err) {
      console.error("Error retrieving jobs");
      return [];
    }
  }

  function createBuildRequest(request) {
    return {
      itemID: request.typeID,
      groupID: request.groupID,
      parentJobs: [request.relatedJobID],
    };
  }

  function updateBuildRequest(existingRequest, newRequest) {
    existingRequest.parentJobs = [
      ...new Set([...existingRequest.parentJobs, newRequest.relatedJobID]),
    ];
  }

  return {
    buildNextMaterials,
  };
}

export default useBuildJobTree;
