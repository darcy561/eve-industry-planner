import {
  addChildJob,
  addParentJob,
  applyCommands,
  removeChildJob,
  removeParentJob,
} from "../../../Components/Edit Job/Edit Job Hooks/jobCommands";
import { totalQuantityProduced } from "../../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import useUsersStore from "../../../Zustand/usersStore";
import { workingJobs } from "./workingCopies.js";
import {
  readJobsForAChange,
  releaseEsiLinksOf,
  sendChangeFromRead,
} from "./jobChange.js";
import normaliseParentChildRelationships from "../../Shared/normaliseParentChildRelationships.js";
import { showSnackbarSuccess } from "../../../Events/snackbarEvents";
import {
  confirmMergeDiscards,
  showMergeRefused,
} from "../../../Events/mergeJobsEvents";
import { asIDList } from "../../Helper/ids";

/**
 * @typedef {object} MergeDiscard
 * @property {string} jobID
 * @property {string} name
 * @property {number} purchases
 * @property {number} extraCosts
 * @property {number} inventionEntries
 * @property {number} industryJobs
 * @property {number} marketOrders
 * @property {number} transactions
 */

/**
 * What each job a merge replaces has recorded that the merge discards, for the jobs that hold any.
 *
 * @param {Array<object>} jobs
 * @returns {Array<MergeDiscard>}
 */
export function recordsAMergeDiscards(jobs) {
  const discards = [];
  for (const job of jobs) {
    const discard = {
      jobID: job.jobID,
      name: job.name,
      purchases: Object.values(job.build?.materials ?? {}).reduce(
        (total, material) =>
          total + Object.keys(material?.purchasing ?? {}).length,
        0,
      ),
      extraCosts: Object.keys(job.build?.extrasCosts ?? {}).length,
      inventionEntries: Object.keys(job.build?.inventionEntries ?? {}).length,
      industryJobs: Object.keys(job.esi?.industryJobs ?? {}).length,
      marketOrders: Object.keys(job.esi?.marketOrders ?? {}).length,
      transactions: Object.keys(job.esi?.transactions ?? {}).length,
    };
    const { jobID: _jobID, name: _name, ...counts } = discard;
    if (Object.values(counts).some((count) => count > 0)) {
      discards.push(discard);
    }
  }
  return discards;
}

/**
 * Merges selected jobs that build the same item into one replacement each, sent as one change that
 * lands whole or not at all.
 *
 * @param {string[]|Set<string>|string} inputJobIDs
 * @param {{ buildJob: Function, onMerged?: () => void }} options
 * @returns {Promise<{ mergedCount: number, mergedGroups: number, removedJobIDs: string[] }>}
 */
