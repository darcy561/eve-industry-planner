import checkJobTypeIsBuildable from "../Helper/checkJobTypeIsBuildable";
import buildParentChildRelationships from "../Helper/buildParentChildRelationships";
import retrieveJobIDsFromGroupObjects from "../Helper/getJobIDsFromGroupObjects";
import materialTreeShaker from "../Helper/materialTreeShaker";
import getMissingESIData from "../Shared/getMissingESIData";
import recalculateInstallCostsWithNewData from "../Installation Costs/recalculateInstallCostsWithNewData";
import { getAvailableBlueprintsByMaterialID } from "../Helper/getAvailableBlueprints";
import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import { buildJob } from "./buildJob";
import recalculateJobForNewTotal from "./recalculateJobForNewTotal";

export default async function buildNextMaterialsTree(
  inputJobIDs,
  setNumberOfVisibleSkeletonElements,
  queryClient,
  buildFullItemTree = false
) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const { activeGroupID } = useUsersStore.getState().jobData;
  const {
    getActiveGroupObject,
    updateOrAddJobsToJobArray,
    queueJobGroupWritesAndSchedule,
    jobsFromIdsOrObjects,
  } = useUsersStore.getState().jobData.actions;
  const { enableSkipMissingBlueprints: ignoreItemsWithoutBlueprints } =
    useUsersStore.getState().applicationSettings;
  const checkTypeIDisExempt =
    useUsersStore.getState().applicationSettings.actions.checkTypeIDisExempt;

  try {
    if (!inputJobIDs || !setNumberOfVisibleSkeletonElements) {
      throw new Error("missing inputs");
    }
    const jobIDsIncludedInGroup = retrieveJobIDsFromGroupObjects(activeGroupID);
    const allJobObjects = await jobsFromIdsOrObjects([
      ...new Set([...inputJobIDs, ...jobIDsIncludedInGroup]),
    ]);
    const requestedJobObjects = await jobsFromIdsOrObjects(inputJobIDs);

    const availableBlueprints = ignoreItemsWithoutBlueprints
      ? await getAvailableBlueprintsByMaterialID(queryClient)
      : new Set();

    const typeIDMap = buildTypeIDMap(allJobObjects, activeGroupID);
    const jobIDMap = buildJobIDMap(allJobObjects);
    const materialRequests = generateMaterialRequests(
      requestedJobObjects,
      typeIDMap,
      availableBlueprints,
      ignoreItemsWithoutBlueprints,
      checkTypeIDisExempt
    );

    setNumberOfVisibleSkeletonElements(materialRequests.length);
    const newJobs = await processMaterials(
      jobIDMap,
      typeIDMap,
      materialRequests,
      buildFullItemTree,
      setNumberOfVisibleSkeletonElements,
      availableBlueprints,
      queryClient,
      ignoreItemsWithoutBlueprints,
      checkTypeIDisExempt
    );
    buildParentChildRelationships([...allJobObjects, ...newJobs]);
    materialTreeShaker([...allJobObjects, ...newJobs], (job, requiredQuantity) =>
      recalculateJobForNewTotal(job, requiredQuantity, queryClient)
    );
    const { requestedMarketData, requestedSystemIndexes } = await getMissingESIData(
      [...allJobObjects, ...newJobs]
    );
    recalculateInstallCostsWithNewData(
      [...allJobObjects, ...newJobs],
      requestedMarketData,
      requestedSystemIndexes
    );

    setNumberOfVisibleSkeletonElements(0);
    getActiveGroupObject()?.addJobsToGroup(newJobs);

    if (isLoggedIn) {
      await saveJobsViaApi(newJobs);
    }

    updateOrAddJobsToJobArray(newJobs);
    useUsersStore.getState().worldData.actions.addMarketData(requestedMarketData);
    useUsersStore.getState().worldData.actions.addSystemIndex(requestedSystemIndexes);
    showSnackbarSuccess(`${newJobs.length} Jobs Added`);

    if (activeGroupID && newJobs.length > 0) {
      queueJobGroupWritesAndSchedule(activeGroupID);
    }
  } catch (err) {
    console.error(err);
  }
}

