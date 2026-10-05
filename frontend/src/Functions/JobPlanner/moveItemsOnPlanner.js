import {
  applyCommands,
  stepBackward,
  stepForward,
} from "../../Components/Edit Job/Edit Job Hooks/jobCommands";
import { workingGroups, workingJobs } from "../Job/changes/workingCopies.js";
import { scheduleSaveJobsViaApi } from "../Job/sync/saveJobsViaApi.js";
import useUsersStore from "../../Zustand/usersStore";
import { asIDList, isGroupID, isJobID } from "../Helper/ids";
import {
  canMoveJobBackward,
  canMoveJobForward,
} from "../Job/editing/jobStepNavigation";

/**
 * Moves jobs or groups a stage forward or backward, committing copies and queuing
 * their writes.
 *
 * @param {string|Array<string>|Set<string>} inputIDs - Job ID(s) and/or group ID(s) to move
 * @param {string} direction - Direction to move ("forward" or "backward")
 * @returns {Promise<void>} Promise that resolves when movement is complete
 */
export default async function moveItemsOnPlanner(inputIDs, direction) {
  const {
    findJobInJobArray,
    getGroupObject,
    updateOrAddJobsToJobArray,
    updateModifiedGroups,
    queueJobGroupWritesAndSchedule,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;

  const normalizedIDs = asIDList(inputIDs);
  const selectedIDs = [...new Set(normalizedIDs.filter(Boolean))];
  if (!direction || selectedIDs.length === 0) return;

  const working = workingJobs(findJobInJobArray);
  const groups = workingGroups(getGroupObject);
  const modifiedJobIDs = new Set();
  const modifiedGroupIDs = new Set();
  const getWorkingJob = working.get;
  const getWorkingGroup = groups.get;

  for (const inputID of selectedIDs) {
    if (isGroupID(inputID)) {
      const selectedGroup = getWorkingGroup(inputID);
      if (!selectedGroup) continue;
      if (direction === "forward") {
        selectedGroup.moveGroupStatusForward();
      } else if (direction === "backward") {
        selectedGroup.moveGroupStatusBackward();
      }
      modifiedGroupIDs.add(selectedGroup.groupID);
    } else if (isJobID(inputID)) {
      if (direction === "forward") {
        moveForward(inputID);
      } else if (direction === "backward") {
        moveBackward(inputID);
      }
    }
  }

  const modifiedJobs = [...modifiedJobIDs]
    .map((jobID) => working.taken(jobID))
    .filter(Boolean);
  const groupedJobGroupIDs = [
    ...new Set(
      modifiedJobs
        .filter((job) => job.includedInGroup && job.groupID)
        .map((job) => job.groupID),
    ),
  ];
  const groupsToPersistMap = new Map();
  for (const groupID of [...modifiedGroupIDs, ...groupedJobGroupIDs]) {
    const group = getWorkingGroup(groupID);
    if (group) {
      groupsToPersistMap.set(group.groupID, group);
    }
  }
  const groupsToPersist = [...groupsToPersistMap.values()];

  if (modifiedJobs.length > 0) {
    updateOrAddJobsToJobArray(modifiedJobs);
  }
  if (groupsToPersist.length > 0) {
    updateModifiedGroups(groupsToPersist);
  }
  if (isLoggedIn && modifiedJobs.length > 0) {
    scheduleSaveJobsViaApi(modifiedJobs);
    if (groupedJobGroupIDs.length > 0) {
      queueJobGroupWritesAndSchedule(groupedJobGroupIDs);
    }
  }

  /**
   * Moves a job forward in the workflow if possible.
   *
   * @param {string} inputJobID - Job ID to move forward
   * @returns {void}
   *
   * @private
   */
  function moveForward(inputJobID) {
    const inputJob = getWorkingJob(inputJobID);
    if (!inputJob) return;

    if (!canMoveForward(inputJob)) return;

    applyCommands(inputJob, stepForward());
    collectModifiedJob(inputJob);
  }

  /**
   * Moves a job backward in the workflow if possible.
   *
   * @param {string} inputJobID - Job ID to move backward
   * @returns {void}
   *
   * @private
   */
  function moveBackward(inputJobID) {
    const inputJob = getWorkingJob(inputJobID);
    if (!inputJob) return;

    if (!canMoveBackward(inputJob)) return;

    applyCommands(inputJob, stepBackward());
    collectModifiedJob(inputJob);
  }

  /**
   * Checks if a job can be moved forward in the workflow.
   *
   * @param {Object} job - Job object to check
   * @returns {boolean} True if job can move forward, false otherwise
   *
   * @private
   */
  function canMoveForward(job) {
    return canMoveJobForward(job, {
      lastStepIndex: 4,
      lockFinalStep: true,
    });
  }

  /**
   * Checks if a job can be moved backward in the workflow.
   *
   * @param {Object} job - Job object to check
   * @returns {boolean} True if job can move backward, false otherwise
   *
   * @private
   */
  function canMoveBackward(job) {
    return canMoveJobBackward(job);
  }

  /**
   * Marks job as modified for persist.
   *
   * @param {Object} inputJob - Job object to update
   * @returns {void}
   *
   * @private
   */
  function collectModifiedJob(inputJob) {
    modifiedJobIDs.add(inputJob.jobID);
  }
}
