import uploadGroupsToFirebase from "../Firebase/uploadGroupData";
import uploadJobSnapshotsToFirebase from "../Firebase/uploadJobSnapshots";
import findOrGetJobObject from "../Helper/findJobObject";
import manageListenerRequests from "../Firebase/manageListenerRequests";
import firebaseBatchUpdateJobs from "../Firebase/batchUpdateJobs";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Moves job snapshots or groups forward or backward in the planner workflow.
 * Handles both individual jobs and groups, updating their status and saving changes.
 *
 * @param {Array<string>} inputSnapIDs - Array of snapshot IDs to move
 * @param {string} direction - Direction to move ("forward" or "backward")
 * @returns {Promise<void>} Promise that resolves when movement is complete
 *
 * @example
 * await moveItemsOnPlanner(["job_123", "group_456"], "forward");
 */
export default async function moveItemsOnPlanner(inputSnapIDs, direction) {
  const {
    getGroupObject,
    updateJobSnapshotsFromJobs,
    addRetrievedJobsToJobArray,
    updateModifiedGroups,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore.getState().users.isLoggedIn;

  const retrievedJobs = [];
  let groupsModified = false;
  let jobsModified = false;
  const modifiedJobs = [];
  const modifiedGroups = [];

  if (!direction) return;

  for (let inputSnapID of inputSnapIDs) {
    if (inputSnapID.includes("group")) {
      const selectedGroup = getGroupObject(inputSnapID);
      if (direction === "forward") {
        selectedGroup.moveGroupStatusForward();
      } else if (direction === "backward") {
        selectedGroup.moveGroupStatusBackward();
      }
      modifiedGroups.push(selectedGroup);
      groupsModified = true;
    } else {
      if (direction === "forward") {
        await moveForward(inputSnapID);
      } else if (direction === "backward") {
        await moveBackward(inputSnapID);
      }
    }
  }

  if (jobsModified) {
    manageListenerRequests(retrievedJobs);
    updateJobSnapshotsFromJobs(modifiedJobs);
    addRetrievedJobsToJobArray(retrievedJobs);
  }
  if (groupsModified) {
    updateModifiedGroups(modifiedGroups);
  }
  if (isLoggedIn) {
    const promises = [];
    if (jobsModified) {
      promises.push(firebaseBatchUpdateJobs(modifiedJobs));
      promises.push(uploadJobSnapshotsToFirebase());
    }
    if (groupsModified) {
      promises.push(uploadGroupsToFirebase());
    }
    await Promise.all(promises);
  }

  /**
   * Moves a job forward in the workflow if possible.
   *
   * @param {string} inputJobID - Job ID to move forward
   * @returns {Promise<void>} Promise that resolves when movement is complete
   *
   * @private
   */
  async function moveForward(inputJobID) {
    let inputJob = await findOrGetJobObject(inputJobID, retrievedJobs);
    if (!inputJob) return;

    if (!canMoveForward(inputJob)) return;

    inputJob.stepForward();
    updateJobSnapshot(inputJob);
  }

  /**
   * Moves a job backward in the workflow if possible.
   *
   * @param {string} inputJobID - Job ID to move backward
   * @returns {Promise<void>} Promise that resolves when movement is complete
   *
   * @private
   */
  async function moveBackward(inputJobID) {
    let inputJob = await findOrGetJobObject(inputJobID, retrievedJobs);
    if (!inputJob) return;

    if (!canMoveBackward(inputJob)) return;

    inputJob.stepBackward();
    updateJobSnapshot(inputJob);
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
    if (job.jobStatus >= 4) return false;
    if (job.groupID !== null && job.jobStatus >= 3) return false;
    return true;
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
    if (job.jobStatus === 0) return false;
    return true;
  }

  /**
   * Updates job snapshot and marks job as modified.
   *
   * @param {Object} inputJob - Job object to update
   * @returns {void}
   *
   * @private
   */
  function updateJobSnapshot(inputJob) {
    jobsModified = true;
    modifiedJobs.push(inputJob);
  }
}
