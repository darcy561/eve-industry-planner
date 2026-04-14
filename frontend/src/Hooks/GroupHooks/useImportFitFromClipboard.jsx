import { useJobBuild } from "../useJobBuild";
import { useRecalcuateJob } from "../GeneralHooks/useRecalculateJob";
import getMissingESIData from "../../Functions/Shared/getMissingESIData";
import recalculateInstallCostsWithNewData from "../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import firebaseBatchUpdateJobs from "../../Functions/Firebase/batchUpdateJobs";
import { getCachedData } from "../../Functions/Helper/getCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import { parseNumberWithSeparators } from "../../Functions/Helper/numberParser";
import { checkClipboardReadPermissions } from "../../Functions/Clipboard/clipboardPermissions";
import readTextFromClipboard from "../../Functions/Clipboard/readTextFromClipboard";
/**
 * Custom hook that provides functionality to import EVE Online ship fits from clipboard.
 *
 * This hook handles the complex process of parsing EVE Online fit data:
 * - Parses ship fit data from clipboard text
 * - Extracts ship name, fitting name, modules, and charges
 * - Handles quantities and module variations
 * - Matches items against cached item database
 * - Converts imported items to build requests
 * - Creates jobs for buildable items
 * - Updates existing group jobs with new quantities
 * - Manages parent-child relationships between jobs
 * - Fetches missing ESI data and recalculates costs
 *
 * The import process:
 * 1. Checks clipboard read permissions
 * 2. Parses fit data using regex patterns
 * 3. Extracts ship name, fitting name, and modules
 * 4. Matches items against cached database
 * 5. Converts to build requests
 * 6. Creates new jobs or updates existing ones
 * 7. Builds parent-child relationships
 * 8. Fetches ESI data and recalculates costs
 * 9. Updates Firebase and local state
 *
 * @returns {Object} Object containing fit import functions
 * @returns {Function} returns.finalBuildRequests - Processes imported items and creates jobs
 * @returns {Function} returns.importFromClipboard - Imports fit data from clipboard
 * @returns {Function} returns.convertImportedItemsToBuildRequests - Converts items to build requests
 *
 * @example
 * function FitImporter() {
 *   const { importFromClipboard, finalBuildRequests } = useImportFitFromClipboard();
 *
 *   const handleImportFit = async () => {
 *     const { importedItems, fittingName } = await importFromClipboard();
 *     await finalBuildRequests(importedItems);
 *     console.log(`Imported fit: ${fittingName}`);
 *   };
 *
 *   return <button onClick={handleImportFit}>Import Fit</button>;
 * }
 */
