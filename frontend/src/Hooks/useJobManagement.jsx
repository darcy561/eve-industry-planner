import { useJobBuild } from "./useJobBuild";
import { STATIONID_RANGE } from "../Context/defaultValues";
import JobSnapshot from "../Classes/jobSnapshot";
import getStationData from "../Functions/EveESI/World/getStationData";
import uploadJobSnapshotsToFirebase from "../Functions/Firebase/uploadJobSnapshots";
import findOrGetJobObject from "../Functions/Helper/findJobObject";
import manageListenerRequests from "../Functions/Firebase/manageListenerRequests";
import seperateGroupAndJobIDs from "../Functions/Helper/seperateGroupAndJobIDs";
import getMissingESIData from "../Functions/Shared/getMissingESIData";
import checkJobTypeIsBuildable from "../Functions/Helper/checkJobTypeIsBuildable";
import recalculateInstallCostsWithNewData from "../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import { getAvailableBlueprintsByMaterialID } from "../Functions/Helper/getAvailableBlueprints";
import firebaseBatchUpdateJobs from "../Functions/Firebase/batchUpdateJobs";
import firebaseBatchDeleteJobs from "../Functions/Firebase/batchDeleteJobs";
import { showSnackbarSuccess } from "../Events/snackbarEvents";
import {
  showMassBuildFeedback,
  hideMassBuildFeedback,
} from "../Events/massBuildEvents";
import useUsersStore from "../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedCharacterSkills } from "../Hooks/EveEsi/Character/useGetCharacterSkills";
import { getCachedCharacterStandings } from "../Hooks/EveEsi/Character/useGetCharacterStandings";
import { getAllCachedCorporationBlueprints } from "../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import { getAllCachedCharacterBlueprints } from "../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";

/**
 * Custom hook that provides comprehensive job management functionality for EVE Online industry planning.
 * 
 * This hook handles all aspects of job management:
 * - Mass building materials for multiple jobs
 * - Merging duplicate jobs into single jobs
 * - Calculating broker fees for market orders
 * - Time remaining calculations for active jobs
 * - Blueprint type detection (BPC vs BP)
 * - Deep copying job objects with proper Set handling
 * - Finding child job counts and IDs
 * 
 * The job management process includes:
 * 1. Mass building: Creates child jobs for materials across multiple jobs
 * 2. Job merging: Combines duplicate jobs and updates relationships
 * 3. Broker fees: Calculates fees based on skills and standings
 * 4. Blueprint detection: Determines blueprint type from available blueprints
 * 
 * @returns {Object} Object containing job management functions
 * @returns {Function} returns.calcBrokersFee - Calculates broker fees for market orders
 * @returns {Function} returns.findAllChildJobCountOrIDs - Finds child job counts and IDs
 * @returns {Function} returns.findBlueprintType - Determines blueprint type (BPC/BP)
 * @returns {Function} returns.massBuildMaterials - Mass builds materials for jobs
 * @returns {Function} returns.mergeJobsNew - Merges duplicate jobs
 * 
 * @example
 * function JobManager() {
 *   const { massBuildMaterials, mergeJobsNew, calcBrokersFee } = useJobManagement();
 * 
 *   const handleMassBuild = async (jobIDs) => {
 *     await massBuildMaterials(jobIDs);
 *     console.log("Materials built for jobs");
 *   };
 * 
 *   const handleMergeJobs = async (jobIDs) => {
 *     await mergeJobsNew(jobIDs);
 *     console.log("Jobs merged successfully");
 *   };
 * 
 *   return <div>Job management interface</div>;
 * }
 */
