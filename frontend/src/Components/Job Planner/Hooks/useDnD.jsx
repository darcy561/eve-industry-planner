import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ItemTypes, JobCardUiSource } from "../../../Context/DnDTypes";
import { saveJobsViaApi } from "../../../Functions/JobDocuments/saveJobsViaApi.js";
import { useJobLockReadOnly } from "../../../Hooks/DocumentLock/useDocumentLockState";
import useUsersStore from "../../../Zustand/usersStore";

function sameWorkflowStage(a, b) {
  return Number(a) === Number(b);
}

function jobDraggableId(jobID) {
  return `drag-job-${jobID}`;
}

function groupDraggableId(groupID) {
  return `drag-group-${groupID}`;
}

export function plannerDragPassThroughSx(isDragging) {
  if (!isDragging) return {};
  return {
    pointerEvents: "none",
    "& *": { pointerEvents: "none" },
  };
}

export function usePlannerJobCardDrag(job, opts = {}) {
  const lockReadOnly = useJobLockReadOnly(job?.jobID);
  const disabled = opts.disabled ?? Boolean(lockReadOnly);
  const uiListSource = opts.uiListSource ?? JobCardUiSource.jobPlannerSnapshots;

  const draggable = useDraggable({
    id: jobDraggableId(job.jobID),
    disabled,
    data: {
      cardType: ItemTypes.jobCard,
      id: job.jobID,
      currentStatus: Number(job.jobStatus),
      uiListSource,
    },
  });

  const style = {
    ...(draggable.transform != null
      ? { transform: CSS.Translate.toString(draggable.transform) }
      : {}),
    ...(draggable.isDragging
      ? { pointerEvents: "none", position: "relative", zIndex: 1600 }
      : {}),
  };

  const attributes = {
    ...draggable.attributes,
    tabIndex: -1,
  };

  return {
    ...draggable,
    attributes,
    style,
  };
}

export function usePlannerGroupCardDrag(group) {
  const draggable = useDraggable({
    id: groupDraggableId(group.groupID),
    data: {
      cardType: ItemTypes.groupCard,
      id: group.groupID,
      currentStatus: Number(group.groupStatus),
    },
  });

  const style = {
    ...(draggable.transform != null
      ? { transform: CSS.Translate.toString(draggable.transform) }
      : {}),
    ...(draggable.isDragging
      ? { pointerEvents: "none", position: "relative", zIndex: 1600 }
      : {}),
  };

  const attributes = {
    ...draggable.attributes,
    tabIndex: -1,
  };

  return {
    ...draggable,
    attributes,
    style,
  };
}

export function useDnD() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { updateModifiedGroups, getGroupObject, updateOrAddJobsToJobArray } =
    useUsersStore.getState().jobData.actions;

  const recieveJobCardToStage = async (item, status) => {
    if (sameWorkflowStage(item.currentStatus, status.id)) {
      return;
    }

    switch (item.cardType) {
      case ItemTypes.jobCard: {
        const inputJob = useUsersStore
          .getState()
          .jobData.actions.findJobInJobArray(item.id);
        if (!inputJob) {
          return;
        }
        inputJob.setJobStatus(status.id);
        const ui = item.uiListSource ?? JobCardUiSource.jobPlannerSnapshots;
        updateOrAddJobsToJobArray(inputJob);
        if (isLoggedIn) {
          await saveJobsViaApi(inputJob);
        }
        void ui;
        break;
      }
      case ItemTypes.groupCard: {
        const groupItem = getGroupObject(item.id);
        if (!groupItem) {
          return;
        }
        groupItem.groupStatus = status.id;
        updateModifiedGroups(groupItem);
        break;
      }
      default:
        break;
    }
  };

  const canDropCard = (item, status) => {
    if (!item || item.cardType == null) return false;
    switch (item.cardType) {
      case ItemTypes.jobCard:
        return !sameWorkflowStage(item.currentStatus, status.id);
      case ItemTypes.groupCard:
        return !(
          sameWorkflowStage(item.currentStatus, status.id) ||
          Number(status.id) > 3
        );
      default:
        return false;
    }
  };

  return { canDropCard, recieveJobCardToStage };
}
