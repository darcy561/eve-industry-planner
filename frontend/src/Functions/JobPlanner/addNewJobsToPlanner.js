import Group from "../../Classes/group";
import getMissingESIData from "../Shared/getMissingESIData";
import recalculateInstallCostsWithNewData from "../Installation Costs/recalculateInstallCostsWithNewData";
import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import { buildJob } from "./buildJob";

/**
 * Build and add new jobs to planner state.
 *
 * @param {Array<Object>} buildRequests
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{ onBeforeCommit?: Function }} [options]
 * @returns {Promise<Object|undefined>}
 */
export default async function addNewJobsToPlanner(
  buildRequests,
  queryClient,
  options = {}
) {
  const { onBeforeCommit } = options;
  const {
    addGroupToGroupArray,
    updateModifiedGroups,
    queueJobGroupWritesAndSchedule,
    updateOrAddJobsToJobArray,
  } = useUsersStore.getState().jobData.actions;
  const { groupArray } = useUsersStore.getState().jobData;
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;

  let isSingleJobBuild = false;
  const shouldCreateNewGroup = buildRequests.some((i) => i.addNewGroup);
  let createdGroup = null;
  const modifiedGroupsByID = new Map();
  let createdJobs = await buildJob(buildRequests, { queryClient });
  if (!createdJobs) return;

  if (!Array.isArray(createdJobs)) {
    createdJobs = [createdJobs];
    isSingleJobBuild = true;
  }

  if (shouldCreateNewGroup) {
    createdGroup = new Group();
    createdGroup.createGroup(createdJobs);
    trackAppEvent(AppEvent.NEW_JOB_GROUP);
  }

  for (const jobObject of createdJobs) {
    if (jobObject.groupID && !shouldCreateNewGroup) {
      const matchedGroup = groupArray.find((i) => i.groupID === jobObject.groupID);
      if (matchedGroup) {
        matchedGroup.addJobsToGroup(jobObject);
        modifiedGroupsByID.set(matchedGroup.groupID, matchedGroup);
      }
    }

    if (shouldCreateNewGroup) {
      jobObject.assignToGroup(createdGroup.groupID);
    }
  }

  if (isLoggedIn) {
    await saveJobsViaApi(createdJobs);
  }

  if (typeof onBeforeCommit === "function") {
    onBeforeCommit();
  }
  updateOrAddJobsToJobArray(createdJobs);

  const { requestedMarketData, requestedSystemIndexes } = await getMissingESIData(
    createdJobs
  );

  recalculateInstallCostsWithNewData(
    createdJobs,
    requestedMarketData,
    requestedSystemIndexes
  );

  if (createdGroup) {
    addGroupToGroupArray(createdGroup);
    queueJobGroupWritesAndSchedule(createdGroup.groupID);
  }
  if (modifiedGroupsByID.size > 0) {
    updateModifiedGroups([...modifiedGroupsByID.values()]);
  }

  useUsersStore.getState().worldData.actions.addMarketData(requestedMarketData);
  useUsersStore.getState().worldData.actions.addSystemIndex(requestedSystemIndexes);

  showSnackbarSuccess(
    isSingleJobBuild ? `${createdJobs[0].name} Added` : `${createdJobs.length} Jobs Added.`,
    3
  );
  if (isSingleJobBuild && createdJobs[0].parentJobs.length > 0) {
    return createdJobs[0];
  }
}
