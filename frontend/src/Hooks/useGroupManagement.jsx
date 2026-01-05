import uploadGroupsToFirebase from "../Functions/Firebase/uploadGroupData";
import uploadJobSnapshotsToFirebase from "../Functions/Firebase/uploadJobSnapshots";
import findOrGetJobObject from "../Functions/Helper/findJobObject";
import manageListenerRequests from "../Functions/Firebase/manageListenerRequests";
import firebaseBatchUpdateJobs from "../Functions/Firebase/batchUpdateJobs";
import useUsersStore from "../Zustand/usersStore";

/**
 * Custom hook that provides comprehensive group management functionality for EVE Online industry planning.
 *
 * This hook handles all aspects of group management:
 * - Creating new groups with job collections
 * - Deleting groups and converting jobs back to individual snapshots
 * - Managing parent-child job relationships within groups
 * - Calculating build costs from child job hierarchies
 * - Firebase integration for group data persistence
 * - Job relationship cleanup and maintenance
 *
 * The group management process:
 * 1. Group creation: Collects jobs, manages relationships, creates group object
 * 2. Group deletion: Converts group jobs back to individual snapshots
 * 3. Relationship management: Maintains parent-child connections
 * 4. Cost calculations: Recursive cost calculation from child jobs
 * 5. Firebase sync: Uploads group data and job updates
 *
 * @returns {Object} Object containing group management functions
 * @returns {Function} returns.calculateCurrentJobBuildCostFromChildren - Calculates build cost from child jobs
 * @returns {Function} returns.deleteGroupWithoutJobs - Deletes group and converts jobs to snapshots
 *
 * @example
 * function GroupManager() {
 *   const { deleteGroupWithoutJobs } = useGroupManagement();
 *
 *   const handleDeleteGroup = async (groupID) => {
 *     await deleteGroupWithoutJobs(groupID);
 *     console.log("Group deleted");
 *   };
 *
 *   return <div>Group management interface</div>;
 * }
 */
export function useGroupManagement() {
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const {
    getGroupObject,
    removeGroupFromGroupArray,
    findJobInJobArray,
    addRetrievedJobsToJobArray,
    setActiveGroupID,
    addOrUpdateJobSnapshotsFromJobs,
  } = useUsersStore.getState().jobData.actions;

  const deleteGroupWithoutJobs = async (inputGroupID) => {
    const retrievedJobs = [];
    const batchJobs = [];

    const chosenGroup = getGroupObject(inputGroupID);

    for (let jobID of [...chosenGroup.includedJobIDs]) {
      let foundJob = await findOrGetJobObject(jobID, retrievedJobs);
      if (!foundJob) {
        continue;
      }
      foundJob.groupID = null;
      batchJobs.push(foundJob);
    }

    if (activeGroupID === inputGroupID) {
      setActiveGroupID(null);
    }

    removeGroupFromGroupArray(inputGroupID);
    manageListenerRequests(retrievedJobs);
    addOrUpdateJobSnapshotsFromJobs(batchJobs);
    addRetrievedJobsToJobArray(retrievedJobs);

    if (isLoggedIn) {
      await Promise.all([
        uploadJobSnapshotsToFirebase(),
        uploadGroupsToFirebase(),
        firebaseBatchUpdateJobs(batchJobs),
      ]);
    }
  };

  const calculateCurrentJobBuildCostFromChildren = (outputJob) => {
    let finalBuildCost = 0;

    finalBuildCost += outputJob.build.costs.installCosts;
    finalBuildCost += outputJob.build.costs.extrasTotal;
    for (let material of outputJob.build.materials) {
      const childJobs = outputJob.build.childJobs[material.typeID];
      finalBuildCost += findItemBuildCost(material, childJobs);
    }

    function findItemBuildCost(material, inputChildJobs) {
      if (material.purchaseComplete || inputChildJobs.length === 0) {
        return material.purchasedCost;
      }

      let returnTotal = 0;
      let totalProduced = 0;

      for (let childJobID of inputChildJobs) {
        let childJob = findJobInJobArray(childJobID);

        if (!childJob) {
          continue;
        }
        returnTotal += childJob.build.costs.installCosts;
        returnTotal += childJob.build.costs.extrasTotal;
        totalProduced += childJob.build.products.totalQuantity;
        for (let cMaterial of childJob.build.materials) {
          const childJobs = childJob.build.childJobs[cMaterial.typeID];
          returnTotal += findItemBuildCost(cMaterial, childJobs);
        }
      }
      return (returnTotal / totalProduced) * material.quantity;
    }
    return finalBuildCost / outputJob.build.products.totalQuantity;
  };

  return {
    calculateCurrentJobBuildCostFromChildren,
    deleteGroupWithoutJobs,
  };
}