export function useJobManagement() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { userJobSnapshot, jobArray } = useUsersStore((state) => state.jobData);
  const { replaceUserJobSnapshotArray, addRetrievedJobsToJobArray, replaceJobArray } = useUsersStore.getState().jobData.actions;
  const { addLinkedEsiData } = useUsersStore.getState().account.actions;
  const ignoreItemsWithoutBlueprints = useUsersStore.getState().applicationSettings.enableSkipMissingBlueprints;
  const checkTypeIDisExempt = useUsersStore.getState().applicationSettings.actions.checkTypeIDisExempt;
  const citadelBrokersFee =
    useUsersStore.getState().applicationSettings.defaultCitadelBrokersFee;
  const firebaseListeners = useUsersStore.getState().users.firebaseListeners;
  const removeFirebaseListeners = useUsersStore.getState().users.actions.removeFirebaseListeners;
  const { buildJob } = useJobBuild();
  const queryClient = useQueryClient();
  const massBuildMaterials = async (inputJobIDs) => {
    let finalBuildCount = [];
    let childJobs = [];
    let newUserJobSnapshot = [...userJobSnapshot];
    const retrievedJobs = [];
    let jobsToSave = new Set();
    let materialsIgnored = new Set();
    const newJobsMapByTypeID = {};
    const inputJobsMapByID = {};

    const { jobIDs } = seperateGroupAndJobIDs(inputJobIDs);

    // Load available blueprints if needed
    const availableBlueprints = ignoreItemsWithoutBlueprints
      ? await getAvailableBlueprintsByMaterialID(queryClient)
      : new Set();

    for (let inputJobID of jobIDs) {
      let inputJob = await findOrGetJobObject(
        inputJobID,
        retrievedJobs
      );
      if (!inputJob) {
        continue;
      }

      inputJobsMapByID[inputJob.jobID] = inputJob;

      inputJob.build.materials.forEach((material) => {
        if (inputJob.build.childJobs[material.typeID].length > 0) {
          return;
        }
        if (!checkJobTypeIsBuildable(material.jobType)) {
          return;
        }
        if (checkTypeIDisExempt(material.typeID)) {
          materialsIgnored.add(material.typeID);
          return;
        }

        if (ignoreItemsWithoutBlueprints) {
          if (!availableBlueprints.has(material.typeID)) {
            materialsIgnored.add(material.typeID);
            return;
          }
        }

        if (!finalBuildCount.some((i) => i.itemID === material.typeID)) {
          finalBuildCount.push({
            itemID: material.typeID,
            itemQty: material.quantity,
            parentJobs: new Set([inputJob.jobID]),
          });
        } else {
          const index = finalBuildCount.findIndex(
            (i) => i.itemID === material.typeID
          );
          if (index !== -1) {
            finalBuildCount[index].itemQty += material.quantity;
            finalBuildCount[index].parentJobs.add(inputJob.jobID);
          }
        }
      });
    }

    showMassBuildFeedback(0, finalBuildCount.length, finalBuildCount.length);

    finalBuildCount.forEach((item) => (item.parentJobs = [...item.parentJobs]));

    let newJobs = await buildJob(finalBuildCount);

    for (let i = 0; i < newJobs.length; i++) {
      const newJob = newJobs[i];
      childJobs.push(newJob);
      newJobsMapByTypeID[newJob.itemID] = newJob;
      await new Promise((resolve) => setTimeout(resolve, 50));
      showMassBuildFeedback(
        i + 1,
        finalBuildCount.length,
        finalBuildCount.length
      );
    }

    Object.values(inputJobsMapByID).forEach((inputJob) => {
      Object.entries(newJobsMapByTypeID).forEach(([typeID, newJob]) => {
        inputJob.addChildJob(Number(typeID), newJob.jobID);
      });

      const matchedSnapshot = newUserJobSnapshot.find(
        (i) => i.jobID === inputJob.jobID
      );
      if (!matchedSnapshot) {
        matchedSnapshot.setSnapshot(inputJob);
      }

      jobsToSave.add(inputJob.jobID);
    });

    childJobs.sort((a, b) => {
      if (a.name < b.name) {
        return -1;
      }
      if (a.name > b.name) {
        return 1;
      }
      return 0;
    });

    const combinedJobsForSave = [...childJobs];

    for (let childJob of childJobs) {
      newUserJobSnapshot.push(new JobSnapshot(childJob));
      retrievedJobs.push(childJob);
    }

    if (isLoggedIn) {
      for (let jobID of [...jobsToSave]) {
        let job = [...jobArray, ...retrievedJobs].find(
          (i) => i.jobID === jobID
        );

        if (!job) {
          return;
        }
        combinedJobsForSave.push(job);
      }

      await firebaseBatchUpdateJobs(combinedJobsForSave);
      await uploadJobSnapshotsToFirebase(newUserJobSnapshot);
    }

    manageListenerRequests(retrievedJobs);
    const { requestedMarketData, requestedSystemIndexes } =
      await getMissingESIData(newJobs);

    recalculateInstallCostsWithNewData(
      newJobs,
      requestedMarketData,
      requestedSystemIndexes
    );
    useUsersStore
      .getState()
      .worldData.actions.addMarketData(requestedMarketData);
    useUsersStore
      .getState()
      .worldData.actions.addSystemIndex(requestedSystemIndexes);

    addRetrievedJobsToJobArray(retrievedJobs);
    replaceUserJobSnapshotArray(newUserJobSnapshot);
    hideMassBuildFeedback();

    const jobWord = childJobs.length === 1 ? "Job" : "Jobs";
    const materialWord = materialsIgnored.size === 1 ? "Material" : "Materials";

    showSnackbarSuccess(
      `${childJobs.length} ${jobWord} Added, ${materialsIgnored.size} ${materialWord} Ignored.`,
      3
    );
  };

  const mergeJobsNew = async (inputJobIDs) => {
    let buildData = [];
    let newJobHold = [];
    let newJobArray = [...jobArray];
    const retrievedJobs = [];
    let newUserJobSnapshot = [...userJobSnapshot];
    let linkedJobIdsToRemove = new Set();
    let linkedOrderIdsToRemove = new Set();
    let linkedTransIdsToRemove = new Set();

    for (let inputJobID of inputJobIDs) {
      let currentJob = await findOrGetJobObject(
        inputJobID,
        retrievedJobs
      );
      if (!currentJob) {
        continue;
      }
      let buildEntry = buildData.find((i) => i.typeID === currentJob.itemID);

      if (!buildEntry) {
        let childJobArray = [];
        currentJob.build.materials.forEach((mat) => {
          if (currentJob.build.childJobs[mat.typeID].length === 0) return;
          childJobArray.push({
            typeID: mat.typeID,
            childJobs: new Set(currentJob.build.childJobs[mat.typeID]),
          });
        });

        buildData.push({
          inputJobCount: 1,
          typeID: currentJob.itemID,
          parentJobs: new Set(currentJob.parentJobs),
          childJobs: childJobArray,
          totalItemQuantity: currentJob.build.products.totalQuantity,
          oldJobIDs: new Set([currentJob.jobID]),
          newJobIDs: new Set(),
        });
      } else {
        buildEntry.inputJobCount++;
        buildEntry.parentJobs = new Set([
          ...buildEntry.parentJobs,
          ...currentJob.parentJobs,
        ]);
        buildEntry.totalItemQuantity += currentJob.build.products.totalQuantity;
        buildEntry.oldJobIDs.add(currentJob.jobID);

        currentJob.build.materials.forEach((mat) => {
          let childJobEntry = buildEntry.childJobs.find(
            (i) => i.typeID === mat.typeID
          );
          if (!childJobEntry) {
            buildEntry.childJobs.push({
              typeID: mat.typeID,
              childJobs: new Set(currentJob.build.childJobs[mat.typeID]),
            });
          } else {
            childJobEntry.childJobs = new Set([
              ...childJobEntry.childJobs,
              ...currentJob.build.childJobs[mat.typeID],
            ]);
          }
        });
      }
    }

    buildData = buildData.filter((i) => i.inputJobCount > 1);

    for (let buildItem of buildData) {
      let newJob = await buildJob({
        itemID: buildItem.typeID,
        itemQty: buildItem.totalItemQuantity,
        parentJobs: [...buildItem.parentJobs],
        childJobs: [...buildItem.childJobs],
      });
      buildItem.newJobIDs.add(newJob.jobID);
      newJobHold.push(newJob);
    }

    for (let buildItem of buildData) {
      for (let material of buildItem.childJobs) {
        let replacementJob = newJobHold.find(
          (i) => i.itemID === material.typeID
        );
        if (!replacementJob) {
          continue;
        }
        replacementJob.parentJobs = replacementJob.parentJobs.concat([
          ...buildItem.newJobIDs,
        ]);
        replacementJob.parentJobs = replacementJob.parentJobs.filter(
          (i) => !buildItem.oldJobIDs.has(i)
        );
      }
    }

    for (let buildItem of buildData) {
      if (buildItem.inputJobCount < 2) {
        continue;
      }
      buildItem.parentJobs.forEach((parentJobID) => {
        let parentJob = [...newJobArray, ...retrievedJobs].find(
          (i) => i.jobID === parentJobID
        );
        if (!parentJob) {
          return;
        }

        let parentMaterial = parentJob.build.childJobs[buildItem.typeID];
        parentMaterial = parentMaterial.filter(
          (i) => !buildItem.oldJobIDs.has(i)
        );
        parentMaterial = parentMaterial.concat([...buildItem.newJobIDs]);
        parentJob.build.childJobs[buildItem.typeID] = parentMaterial;
      });

      for (let itemType of buildItem.childJobs) {
        itemType.childJobs.forEach((id) => {
          let matchingJob = [...newJobArray, ...retrievedJobs].find(
            (i) => i.jobID === id
          );
          if (!matchingJob) {
            return;
          }
          matchingJob.parentJobs = matchingJob.parentJobs.filter(
            (i) => !buildItem.oldJobIDs.has(i)
          );
          matchingJob.parentJobs = matchingJob.parentJobs.concat([
            ...buildItem.newJobIDs,
          ]);
        });
      }
      for (let replacementJob of newJobHold) {
        let matchingMaterial = replacementJob.build.childJobs[buildItem.typeID];
        if (!matchingMaterial) continue;
        matchingMaterial = matchingMaterial.concat([...buildItem.newJobIDs]);
        matchingMaterial = matchingMaterial.filter(
          (i) => !buildItem.oldJobIDs.has(i)
        );
      }
    }

    const oldJobsToDelete = [];
    for (let buildItem of buildData) {
      buildItem.oldJobIDs.forEach((oldJobID) => {
        let oldJob = [...newJobArray, ...retrievedJobs].find(
          (i) => i.jobID === oldJobID
        );
        if (!oldJob) {
          return;
        }

        oldJob.apiJobs.forEach((jobID) => {
          linkedJobIdsToRemove.add(jobID);
        });

        oldJob.build.sale.transactions.forEach((trans) => {
          linkedTransIdsToRemove.add(trans.order_id);
        });

        oldJob.build.sale.marketOrders.forEach((order) => {
          linkedOrderIdsToRemove.add(order.order_id);
        });

        if (isLoggedIn) {
          oldJobsToDelete.push(oldJob);
          const listener = firebaseListeners.find(({ id }) => oldJob.jobID);
          if (listener) {
            listener.unsubscribe();
          }
        }
      });
      newJobArray = newJobArray.filter(
        (i) => !buildItem.oldJobIDs.has(i.jobID)
      );
      newUserJobSnapshot = newUserJobSnapshot.filter(
        (i) => !buildItem.oldJobIDs.has(i.jobID)
      );
    }
    for (let job of newJobHold) {
      newUserJobSnapshot.push(new JobSnapshot(job));
    }

    // Get all jobs that need to be saved (new jobs + modified existing jobs)
    const jobsToSave = new Set();

    // Add new jobs
    newJobHold.forEach(job => jobsToSave.add(job.jobID));

    // Add modified existing jobs
    for (let buildItem of buildData) {
      buildItem.parentJobs.forEach(parentJobID => jobsToSave.add(parentJobID));
      for (let itemType of buildItem.childJobs) {
        itemType.childJobs.forEach(id => jobsToSave.add(id));
      }
    }

    const combinedJobsToSave = [...newJobHold];
    for (let id of jobsToSave) {
      let job = [...newJobArray, ...retrievedJobs].find((i) => i.jobID === id);
      if (job && !newJobHold.find(j => j.jobID === id)) {
        const matchedSnapshot = newUserJobSnapshot.find(
          (i) => i.jobID === job.jobID
        );
        if (matchedSnapshot) {
          matchedSnapshot.setSnapshot(job);
        }
        combinedJobsToSave.push(job);
      }
    }

    if (isLoggedIn) {
      await firebaseBatchDeleteJobs(oldJobsToDelete);
      await firebaseBatchUpdateJobs(combinedJobsToSave);
      await uploadJobSnapshotsToFirebase(newUserJobSnapshot);
      removeFirebaseListeners(oldJobsToDelete.map((job) => job.jobID));
    }

    manageListenerRequests([...newJobHold, ...retrievedJobs]);

    addLinkedEsiData({
      ordersToRemove: linkedOrderIdsToRemove,
      jobsToRemove: linkedJobIdsToRemove,
      transactionsToRemove: linkedTransIdsToRemove,
    });

    replaceUserJobSnapshotArray(newUserJobSnapshot);
    replaceJobArray(newJobArray);

    showSnackbarSuccess(
      newJobHold.length > 0
        ? `${newJobHold.length} Jobs Merged Successfully`
        : `0 Jobs Merged`,
      3
    );
  };

  async function calcBrokersFee(marketOrder) {
    let brokerFeePercentage = citadelBrokersFee;

    if (
      marketOrder.location_id >= STATIONID_RANGE.low &&
      marketOrder.location_id <= STATIONID_RANGE.high
    ) {
      const { data: characterSkills } = getCachedCharacterSkills(
        queryClient,
        marketOrder.CharacterHash
      );
      const { data: characterStandings } = getCachedCharacterStandings(
        queryClient,
        marketOrder.CharacterHash
      );

      const brokerSkill = characterSkills[3446];
      const stationInfo = await getStationData(marketOrder.location_id);

      const factionStanding =
        characterStandings?.find((i) => i.from_id === stationInfo.race_id)
          ?.standing ?? 0;
      const corpStanding =
        characterStandings?.find((i) => i.from_id === stationInfo.owner)
          ?.standing ?? 0;

      brokerFeePercentage =
        3 -
        0.3 * (brokerSkill?.activeLevel ?? 0) -
        0.03 * factionStanding -
        0.02 * corpStanding;
    }

    const brokersFee =
      (brokerFeePercentage / 100) *
      (marketOrder.price * marketOrder.volume_total);

    return Math.max(brokersFee, 100);
  }

  function findBlueprintType(blueprintID) {
    if (!blueprintID) {
      return "bpc";
    }

    const { data: characterBlueprints } =
      getAllCachedCharacterBlueprints(queryClient);
    const { data: corporationBlueprints } =
      getAllCachedCorporationBlueprints(queryClient);

    const blueprintData = [
      ...Object.values(characterBlueprints).flat(),
      ...Object.values(corporationBlueprints).flat(),
    ];

    const foundBlueprint = blueprintData.find((i) => i.item_id === blueprintID);

    if (!foundBlueprint) {
      return "bpc";
    }

    if (foundBlueprint.quantity === -2) {
      return "bpc";
    }

    return "bp";
  }

  function findAllChildJobCountOrIDs(
    childJobsFromJobObject,
    temporaryChildJobObject,
    parentChildCache
  ) {
    const childJobObjectCombinedIDs = Object.values(
      childJobsFromJobObject
    ).flat();

    const temporaryChildJobObjectIDs = Object.values(
      temporaryChildJobObject
    ).flatMap(({ jobID }) => jobID);

    const { parentCacheIDsToAdd, parentCacheIDsToRemove } = Object.values(
      parentChildCache
    ).reduce(
      (prev, materialObject) => ({
        parentCacheIDsToAdd: [
          ...prev.parentCacheIDsToAdd,
          ...materialObject.add,
        ],
        parentCacheIDsToRemove: [
          ...prev.parentCacheIDsToRemove,
          ...materialObject.remove,
        ],
      }),
      {
        parentCacheIDsToAdd: [],
        parentCacheIDsToRemove: [],
      }
    );

    const finalfilteredArray = [
      ...new Set(
        [
          ...childJobObjectCombinedIDs,
          ...temporaryChildJobObjectIDs,
          ...parentCacheIDsToAdd,
        ].filter((i) => !parentCacheIDsToRemove.includes(i))
      ),
    ];

    return {
      childJobIDs: finalfilteredArray,
      childJobCount: finalfilteredArray.length,
    };
  }

  return {
    calcBrokersFee,
    findAllChildJobCountOrIDs,
    findBlueprintType,
    massBuildMaterials,
    mergeJobsNew,
  };
}
