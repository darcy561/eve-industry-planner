import { ItemTypes, JobCardUiSource } from "../Context/DnDTypes";
import uploadGroupsToFirebase from "../Functions/Firebase/uploadGroupData";
import updateJobInFirebase from "../Functions/Firebase/updateJob";
import uploadJobSnapshotsToFirebase from "../Functions/Firebase/uploadJobSnapshots";
import findOrGetJobObject from "../Functions/Helper/findJobObject";
import manageListenerRequests from "../Functions/Firebase/manageListenerRequests";
import useUsersStore from "../Zustand/usersStore";

const DBG = "[useDnD]";
function dbg(...args) {
  if (import.meta.env.DEV) {
    console.log(DBG, ...args);
  }
}

/**
 * Planner DnD — two job UIs share workflow stages but different list sources:
 * - **Job planner**: lists `userJobSnapshot`; always mirror the canonical `Job` into snapshots after a move.
 * - **Group planner**: lists `jobArray` jobs for the active group; persist `jobArray` only. Update `userJobSnapshot`
 *   only when `Job.displayOnPlanner` is true (jobs opted into the main planner).
 *
 * Custom hook that provides drag and drop functionality for job and group cards.
 *
 * This hook:
 * - Handles dropping job cards and group cards between different status stages
 * - Updates job status and group status when items are moved
 * - Syncs changes with Firebase when logged in (`updateJobInFirebase`; `uploadJobSnapshotsToFirebase`
 *   after snapshot mirror when the planner snapshot doc should change)
 * - Manages Firebase listeners for real-time updates
 * - Provides validation for drop operations
 *
 * @returns {Object} Object containing drag and drop functions
 * @returns {Function} returns.recieveJobCardToStage - Function to handle dropping items to stages
 * @returns {Function} returns.canDropCard - Function to validate if item can be dropped
 *
 * Used by {@link ../Context/PlannerDnDProvider.jsx} on drag end after @dnd-kit validates the target stage.
 */
/** @param {unknown} a @param {unknown} b */
function sameWorkflowStage(a, b) {
  return Number(a) === Number(b);
}

export function useDnD() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const {
    updateModifiedGroups,
    getGroupObject,
    addOrUpdateJobSnapshotsFromJobs,
    updateOrAddJobsToJobArray,
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
    dbg("recieveJobCardToStage enter", { item, status });

    if (sameWorkflowStage(item.currentStatus, status.id)) {
      dbg("exit: already on target stage");
      return;
    }

    switch (item.cardType) {
      case ItemTypes.jobCard: {
        let inputJob = await findOrGetJobObject(item.id);
        if (!inputJob) {
          dbg("exit: findOrGetJobObject returned null for id=", item.id);
          return;
        }
        inputJob.setJobStatus(status.id);

        const ui =
          /** @type {typeof JobCardUiSource[keyof typeof JobCardUiSource] | undefined} */ (
            item.uiListSource
          ) ?? JobCardUiSource.jobPlannerSnapshots;

        /** Canonical Job store — group accordion reads `jobArray`; always refresh this first. */
        updateOrAddJobsToJobArray(inputJob);

        const shouldMirrorSnapshot =
          ui === JobCardUiSource.jobPlannerSnapshots ||
          Boolean(inputJob.displayOnPlanner);

        if (shouldMirrorSnapshot) {
          addOrUpdateJobSnapshotsFromJobs(inputJob);
        }

        manageListenerRequests(inputJob.jobID);

        if (isLoggedIn) {
          await updateJobInFirebase(inputJob);
          if (shouldMirrorSnapshot) {
            await uploadJobSnapshotsToFirebase();
          }
        }

        dbg(
          "job move complete → stage",
          status.id,
          "jobID=",
          inputJob.jobID,
          "uiListSource=",
          ui,
          "snapshotMirror=",
          shouldMirrorSnapshot
        );
        break;
      }

      case ItemTypes.groupCard: {
        let groupItem = getGroupObject(item.id);
        if (!groupItem) {
          dbg("exit: getGroupObject null for id=", item.id);
          return;
        }

        groupItem.groupStatus = status.id;

        updateModifiedGroups(groupItem);
        if (isLoggedIn) {
          await uploadGroupsToFirebase();
        }
        dbg("group move complete → stage", status.id, "groupID=", item.id);
        break;
      }
      default:
        dbg("exit: unknown cardType", item.cardType);
        break;
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
    if (!item || item.cardType == null) return false;
    switch (item.cardType) {
      case ItemTypes.jobCard:
        if (sameWorkflowStage(item.currentStatus, status.id)) {
          return false;
        }
        return true;
      case ItemTypes.groupCard:
        if (sameWorkflowStage(item.currentStatus, status.id) || Number(status.id) > 3) {
          return false;
        }
        return true;
      default:
        return false;
    }
  };

  return { canDropCard, recieveJobCardToStage };
}
