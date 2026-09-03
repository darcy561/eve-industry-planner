import Group from "../../Classes/group";
import { buildJob } from "../JobPlanner/buildJob";
import mergeJobs from "../JobPlanner/mergeJobs";
import normaliseParentChildRelationships from "../Shared/normaliseParentChildRelationships";
import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import useUsersStore from "../../Zustand/usersStore";
import getMissingESIData from "../Shared/getMissingESIData";
import { recalculateInstallCostsWithNewData } from "../Installation Costs/installCosts";

/**
 * Apply a template payload: build jobs (setups-first + optional reconcile), remap graph, persist.
 *
 * @param {object} params
 * @param {Record<string, unknown>} params.payload — `GET …/full` body (`jobs[]` required)
 * @param {"newGroup"|"activeGroup"} params.mode
 * @param {import("@tanstack/react-query").QueryClient} params.queryClient
 * @param {import("../../Classes/group").default|null} [params.activeGroupOverride] — when set with `activeGroup`, add jobs to this group (e.g. current route group).
 * @returns {Promise<{ jobs: import("../../Classes/job").default[], group: import("../../Classes/group").default|null }>}
 */
export async function instantiateGroupTemplate({
  payload,
  mode,
  queryClient,
  activeGroupOverride = null,
}) {
  const jobsPayload = payload?.jobs;
  if (!Array.isArray(jobsPayload) || jobsPayload.length === 0) {
    throw new Error("Template has no jobs.");
  }

  const {
    updateOrAddJobsToJobArray,
    addGroupToGroupArray,
    updateModifiedGroups,
    queueJobGroupWritesAndSchedule,
    getActiveGroupObject,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;

  const templateIdByIndex = jobsPayload.map((n) => n.templateJobId);
  const idSet = new Set(templateIdByIndex);
  if (idSet.size !== templateIdByIndex.length) {
    throw new Error("Invalid template: duplicate templateJobId.");
  }

  /** @type {import("../../Classes/job").default[]} */
  const built = [];
  const templateToJob = new Map();

  for (const node of jobsPayload) {
    const desired = Math.round(Number(node.desiredTotalQuantity) || 0);
    const job = await buildJob(
      {
        itemID: node.itemID,
        itemQty: desired,
        requiredQuantity: desired,
        presetSetups: node.presetSetups,
        parentJobs: [],
        childJobs: [],
        throwError: false,
        skipJobCreateAnalytics: true,
      },
      { queryClient }
    );
    if (!job?.jobID) {
      throw new Error(
        `Could not build job for item ${node.itemID} (${node.name || node.templateJobId}). The blueprint may be unavailable.`
      );
    }
    if (job.totalQuantityProduced() !== desired) {
      throw new Error(
        `Could not match target quantity for "${job.name}" (wanted ${desired}, got ${job.totalQuantityProduced()}).`
      );
    }
    templateToJob.set(node.templateJobId, job);
    built.push(job);
  }

  for (const node of jobsPayload) {
    const job = templateToJob.get(node.templateJobId);
    if (!job) continue;

    job.parentJobs = (node.parentTemplateJobIds || [])
      .map((tid) => templateToJob.get(tid)?.jobID)
      .filter(Boolean);

    const links = node.childLinksByMaterialTypeId || {};
    /** @type {Record<string, string[]>} */
    const childByMat = {};
    for (const m of job.build.materials || []) {
      const k = String(m.typeID);
      const childTids = links[k] ?? links[m.typeID] ?? [];
      childByMat[k] = (childTids || [])
        .map((tid) => templateToJob.get(tid)?.jobID)
        .filter(Boolean);
    }
    job.build.childJobs = childByMat;
  }

  normaliseParentChildRelationships(built);

  let group = null;
  let activeGroupMergeIDs = null;
  if (mode === "newGroup") {
    group = new Group();
    for (const j of built) {
      j.assignToGroup(group.groupID);
    }
    group.createGroup(built);
    addGroupToGroupArray(group);
    queueJobGroupWritesAndSchedule(group.groupID);
  } else if (mode === "activeGroup") {
    const active = activeGroupOverride || getActiveGroupObject();
    if (!active?.groupID) {
      throw new Error(
        'No active group: open a group first, or choose "New group" when applying.'
      );
    }
    for (const j of built) {
      j.assignToGroup(active.groupID);
    }
    active.addJobsToGroup(built);
    updateModifiedGroups(active);
    activeGroupMergeIDs = [...active.includedJobIDs];
  } else {
    throw new Error(`Unknown apply mode: ${mode}`);
  }

  if (mode === "newGroup" && isLoggedIn) {
    await saveJobsViaApi(built);
  }

  updateOrAddJobsToJobArray(built);

  if (mode === "activeGroup" && activeGroupMergeIDs?.length) {
    await mergeJobs(activeGroupMergeIDs, {
      buildJob: (request) => buildJob(request, { queryClient }),
    });
  }

  const { requestedMarketData, requestedSystemIndexes } =
    await getMissingESIData(built);
  recalculateInstallCostsWithNewData(
    built,
    requestedMarketData,
    requestedSystemIndexes
  );
  useUsersStore.getState().worldData.actions.addMarketData(requestedMarketData);
  useUsersStore
    .getState()
    .worldData.actions.addSystemIndex(requestedSystemIndexes);

  return { jobs: built, group };
}
