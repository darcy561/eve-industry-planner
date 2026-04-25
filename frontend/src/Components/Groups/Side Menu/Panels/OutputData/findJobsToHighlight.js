import useUsersStore from "../../../../../Zustand/usersStore";

/**
 * BFS from `startingJob` through `build.childJobs` links, returning all reachable job IDs
 * that exist in `jobData.jobArray` (or the start job itself).
 *
 * @param {import("../../../../../Classes/job").default} startingJob
 * @returns {Set<string>}
 */
function findJobsToHighlight(startingJob) {
  if (!startingJob?.jobID) {
    return new Set();
  }

  const list = useUsersStore.getState().jobData.jobArray || [];
  const byId = new Map();
  for (const j of list) {
    if (j?.jobID != null) {
      byId.set(j.jobID, j);
    }
  }

  const queue = [startingJob];
  const result = new Set();
  let head = 0;

  while (head < queue.length) {
    const currentJob = queue[head++];

    if (result.has(currentJob.jobID)) {
      continue;
    }
    result.add(currentJob.jobID);

    const idLists = Object.values(currentJob.build?.childJobs ?? {});
    for (let i = 0; i < idLists.length; i++) {
      const ids = idLists[i];
      if (!Array.isArray(ids)) continue;
      for (let j = 0; j < ids.length; j++) {
        const id = ids[j];
        if (id == null) continue;
        const childJob = byId.get(id);
        if (childJob && !result.has(childJob.jobID)) {
          queue.push(childJob);
        }
      }
    }
  }

  return result;
}

export default findJobsToHighlight;