export function useImportFitFromClipboard() {
  const { activeGroupID, groupArray, jobArray } = useUsersStore(
    (state) => state.jobData
  );
  const {
    replaceGroupArray,
    getActiveGroupObject,
    getGroupObject,
    replaceJobArray,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { buildJob } = useJobBuild();
  const { recalculateJobForNewTotal } = useRecalcuateJob();

  /**
   * Imports ship fit data from clipboard and parses it into structured item data.
   *
   * @returns {Promise<Object>} Promise that resolves to import result
   * @returns {Array} returns.importedItems - Array of parsed item objects
   * @returns {string} returns.fittingName - Name of the imported fitting
   *
   * @private
   */
  async function importFromClipboard() {
    const itemNameRegex = /^\[(?<itemName>.+),\s*(?<fittingName>.+)\]/g;
    const itemMatchesRegex =
      /^(?![^\r\n,]*,)(?<module>[^\[\r\n]+)|^(?:(?![^\r\n,]*,)(?!\[|\sx\d).)+/gm;
    const itemWithQuantitiesRegex = /^(?<module>[^\n]*?)\s*x(?<quantity>\d+)/gm;
    const itemsWithChargesRegex =
      /^(?![^\r\n,]*[\[\]])(?=.*,)(?<module>[^,\r\n]+),\s*(?<charge>[^,\r\n]+)$/gm;

    // Check clipboard permissions first
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
    const itemsWithQuantities = [
      ...importedText.matchAll(itemWithQuantitiesRegex),
    ];
    const itemsWithCharges = [...importedText.matchAll(itemsWithChargesRegex)];
    const shipNameAndFittingName = itemNameMatch[0];

    if (!shipNameAndFittingName) {
      return { importedItems: [], fittingName: "" };
    }
    const { itemName, fittingName } = shipNameAndFittingName.groups;

    const objectArray = [
      {
        itemName: itemName,
        itemBaseQty: 1,
        itemCalculatedQty: 1,
        included: false,
        buildable: false,
      },
    ];

    const filteredItemMatches = itemMatches
      .filter((match) => !match[0].match(/\sx\d/))
      .map((match) => match[0].trim());

    filteredItemMatches.forEach((itemName) => {
      updateObjectArray(itemName);
    });

    itemsWithQuantities.forEach((match) => {
      updateObjectArray(match.groups.module, match.groups.quantity);
    });

    itemsWithCharges.forEach((match) => {
      updateObjectArray(match.groups.module);
      updateObjectArray(match.groups.charge);
    });

    objectArray.forEach((item) => {
      const matchingItemType = itemTypes.find(
        (itemType) => itemType.name === item.itemName
      );
      if (matchingItemType) {
        item.itemID = matchingItemType.itemID;
        item.included = true;
        item.buildable = true;
      }
    });

    function updateObjectArray(itemName, quantity = 1) {
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

    return { importedItems: objectArray, fittingName };
  }

  function convertImportedItemsToBuildRequests(inputArray) {
    return inputArray
      .map((itemEntry) => {
        if (itemEntry.included && itemEntry.buildable) {
          return {
            itemID: itemEntry.itemID,
            itemQty: itemEntry.itemCalculatedQty,
          };
        }
      })
      .filter((entry) => entry);
  }

  const finalBuildRequests = async (itemArray) => {
    const activeGroupObject = getActiveGroupObject();
    if (!itemArray) return;
    let newPriceIDs = new Set();
    let jobsToSave = new Set();

    const buildRequests = convertImportedItemsToBuildRequests(itemArray);

    buildRequests.forEach((request) => {
      request.groupID = activeGroupID;
    });

    const groupEntriesToModifiy = buildRequests.filter((entry) =>
      activeGroupObject.includedTypeIDs.has(entry.itemID)
    );
    const itemsToBuild = buildRequests.filter(
      (entry) => !groupEntriesToModifiy.some((i) => i.itemID === entry.itemID)
    );

    console.log(itemsToBuild);

    const newJobData = await buildJob(itemsToBuild);

    console.log(newJobData);
    const newJobArray = [...jobArray, ...newJobData];

    const combinedJobsToSave = [...newJobData];

    for (const job of newJobData) {
      newPriceIDs = new Set([...newPriceIDs, ...job.getMaterialIDs()]);

      job.build.materials.forEach((material) => {
        let materialMatch = newJobArray.find(
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
      const newQuantity = job.build.products.totalQuantity + entry.itemQty;

      recalculateJobForNewTotal(job, newQuantity);
      jobsToSave.add(job.jobID);
    }

    const matchedGroup = getGroupObject(activeGroupID);
    if (matchedGroup) {
      matchedGroup.addJobsToGroup(newJobData);
    }

    const { requestedMarketData, requestedSystemIndexes } =
      await getMissingESIData(newJobData);

    recalculateInstallCostsWithNewData(
      newJobData,
      requestedMarketData,
      requestedSystemIndexes
    );

    if (isLoggedIn) {
      for (let id of [...jobsToSave]) {
        let matchedJob = newJobArray.find((i) => i.jobID === id);
        if (!matchedJob) return;
        combinedJobsToSave.push(matchedJob);
      }
      await firebaseBatchUpdateJobs(combinedJobsToSave);
    }

    replaceGroupArray([...groupArray]);
    replaceJobArray(newJobArray);
    useUsersStore
      .getState()
      .worldData.actions.addMarketData(requestedMarketData);
    useUsersStore
      .getState()
      .worldData.actions.addSystemIndex(requestedSystemIndexes);
  };

  return {
    finalBuildRequests,
    importFromClipboard,
    convertImportedItemsToBuildRequests,
  };
}
