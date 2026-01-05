import { trace } from "firebase/performance";
import { analytics, performance } from "../../firebase";
import { useJobBuild } from "../useJobBuild";
import { logEvent } from "firebase/analytics";
import Group from "../../Classes/groupsConstructor";
import JobSnapshot from "../../Classes/jobSnapshotConstructor";
import uploadGroupsToFirebase from "../../Functions/Firebase/uploadGroupData";
import uploadJobSnapshotsToFirebase from "../../Functions/Firebase/uploadJobSnapshots";
import manageListenerRequests from "../../Functions/Firebase/manageListenerRequests";
import getMissingESIData from "../../Functions/Shared/getMissingESIData";
import recalculateInstallCostsWithNewData from "../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import firebaseBatchUpdateJobs from "../../Functions/Firebase/batchUpdateJobs";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Custom hook that provides functionality to build and add new jobs to the EVE Online industry planner.
 *
 * This hook handles the complete job creation process:
 * - Building new job objects from build requests
 * - Managing group creation and job assignment
 * - Creating job snapshots for individual jobs
 * - Updating Firebase with new job data
 * - Fetching missing ESI data (market data, system indexes)
 * - Recalculating install costs with new data
 * - Managing Firebase listeners for real-time updates
 * - Logging analytics events for tracking
 *
 * The job building process:
 * 1. Creates job objects from build requests
 * 2. Handles group creation if requested
 * 3. Assigns jobs to groups or creates snapshots
 * 4. Saves data to Firebase (if logged in)
 * 5. Fetches missing ESI data
 * 6. Recalculates costs with new data
 * 7. Updates local state and listeners
 *
 * @returns {Object} Object containing job building functions
 * @returns {Function} returns.addNewJobsToPlanner - Adds new jobs to the planner
 *
 * @example
 * function JobBuilder() {
 *   const { addNewJobsToPlanner } = useBuildNewJobs();
 *
 *   const handleBuildJobs = async (buildRequests) => {
 *     const result = await addNewJobsToPlanner(buildRequests);
 *     if (result) {
 *       console.log("Job built with parent jobs:", result.parentJob.length);
 *     }
 *   };
 *
 *   return <button onClick={() => handleBuildJobs(requests)}>Build Jobs</button>;
 * }
 */
function useBuildNewJobs() {
  const { groupArray, userJobSnapshot } = useUsersStore(
    (state) => state.jobData
  );
  const {
    replaceGroupArray,
    replaceUserJobSnapshotArray,
    updateOrAddJobsToJobArray,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const { buildJob } = useJobBuild();
  const parentUser = useUsersStore.getState().users.actions.findParentUser();

  /**
   * Adds new jobs to the planner with comprehensive data management.
   *
   * @param {Array<Object>} buildRequests - Array of job build request objects
   * @returns {Promise<Object|undefined>} Promise that resolves to the first job if single job with parents, undefined otherwise
   *
   * @private
   */
  async function addNewJobsToPlanner(buildRequests) {
    const firestoreTrace = trace(performance, "CreateJobProcessFull");
    let newUserJobSnapshot = [...userJobSnapshot];
    let newGroupArray = [...groupArray];
    let singleJobBuildFlag = false;
    let requiresGroupDocSave = false;
    const addNewGroup = buildRequests.some((i) => i.addNewGroup);
    let newGroup = null;

    firestoreTrace.start();
    let newJobObjects = await buildJob(buildRequests);
    if (!newJobObjects) return;

    if (!Array.isArray(newJobObjects)) {
      newJobObjects = [newJobObjects];
      singleJobBuildFlag = true;
    }

    if (addNewGroup) {
      newGroup = new Group();
      newGroup.createGroup(newJobObjects);
      newGroupArray.push(newGroup);
      requiresGroupDocSave = true;
    }

    for (let jobObject of newJobObjects) {
      if (!jobObject.groupID && !addNewGroup) {
        newUserJobSnapshot.push(new JobSnapshot(jobObject));
      }

      if (jobObject.groupID && !addNewGroup) {
        const matchedGroup = newGroupArray.find(
          (i) => i.groupID === jobObject.groupID
        );
        if (matchedGroup) {
          matchedGroup.addJobsToGroup(jobObject);
          requiresGroupDocSave = true;
        }
      }

      if (addNewGroup) {
        jobObject.groupID = newGroup.groupID;
        requiresGroupDocSave = true;
      }

      logEvent(analytics, "New Job", {
        loggedIn: isLoggedIn,
        UID: parentUser.accountID,
        name: jobObject.name,
        itemID: jobObject.itemID,
      });
    }

    if (isLoggedIn) {
      await firebaseBatchUpdateJobs(newJobObjects);
      await uploadJobSnapshotsToFirebase(newUserJobSnapshot);
    }

    updateOrAddJobsToJobArray(newJobObjects);
    manageListenerRequests(newJobObjects);

    const { requestedMarketData, requestedSystemIndexes } =
      await getMissingESIData(newJobObjects);

    recalculateInstallCostsWithNewData(
      newJobObjects,
      requestedMarketData,
      requestedSystemIndexes
    );

    if (requiresGroupDocSave) {
      replaceGroupArray(newGroupArray);
      if (isLoggedIn) {
        await uploadGroupsToFirebase();
      }
    }
    replaceUserJobSnapshotArray(newUserJobSnapshot);

    useUsersStore
      .getState()
      .worldData.actions.addMarketData(requestedMarketData);
    useUsersStore
      .getState()
      .worldData.actions.addSystemIndex(requestedSystemIndexes);

    showSnackbarSuccess(
      singleJobBuildFlag
        ? `${newJobObjects[0].name} Added`
        : `${newJobObjects.length} Jobs Added.`,
      3
    );
    firestoreTrace.stop();
    if (singleJobBuildFlag && newJobObjects[0].parentJob.length > 0) {
      return newJobObjects[0];
    }
  }
  return {
    addNewJobsToPlanner,
  };
}

export default useBuildNewJobs;