function buildTypeIDMap(inputJobs, activeGroupID) {
  const materialMap = {};
  for (const job of inputJobs) {
    const existingEntry = materialMap[job.itemID];
    const newEntry = buildTypeIDMapObject(job, activeGroupID);
    if (existingEntry) {
      materialMap[job.itemID] = mergeTypeIDMapEntries(existingEntry, newEntry);
    } else {
      materialMap[job.itemID] = newEntry;
    }
  }
  return materialMap;
}

function buildTypeIDMapObject(job, activeGroupID) {
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
    quantityRequired: existingEntry.quantityRequired + newEntry.quantityRequired,
    parentJobs: new Set([...existingEntry.parentJobs, ...newEntry.parentJobs]),
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

function generateMaterialRequests(
  inputJobs,
  typeIDMap,
  availableBlueprints,
  ignoreItemsWithoutBlueprints,
  checkTypeIDisExempt
) {
  return inputJobs.flatMap((job) =>
    job.build.materials
      .filter(
        (material) =>
          checkMaterialIsBuildable(
            material,
            availableBlueprints,
            ignoreItemsWithoutBlueprints,
            checkTypeIDisExempt
          ) && !typeIDMap[material.typeID]
      )
      .map((material) => ({
        typeID: material.typeID,
        groupID: job.groupID,
        relatedJobID: job.jobID,
      }))
  );
}

function checkMaterialIsBuildable(
  material,
  availableBlueprints,
  ignoreItemsWithoutBlueprints,
  checkTypeIDisExempt
) {
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
  availableBlueprints,
  queryClient,
  ignoreItemsWithoutBlueprints,
  checkTypeIDisExempt
) {
  const newJobs = [];
  const processingQueue = [...materialRequests];
  const materialsAwaitingRequest = [];
  const processedJobMaterialPairs = new Set();
  const relatedJobIDs = new Set(materialRequests.map((r) => r.relatedJobID));
  let currentDepth = 0;
  const MAX_DEPTH = 100;

  while (processingQueue.length > 0 && currentDepth < MAX_DEPTH) {
    const currentMaterial = processingQueue.shift();
    const jobMaterialKey = `${currentMaterial.relatedJobID}-${currentMaterial.typeID}`;
    if (processedJobMaterialPairs.has(jobMaterialKey)) continue;
    processedJobMaterialPairs.add(jobMaterialKey);

    try {
      const matchedMaterial = typeIDMap[currentMaterial.typeID];
      if (matchedMaterial) {
        typeIDMap[currentMaterial.typeID].parentJobs.add(
          currentMaterial.relatedJobID
        );
      } else {
        manageMaterialRequestQueue(materialsAwaitingRequest, currentMaterial);
      }

      if (processingQueue.length === 0 && materialsAwaitingRequest.length > 0) {
        const newJobObjects = await retrieveNewMaterials(
          materialsAwaitingRequest,
          newJobs,
          queryClient
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
          Object.values(jobIDMap).filter((job) => relatedJobIDs.has(job.jobID)),
          typeIDMap,
          availableBlueprints,
          ignoreItemsWithoutBlueprints,
          checkTypeIDisExempt
        ).filter(
          (request) =>
            !processedJobMaterialPairs.has(
              `${request.relatedJobID}-${request.typeID}`
            )
        );

        if (nextLevelOfRequests.length === 0) break;

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
    typeIDMap[job.itemID] = {
      name: job.name,
      typeID: job.itemID,
      relatedJobID: job.jobID,
      parentJobs: new Set(job.parentJob),
      groupID: job.groupID,
    };
  }
}

function addNewItemsToJobIDMap(newJobs, jobIDMap) {
  for (const job of newJobs) {
    jobIDMap[job.jobID] = job;
  }
}

function manageMaterialRequestQueue(queue, newRequest) {
  const existingMaterial = queue.find((i) => i.itemID === newRequest.typeID);
  if (existingMaterial) {
    existingMaterial.parentJobs = [
      ...new Set([...existingMaterial.parentJobs, newRequest.relatedJobID]),
    ];
  } else {
    queue.push({
      itemID: newRequest.typeID,
      groupID: newRequest.groupID,
      parentJobs: [newRequest.relatedJobID],
    });
  }
}

async function retrieveNewMaterials(queue, newJobsStorage, queryClient) {
  try {
    const newJobs = await buildJob(queue, { queryClient });
    newJobsStorage.push(...newJobs);
    return newJobs;
  } catch {
    console.error("Error retrieving jobs");
    return [];
  }
}
