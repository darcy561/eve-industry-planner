import useUsersStore from "../../../../../../../Zustand/usersStore";

/**
 * The jobs building one material: what it is linked to once the reader's marks
 * are folded in, plus the job built for it but not yet saved.
 *
 * Takes the ids rather than the session they come from, so a caller reading them
 * narrowly out of the store asks the same question as one holding the whole of
 * it.
 *
 * @param {object} params
 * @param {Array<string>} [params.childJobIDs] - The links after the reader's marks
 * @param {object} [params.temporaryChildJob] - The child job built but not saved
 * @param {Array<object>} [params.jobArray] - The planner's jobs, read from the
 *   store where none is given
 * @returns {{childJobsById: Map<string, object>, childJobIDs: Array<string>,
 *   hasChildJobs: boolean}}
 */
export function resolveMaterialChildJobs({
  childJobIDs: currentChildJobIDs = [],
  temporaryChildJob = null,
  jobArray,
}) {
  const sourceJobs = Array.isArray(jobArray)
    ? jobArray
    : useUsersStore.getState().jobData.jobArray || [];

  const childJobsById = new Map();
  currentChildJobIDs.forEach((jobID) => {
    const match = sourceJobs.find((job) => job.jobID === jobID);
    if (match) {
      childJobsById.set(match.jobID, match);
    }
  });

  if (temporaryChildJob) {
    childJobsById.set(temporaryChildJob.jobID, temporaryChildJob);
  }

  const childJobIDs = [
    ...new Set([
      ...currentChildJobIDs,
      ...(temporaryChildJob ? [temporaryChildJob.jobID] : []),
    ]),
  ];

  return {
    childJobsById,
    childJobIDs,
    hasChildJobs: childJobIDs.length > 0,
  };
}

/**
 * How a material's row stands: what it is already linked to, what has been
 * built for it, and what the reader has asked for.
 *
 * Takes the four answers rather than the session they come from, so a caller
 * that reads them narrowly out of the store and one that still holds the whole
 * state ask the same question.
 *
 * @param {object} args
 * @param {boolean} args.inGroup - Whether the job being edited is in a group
 * @param {Array<string>} [args.childJobsLocation] - What the job holds for it
 * @param {object} [args.temporaryChildJob] - A child job built but not saved
 * @param {{add?: Array<string>}} [args.markedChildJobs] - Links the reader marked
 * @param {boolean} [args.isExistingJobInGroup]
 */
export function resolveMaterialChildJobStatus({
  inGroup = false,
  childJobsLocation = [],
  temporaryChildJob = null,
  markedChildJobs,
  isExistingJobInGroup = false,
}) {
  const hasLinked =
    Array.isArray(childJobsLocation) && childJobsLocation.length > 0;
  const tempJob = temporaryChildJob || null;
  const hasTemp = Boolean(tempJob);
  const hasPendingAdd = (markedChildJobs?.add?.length || 0) > 0;
  const hasGroupMatch = Boolean(isExistingJobInGroup);

  return {
    inGroup: Boolean(inGroup),
    hasLinked,
    hasTemp,
    hasPendingAdd,
    hasGroupMatch,
    tempJob,
  };
}
