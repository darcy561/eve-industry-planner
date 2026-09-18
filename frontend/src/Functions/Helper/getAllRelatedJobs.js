import useUsersStore from "../../Zustand/usersStore";

/**
 * Recursively collects all jobs related to the input job IDs through parent-child links.
 * Stack-based traversal of the dependency tree (store lookups only).
 *
 * @param {string|Array<string>|Set<string>} inputJobIDs - Root job ID(s)
 * @returns {Array<Object>} Related job objects from `jobArray`
 *
 * @throws {Error} Throws if inputJobIDs is missing or invalid type
 */

function getAllRelatedJobs(inputJobIDs) {
  try {
    if (!inputJobIDs) {
      throw new Error("missing input");
    }
    let stack;
    const jobIDMap = {};

    if (typeof inputJobIDs === "string") {
      stack = [inputJobIDs];
    } else if (Array.isArray(inputJobIDs)) {
      stack = inputJobIDs;
    } else if (inputJobIDs instanceof Set) {
      stack = Array.from(inputJobIDs);
    } else {
      throw new Error(
        "Invalid inputItem type. Expected a string, array, or set.",
      );
    }

    while (stack.length > 0) {
      const jobID = stack.pop();
      if (jobIDMap[jobID]) continue;

      const matchedJob = useUsersStore
        .getState()
        .jobData.actions.findJobInJobArray(jobID);
      if (!matchedJob) continue;

      jobIDMap[jobID] = matchedJob;

      const relatedJobs = matchedJob.relatedJobIDs;

      if (relatedJobs && Array.isArray(relatedJobs)) {
        stack.push(...relatedJobs);
      }
    }

    return Object.values(jobIDMap);
  } catch (err) {
    console.error(err);
    return [];
  }
}

/**
 * The same walk, fetching the jobs the store does not hold yet.
 *
 * `getAllRelatedJobs` answers from `jobArray` alone, which is enough for a
 * caller asking which jobs are affected by something. A caller about to price a
 * chain needs the jobs themselves: what a job costs to install is worked out
 * from its system's index and its materials' adjusted prices, and a job nothing
 * has been fetched for contributes nothing at all rather than an approximation.
 *
 * @param {string|Array<string>|Set<string>} inputJobIDs - Root job ID(s)
 * @returns {Promise<Array<Object>>} Every job reachable from the roots
 */
export async function loadAllRelatedJobs(inputJobIDs) {
  const { jobsFromIdsOrObjects } = useUsersStore.getState().jobData.actions;

  const found = new Map();
  const asked = new Set();
  let frontier = asJobIDList(inputJobIDs);

  while (frontier.length > 0) {
    const wanted = [
      // Deduped within the batch as well as against earlier ones: a job two
      // materials both build is named twice by the same descent.
      ...new Set(frontier.filter((jobID) => jobID && !asked.has(jobID))),
    ];
    if (wanted.length === 0) break;
    // Asked rather than found: an id nothing answers for must not come back
    // round on the next descent, or a chain naming a missing job never ends.
    for (const jobID of wanted) asked.add(jobID);

    const jobs = (await jobsFromIdsOrObjects(wanted)) ?? [];
    frontier = [];
    for (const job of jobs) {
      if (!job?.jobID || found.has(job.jobID)) continue;
      found.set(job.jobID, job);
      frontier.push(...(job.relatedJobIDs ?? []));
    }
  }

  return [...found.values()];
}

/**
 * @param {string|Array<string>|Set<string>} inputJobIDs
 * @returns {Array<string>}
 */
function asJobIDList(inputJobIDs) {
  if (typeof inputJobIDs === "string") return [inputJobIDs];
  if (Array.isArray(inputJobIDs)) return [...inputJobIDs];
  if (inputJobIDs instanceof Set) return [...inputJobIDs];
  return [];
}

export default getAllRelatedJobs;