export default async function mergeJobs(inputJobIDs, options = {}) {
  const { buildJob, onMerged } = options;
  if (typeof buildJob !== "function") {
    throw new Error("mergeJobs requires options.buildJob");
  }

  const {
    findJobInJobArray,
    mergeAndRemoveJobsFromJobArray,
    updateOrAddJobsToJobArray,
    getGroupObject,
    updateModifiedGroups,
  } = useUsersStore.getState().jobData.actions;
  const nothingMerged = { mergedCount: 0, mergedGroups: 0, removedJobIDs: [] };
  const { isLoggedIn } = useUsersStore.getState().account;

  const normalizedInput = asIDList(inputJobIDs);
  const selectedIDs = [...new Set(normalizedInput.filter(Boolean))];

  const mergeAgain = () => mergeJobs(selectedIDs, options);
  let read = [];
  if (isLoggedIn) {
    const fetched = await readJobsForAChange(selectedIDs, "merged");
    if (!fetched) return nothingMerged;
    if (fetched.held.length > 0) {
      showMergeRefused(fetched.held, mergeAgain);
      return nothingMerged;
    }
    read = fetched.read;
  }

  const selectedJobs = selectedIDs
    .map((id) => findJobInJobArray(id))
    .filter(Boolean);
  const touchedGroupIDs = new Set(
    selectedJobs
      .map((j) => j.groupID)
      .filter((id) => Boolean(id && String(id).trim())),
  );

  const jobsByTypeID = new Map();
  for (const job of selectedJobs) {
    if (!jobsByTypeID.has(job.itemID)) {
      jobsByTypeID.set(job.itemID, []);
    }
    jobsByTypeID.get(job.itemID).push(job);
  }

  const mergeGroups = [...jobsByTypeID.values()].filter(
    (jobs) => jobs.length > 1,
  );
  if (mergeGroups.length === 0) {
    showSnackbarSuccess("0 Jobs Merged", 3);
    return nothingMerged;
  }

  const discards = recordsAMergeDiscards(mergeGroups.flat());
  if (discards.length > 0 && !(await confirmMergeDiscards(discards))) {
    return nothingMerged;
  }

  const touchedJobs = new Set();
  const replacementJobs = [];
  const replacementJobsByID = new Map();
  const working = workingJobs(findJobInJobArray);
  const mergeRecords = [];

  for (const group of mergeGroups) {
    const parentJobs = new Set();
    const childJobsByType = new Map();
    let totalItemQuantity = 0;

    for (const job of group) {
      totalItemQuantity += totalQuantityProduced(job);

      for (const parentID of job.parentJobs ?? []) {
        parentJobs.add(parentID);
      }

      for (const material of Object.values(job.build?.materials ?? {})) {
        const typeID = material.typeID;
        if (!childJobsByType.has(typeID)) {
          childJobsByType.set(typeID, new Set());
        }
        for (const childID of job.build?.childJobs?.[typeID] ?? []) {
          childJobsByType.get(typeID).add(childID);
        }
      }
    }

    const newJob = await buildJob({
      itemID: group[0].itemID,
      itemQty: totalItemQuantity,
      groupID: group[0].groupID || "",
      parentJobs: [...parentJobs],
      childJobs: [...childJobsByType.entries()].map(([typeID, childJobs]) => ({
        typeID,
        childJobs: [...childJobs],
      })),
    });

    if (!newJob?.jobID) {
      continue;
    }

    replacementJobs.push(newJob);
    replacementJobsByID.set(newJob.jobID, newJob);
    touchedJobs.add(newJob);
    mergeRecords.push({
      itemID: group[0].itemID,
      oldJobIDs: new Set(group.map((job) => job.jobID)),
      parentJobs: new Set(parentJobs),
      childJobsByType,
      newJob,
    });
  }

  if (replacementJobs.length === 0) {
    showSnackbarSuccess("0 Jobs Merged", 3);
    return nothingMerged;
  }

  const oldJobIDsToRemove = new Set(
    mergeRecords.flatMap((record) => [...record.oldJobIDs]),
  );

  const oldToNew = new Map();
  for (const record of mergeRecords) {
    for (const oldID of record.oldJobIDs) {
      oldToNew.set(oldID, record.newJob.jobID);
    }
  }

  const resolveCurrentJobID = (jobID) => oldToNew.get(jobID) ?? jobID;
  const resolveJobObject = (jobID) =>
    replacementJobsByID.get(resolveCurrentJobID(jobID)) ??
    working.get(resolveCurrentJobID(jobID));

  for (const record of mergeRecords) {
    const oldIDs = [...record.oldJobIDs];
    const replacementJob = record.newJob;

    replacementJob.parentJobs = [
      ...new Set(
        (replacementJob.parentJobs ?? [])
          .map(resolveCurrentJobID)
          .filter((id) => id !== replacementJob.jobID && resolveJobObject(id)),
      ),
    ];

    for (const material of Object.values(
      replacementJob.build?.materials ?? {},
    )) {
      const typeID = material.typeID;
      const translatedChildren = (
        replacementJob.build?.childJobs?.[typeID] ?? []
      )
        .map(resolveCurrentJobID)
        .filter((id) => id !== replacementJob.jobID && resolveJobObject(id));
      replacementJob.build.childJobs[typeID] = [...new Set(translatedChildren)];
    }

    for (const parentID of record.parentJobs) {
      const parentJob = resolveJobObject(parentID);
      if (!parentJob || parentJob.jobID === replacementJob.jobID) continue;
      applyCommands(
        parentJob,
        removeChildJob(record.itemID, oldIDs),
        addChildJob(record.itemID, replacementJob.jobID),
      );
      touchedJobs.add(parentJob);
    }

    for (const childIDs of record.childJobsByType.values()) {
      for (const childID of childIDs) {
        const childJob = resolveJobObject(childID);
        if (!childJob || childJob.jobID === replacementJob.jobID) continue;
        applyCommands(
          childJob,
          removeParentJob(oldIDs),
          addParentJob(replacementJob.jobID),
        );
        touchedJobs.add(childJob);
      }
    }
  }

  normaliseParentChildRelationships([...touchedJobs]);

  const jobsToPersist = [...touchedJobs].filter(
    (job) => !oldJobIDsToRemove.has(job.jobID),
  );

  const replaced = [...oldJobIDsToRemove]
    .map((jobID) => findJobInJobArray(jobID))
    .filter(Boolean);

  if (isLoggedIn) {
    const sent = await sendChangeFromRead({
      read,
      jobs: jobsToPersist,
      removed: replaced,
      created: replacementJobs.map((job) => job.jobID),
    });
    if (!sent.landed) {
      if (sent.moved) showMergeRefused(sent.moved, mergeAgain);
      return nothingMerged;
    }
  }

  mergeAndRemoveJobsFromJobArray(replacementJobs, [...oldJobIDsToRemove]);
  updateOrAddJobsToJobArray(working.all());

  if (touchedGroupIDs.size > 0) {
    const allJobs = useUsersStore.getState().jobData.jobArray;
    for (const gid of touchedGroupIDs) {
      const group = getGroupObject(gid);
      if (!group) continue;
      const groupJobs = allJobs.filter((j) => j.groupID === gid);
      group.updateGroupData(groupJobs);
      updateModifiedGroups(group);
    }
  }

  await releaseEsiLinksOf(replaced, "merged");

  onMerged?.();
  showSnackbarSuccess(`${replacementJobs.length} Jobs Merged Successfully`, 3);
  return {
    mergedCount: replacementJobs.length,
    mergedGroups: mergeRecords.length,
    removedJobIDs: [...oldJobIDsToRemove],
  };
}
