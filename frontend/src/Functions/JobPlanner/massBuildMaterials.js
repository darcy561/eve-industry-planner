import Job from "../../Classes/job";
import useUsersStore from "../../Zustand/usersStore";
import separateGroupAndJobIDs from "../Helper/separateGroupAndJobIDs";
import checkJobTypeIsBuildable from "../Helper/checkJobTypeIsBuildable";
import { getAvailableBlueprintsByMaterialID } from "../Helper/getAvailableBlueprints";
import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import getMissingESIData from "../Shared/getMissingESIData";
import { recalculateInstallCostsWithNewData } from "../Installation Costs/installCosts";
import {
  showMassBuildFeedback,
  hideMassBuildFeedback,
} from "../../Events/massBuildEvents";
import { showSnackbarError, showSnackbarSuccess } from "../../Events/snackbarEvents";

/**
 * Mass-builds one material level for selected jobs (planner scoped).
 *
 * Only the jobs passed in are considered — a group is not expanded to its members.
 *
 * @param {string|Array<string>|Set<string>} inputJobIDs
 * @param {{
 *   buildJob: Function,
 *   queryClient: import("@tanstack/react-query").QueryClient,
 *   setNumberOfVisibleSkeletonElements?: (count: number) => void,
 * }} options
 */
export default async function massBuildMaterials(inputJobIDs, options) {
  const { buildJob, queryClient, setNumberOfVisibleSkeletonElements } = options ?? {};
  if (typeof buildJob !== "function") {
    throw new Error("massBuildMaterials requires options.buildJob");
  }
  const ignoreItemsWithoutBlueprints =
    useUsersStore.getState().applicationSettings.enableSkipMissingBlueprints;
  const checkTypeIDisExempt =
    useUsersStore.getState().applicationSettings.actions.checkTypeIDisExempt;

  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const { jobsFromIdsOrObjects, updateOrAddJobsToJobArray, findJobInJobArray } =
    useUsersStore.getState().jobData.actions;

  const { jobIDs } = separateGroupAndJobIDs(inputJobIDs);
  const selectedJobs = await jobsFromIdsOrObjects(jobIDs);

  const availableBlueprints = ignoreItemsWithoutBlueprints
    ? await getAvailableBlueprintsByMaterialID(queryClient)
    : new Set();

  const buildRequestsByTypeID = new Map();
  const materialsIgnored = new Set();

  for (const inputJob of selectedJobs) {
    for (const material of inputJob.build?.materials ?? []) {
      if ((inputJob.build?.childJobs?.[material.typeID] ?? []).length > 0) continue;
      if (!checkJobTypeIsBuildable(material.jobType)) continue;
      if (checkTypeIDisExempt(material.typeID)) {
        materialsIgnored.add(material.typeID);
        continue;
      }
      if (
        ignoreItemsWithoutBlueprints &&
        !availableBlueprints.has(material.typeID)
      ) {
        materialsIgnored.add(material.typeID);
        continue;
      }

      if (!buildRequestsByTypeID.has(material.typeID)) {
        buildRequestsByTypeID.set(material.typeID, {
          itemID: material.typeID,
          itemQty: 0,
          parentJobIDs: new Set(),
        });
      }
      const entry = buildRequestsByTypeID.get(material.typeID);
      entry.itemQty += material.quantity;
      entry.parentJobIDs.add(inputJob.jobID);
    }
  }

  const finalBuildRequests = [...buildRequestsByTypeID.values()].map((entry) => ({
    itemID: entry.itemID,
    itemQty: entry.itemQty,
    parentJobs: [...entry.parentJobIDs],
  }));

  if (typeof setNumberOfVisibleSkeletonElements === "function") {
    setNumberOfVisibleSkeletonElements(finalBuildRequests.length);
  }
  if (finalBuildRequests.length === 0) {
    return;
  }
  showMassBuildFeedback(0, finalBuildRequests.length, finalBuildRequests.length);

  try {
    const rawNewJobs = await buildJob(finalBuildRequests);
    const newJobs = Array.isArray(rawNewJobs)
      ? rawNewJobs
      : rawNewJobs
        ? [rawNewJobs]
        : [];

    const newJobsByTypeID = new Map(newJobs.map((job) => [job.itemID, job]));
    for (let i = 0; i < newJobs.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      showMassBuildFeedback(i + 1, finalBuildRequests.length, finalBuildRequests.length);
    }

    const workingParentsByID = new Map();
    const getWorkingParent = (jobID) => {
      if (workingParentsByID.has(jobID)) return workingParentsByID.get(jobID);
      const source = findJobInJobArray(jobID);
      if (!source) return null;
      const cloned = new Job(source.toDocument());
      workingParentsByID.set(jobID, cloned);
      return cloned;
    };

    for (const request of finalBuildRequests) {
      const builtJob = newJobsByTypeID.get(request.itemID);
      if (!builtJob) continue;
      for (const parentJobID of request.parentJobs) {
        const parentJob = getWorkingParent(parentJobID);
        if (!parentJob) continue;
        parentJob.addChildJob(request.itemID, builtJob.jobID);
      }
    }

    const updatedParents = [...workingParentsByID.values()];
    const jobsToCommit = [...newJobs, ...updatedParents];

    if (isLoggedIn && jobsToCommit.length > 0) {
      await saveJobsViaApi(jobsToCommit);
    }

    // Clear planner skeleton placeholders before injecting new cards into stage 0.
    if (typeof setNumberOfVisibleSkeletonElements === "function") {
      setNumberOfVisibleSkeletonElements(0);
    }
    if (jobsToCommit.length > 0) {
      updateOrAddJobsToJobArray(jobsToCommit);
    }

    const { requestedMarketData, requestedSystemIndexes } =
      await getMissingESIData(newJobs);
    recalculateInstallCostsWithNewData(
      newJobs,
      requestedMarketData,
      requestedSystemIndexes
    );
    useUsersStore.getState().worldData.actions.addMarketData(requestedMarketData);
    useUsersStore
      .getState()
      .worldData.actions.addSystemIndex(requestedSystemIndexes);

    const jobWord = newJobs.length === 1 ? "Job" : "Jobs";
    const materialWord = materialsIgnored.size === 1 ? "Material" : "Materials";
    showSnackbarSuccess(
      `${newJobs.length} ${jobWord} Added, ${materialsIgnored.size} ${materialWord} Ignored.`,
      3
    );
  } catch (err) {
    console.error("massBuildMaterials failed", err);
    showSnackbarError("Unable to add ingredient jobs.", 5);
    throw err;
  } finally {
    if (typeof setNumberOfVisibleSkeletonElements === "function") {
      setNumberOfVisibleSkeletonElements(0);
    }
    hideMassBuildFeedback();
  }
}
