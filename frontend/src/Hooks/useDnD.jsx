import { ItemTypes } from "../Context/DnDTypes";
import uploadGroupsToFirebase from "../Functions/Firebase/uploadGroupData";
import updateJobInFirebase from "../Functions/Firebase/updateJob";
import findOrGetJobObject from "../Functions/Helper/findJobObject";
import manageListenerRequests from "../Functions/Firebase/manageListenerRequests";
import useUsersStore from "../Zustand/usersStore";

/**
 * Custom hook that provides drag and drop functionality for job and group cards.
 *
 * This hook:
 * - Handles dropping job cards and group cards between different status stages
 * - Updates job status and group status when items are moved
 * - Syncs changes with Firebase when user is logged in
 * - Manages Firebase listeners for real-time updates
 * - Provides validation for drop operations
 *
 * @returns {Object} Object containing drag and drop functions
 * @returns {Function} returns.recieveJobCardToStage - Function to handle dropping items to stages
 * @returns {Function} returns.canDropCard - Function to validate if item can be dropped
 *
 * @example
 * function JobBoard() {
 *   const { recieveJobCardToStage, canDropCard } = useDnD();
 *
 *   const handleDrop = (item, targetStage) => {
 *     if (canDropCard(item, targetStage)) {
 *       recieveJobCardToStage(item, targetStage);
 *     }
 *   };
 *
 *   return <div>Job board with drag and drop</div>;
 * }
 */
export function useDnD() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const {
    updateModifiedGroups,
    getGroupObject,
    updateJobSnapshotsFromJobs,
    findJobInUserJobSnapshotArray,
  } = useUsersStore.getState().jobData.actions;

  /**
   * Handles dropping a job or group card to a specific status stage.
   * Updates the item's status and syncs changes with Firebase.
   *
   * @param {Object} item - The item being dropped (job or group card)
   * @param {Object} status - The target status stage to drop the item to
   * @returns {Promise<void>} Promise that resolves when drop operation is complete
   *
   * @private
   */
  const recieveJobCardToStage = async (item, status) => {
    if (item.currentStatus === status.id) {
      return;
    }

    switch (item.cardType) {
      case ItemTypes.jobCard:
        let inputJob = await findOrGetJobObject(item.id);
        if (!inputJob) {
          return;
        }
        inputJob.setJobStatus(status.id);

        const matchedSnapshot = findJobInUserJobSnapshotArray(inputJob.jobID);
        matchedSnapshot.setSnapshot(inputJob);

        if (isLoggedIn) {
          await updateJobInFirebase(inputJob);
        }
        manageListenerRequests(inputJob.jobID);
        updateJobSnapshotsFromJobs(inputJob);
        updateOrAddJobsToJobArray(inputJob);

      case ItemTypes.groupCard:
        let groupItem = getGroupObject(item.id);
        if (!groupItem) {
          return;
        }

        groupItem.groupStatus = status.id;

        updateModifiedGroups(groupItem);
        if (isLoggedIn) {
          await uploadGroupsToFirebase();
        }
    }
  };
  /**
   * Validates whether a card can be dropped to a specific status stage.
   * Checks business rules for job and group card movements.
   *
   * @param {Object} item - The item being dropped (job or group card)
   * @param {Object} status - The target status stage to validate against
   * @returns {boolean} True if the item can be dropped, false otherwise
   *
   * @private
   */
  const canDropCard = (item, status) => {
    switch (item.cardType) {
      case ItemTypes.jobCard:
        if (item.currentStatus === status.id) {
          return false;
        }
        return true;
      case ItemTypes.groupCard:
        if (item.currentStatus === status.id || status.id > 3) {
          return false;
        }
        return true;
    }
  };

  return { canDropCard, recieveJobCardToStage };
}
