import getMissingESIData from "../Shared/getMissingESIData";
import { recalculateInstallCostsWithNewData } from "../Installation Costs/installCosts";
import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import { getCachedData } from "../Helper/getCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import { parseNumberWithSeparators } from "../Helper/numberParser";
import { checkClipboardReadPermissions } from "../Clipboard/clipboardPermissions";
import readTextFromClipboard from "../Clipboard/readTextFromClipboard";
import { buildJob } from "./buildJob";
import recalculateJobForNewTotal from "./recalculateJobForNewTotal";

export async function importFromClipboard() {
  const itemNameRegex = /^\[(?<itemName>.+),\s*(?<fittingName>.+)\]/g;
  const itemMatchesRegex =
    /^(?![^\r\n,]*,)(?<module>[^\[\r\n]+)|^(?:(?![^\r\n,]*,)(?!\[|\sx\d).)+/gm;
  const itemWithQuantitiesRegex = /^(?<module>[^\n]*?)\s*x(?<quantity>\d+)/gm;
  const itemsWithChargesRegex =
    /^(?![^\r\n,]*[\[\]])(?=.*,)(?<module>[^,\r\n]+),\s*(?<charge>[^,\r\n]+)$/gm;

  const hasPermission = await checkClipboardReadPermissions();
  if (!hasPermission) {
    throw new Error("Clipboard access denied. Please enable permissions.");
  }

  const itemTypes = await getCachedData(CACHED_DATA_FILES.SEARCH_INDEX);
  const importedText = await readTextFromClipboard();
  if (!importedText) {
    return { importedItems: [], fittingName: "" };
  }

  const itemNameMatch = [...importedText.matchAll(itemNameRegex)];
  const itemMatches = [...importedText.matchAll(itemMatchesRegex)];
  const itemsWithQuantities = [...importedText.matchAll(itemWithQuantitiesRegex)];
  const itemsWithCharges = [...importedText.matchAll(itemsWithChargesRegex)];
  const shipNameAndFittingName = itemNameMatch[0];
  if (!shipNameAndFittingName) {
    return { importedItems: [], fittingName: "" };
  }
  const { itemName, fittingName } = shipNameAndFittingName.groups;

  const objectArray = [
    {
      itemName,
      itemBaseQty: 1,
      itemCalculatedQty: 1,
      included: false,
      buildable: false,
    },
  ];

  const filteredItemMatches = itemMatches
    .filter((match) => !match[0].match(/\sx\d/))
    .map((match) => match[0].trim());

  filteredItemMatches.forEach((name) => {
    updateObjectArray(objectArray, name);
  });
  itemsWithQuantities.forEach((match) => {
    updateObjectArray(objectArray, match.groups.module, match.groups.quantity);
  });
  itemsWithCharges.forEach((match) => {
    updateObjectArray(objectArray, match.groups.module);
    updateObjectArray(objectArray, match.groups.charge);
  });

  objectArray.forEach((item) => {
    const matchingItemType = itemTypes.find((itemType) => itemType.name === item.itemName);
    if (matchingItemType) {
      item.itemID = matchingItemType.itemID;
      item.included = true;
      item.buildable = true;
    }
  });

  return { importedItems: objectArray, fittingName };
}

function updateObjectArray(objectArray, itemName, quantity = 1) {
  const foundItem = objectArray.find((item) => item.itemName === itemName);
  if (foundItem) {
    foundItem.itemBaseQty += parseNumberWithSeparators(quantity);
    foundItem.itemCalculatedQty += parseNumberWithSeparators(quantity);
  } else {
    objectArray.push({
      itemName,
      itemBaseQty: parseNumberWithSeparators(quantity),
      itemCalculatedQty: parseNumberWithSeparators(quantity),
      included: false,
      buildable: false,
    });
  }
}

export function convertImportedItemsToBuildRequests(inputArray) {
  return inputArray
    .map((itemEntry) => {
      if (itemEntry.included && itemEntry.buildable) {
        return {
          itemID: itemEntry.itemID,
          itemQty: itemEntry.itemCalculatedQty,
        };
      }
      return null;
    })
    .filter(Boolean);
}

export async function finalBuildRequests(itemArray, queryClient) {
  const { activeGroupID, jobArray } = useUsersStore.getState().jobData;
  const {
    updateModifiedGroups,
    queueJobGroupWritesAndSchedule,
    getActiveGroupObject,
    getGroupObject,
    updateOrAddJobsToJobArray,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;

  const activeGroupObject = getActiveGroupObject();
  if (!itemArray || !activeGroupObject) return;

  let jobsToSave = new Set();
  const buildRequests = convertImportedItemsToBuildRequests(itemArray);
  buildRequests.forEach((request) => {
    request.groupID = activeGroupID;
  });

  const groupEntriesToModifiy = buildRequests.filter((entry) =>
    activeGroupObject.hasIncludedTypeId(entry.itemID)
  );
  const itemsToBuild = buildRequests.filter(
    (entry) => !groupEntriesToModifiy.some((i) => i.itemID === entry.itemID)
  );

  const newJobData = await buildJob(itemsToBuild, { queryClient });
  const normalizedNewJobs = Array.isArray(newJobData)
    ? newJobData
    : newJobData
      ? [newJobData]
      : [];

  const newJobArray = [...jobArray, ...normalizedNewJobs];
  const combinedJobsToSave = [...normalizedNewJobs];

  for (const job of normalizedNewJobs) {
    job.build.materials.forEach((material) => {
      const materialMatch = newJobArray.find(
        (i) => i.itemID === material.typeID && i.groupID === activeGroupID
      );
      if (materialMatch) {
        materialMatch.parentJobs.push(job.jobID);
        job.build.childJobs[material.typeID].push(materialMatch.jobID);
        jobsToSave.add(materialMatch.jobID);
      }
    });
  }

  for (const entry of groupEntriesToModifiy) {
    const job = newJobArray.find((i) => i.itemID === entry.itemID);
    if (!job) continue;
    const newQuantity = job.totalQuantityProduced + entry.itemQty;
    recalculateJobForNewTotal(job, newQuantity, queryClient);
    jobsToSave.add(job.jobID);
  }

  const matchedGroup = getGroupObject(activeGroupID);
  if (matchedGroup) {
    matchedGroup.addJobsToGroup(normalizedNewJobs);
  }

  const { requestedMarketData, requestedSystemIndexes } =
    await getMissingESIData(normalizedNewJobs);
  recalculateInstallCostsWithNewData(
    normalizedNewJobs,
    requestedMarketData,
    requestedSystemIndexes
  );

  if (isLoggedIn) {
    for (const id of [...jobsToSave]) {
      const matchedJob = newJobArray.find((i) => i.jobID === id);
      if (!matchedJob) continue;
      combinedJobsToSave.push(matchedJob);
    }
    await saveJobsViaApi(combinedJobsToSave);
  }

  if (matchedGroup?.groupID) {
    updateModifiedGroups(matchedGroup);
    queueJobGroupWritesAndSchedule(matchedGroup.groupID);
  }
  updateOrAddJobsToJobArray(newJobArray);
  useUsersStore.getState().worldData.actions.addMarketData(requestedMarketData);
  useUsersStore.getState().worldData.actions.addSystemIndex(requestedSystemIndexes);
}
