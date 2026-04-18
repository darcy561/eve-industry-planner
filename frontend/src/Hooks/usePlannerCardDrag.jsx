import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ItemTypes, JobCardUiSource } from "../Context/DnDTypes";

/**
 * Merge into the draggable root `sx` while dragging so the lifted card does not sit
 * above droppables in the stacking/hit-test order — otherwise `onDragEnd` often gets
 * `over: null` even when stages highlight during drag (compact Cards are especially bad).
 *
 * @param {boolean} isDragging
 * @returns {Record<string, unknown>}
 */
export function plannerDragPassThroughSx(isDragging) {
  if (!isDragging) return {};
  return {
    pointerEvents: "none",
    "& *": { pointerEvents: "none" },
  };
}

function jobDraggableId(jobID) {
  return `drag-job-${jobID}`;
}

function groupDraggableId(groupID) {
  return `drag-group-${groupID}`;
}

/**
 * @param {object} job Planner row data (snapshot-shaped on job planner; Job object on group planner)
 * @param {{ disabled?: boolean, uiListSource?: "jobPlannerSnapshots" | "groupJobObjects" }} [opts]
 */
export function usePlannerJobCardDrag(job, opts = {}) {
  const disabled =
    opts.disabled ??
    Boolean(job?.isLocked);

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
      ? {
          pointerEvents: "none",
          position: "relative",
          /** Above MUI Paper accordions so the default @dnd-kit translated “ghost” stays visible. */
          zIndex: 1600,
        }
      : {}),
  };

  /**
   * Default draggable attrs use tabIndex={0} + role="button". On full-card draggers that
   * steals the first pointer interaction for focus (feels like click twice to drag).
   * Planner does not use KeyboardSensor; keep root non-tab-order so drag starts on first press+move.
   */
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

/** @param {object} group */
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
      ? {
          pointerEvents: "none",
          position: "relative",
          zIndex: 1600,
        }
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
