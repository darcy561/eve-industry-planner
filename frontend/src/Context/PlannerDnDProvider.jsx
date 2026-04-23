/**
 * Application-wide drag-and-drop (Job Planner workflow stages).
 *
 * Logic flow for planner workflow drag-and-drop:
 * 1. Draggable sources: {@link ./DnDTypes.jsx ItemTypes.jobCard}, {@link ./DnDTypes.jsx ItemTypes.groupCard}
 *    Payload on each draggable: `{ cardType, id, currentStatus }` (`id` = jobID or groupID).
 * 2. Droppable targets: job-planner accordion stages only — ids `planner-stage-{n}` (`n` = workflow stage 0–4).
 * 3. On drag end: resolve target stage from `event.over`, or fall back to the last stage seen in `onDragOver`
 *    (the HTML5-style transformed card often blocks hit-testing so `over` is null on release even when highlights worked).
 * 4. Validation: {@link ../Hooks/useDnD.jsx useDnD.canDropCard}
 * 5. Persist: {@link ../Hooks/useDnD.jsx useDnD.recieveJobCardToStage}
 *
 * Active drag payload is mirrored to context so stage accordions can tint targets.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
} from "@dnd-kit/core";
import { useDnD } from "../Hooks/useDnD";
import { PLANNER_STAGE_DROP_TYPE } from "./DnDTypes";

/** Prefer pointer-inside droppables; fall back to corners for gaps between stages. */
function plannerCollisionDetection(args) {
  const pointerHits = pointerWithin(args);
  return pointerHits.length > 0 ? pointerHits : closestCorners(args);
}

/** @typedef {{ cardType: string, id: string, currentStatus: number }} PlannerDragPayload */

const PLANNER_DRAG_DATA_CONTEXT = createContext({ payload: null });

/**
 * Payload for the card currently being dragged (`null` when idle or outside the provider).
 * Used by planner stage accordions for drop-target highlighting.
 */
export function useActivePlannerDragPayload() {
  return useContext(PLANNER_DRAG_DATA_CONTEXT).payload;
}

export function PlannerDnDProvider({ children }) {
  const [payload, setPayload] = useState(
    /** @type {PlannerDragPayload | null} */ (null)
  );

  /** Last planner stage droppable hovered during the current drag (survives `over: null` on drag end). */
  const lastPlannerStageRef = useRef(
    /** @type {{ stageId: number } | null} */ (null)
  );

  const { recieveJobCardToStage, canDropCard } = useDnD();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      /** Lower than default tutorials (8px): single fluid press-and-drag without an extra “wake up” motion. */
      activationConstraint: { distance: 5 },
    })
  );

  const resolveTargetStageId = (event) => {
    const fromOver =
      /** @type {{ type?: string, stageId?: number } | undefined} */ (
        event.over?.data?.current
      );
    if (
      fromOver?.type === PLANNER_STAGE_DROP_TYPE &&
      typeof fromOver.stageId === "number"
    ) {
      return { stageId: fromOver.stageId, source: "event.over" };
    }
    const fb = lastPlannerStageRef.current?.stageId;
    return typeof fb === "number"
      ? { stageId: fb, source: "lastPlannerStageRef" }
      : { stageId: null, source: "none" };
  };

  const handleDragEnd = useCallback(
    async (event) => {
      const dragItem =
        /** @type {PlannerDragPayload | undefined} */ (event.active.data.current);

      const resolved = resolveTargetStageId(event);
      const stageId =
        resolved.stageId != null ? resolved.stageId : null;

      lastPlannerStageRef.current = null;

      if (stageId == null || !dragItem) {
        return;
      }

      const allowed = canDropCard(dragItem, { id: stageId });

      if (!allowed) {
        return;
      }

      try {
        await recieveJobCardToStage(dragItem, { id: stageId });
      } catch (err) {
        console.error("PlannerDnD: recieveJobCardToStage threw", err);
      }
    },
    [canDropCard, recieveJobCardToStage]
  );

  const contextValue = useMemo(() => ({ payload }), [payload]);

  return (
    <PLANNER_DRAG_DATA_CONTEXT.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={plannerCollisionDetection}
        onDragStart={(e) => {
          lastPlannerStageRef.current = null;
          setPayload(
            /** @type {PlannerDragPayload | null} */ (e.active.data.current)
          );
        }}
        onDragOver={(e) => {
          const dc =
            /** @type {{ type?: string, stageId?: number } | undefined} */ (
              e.over?.data?.current
            );
          if (
            dc?.type === PLANNER_STAGE_DROP_TYPE &&
            typeof dc.stageId === "number"
          ) {
            lastPlannerStageRef.current = { stageId: dc.stageId };
          }
        }}
        onDragCancel={() => {
          lastPlannerStageRef.current = null;
          setPayload(null);
        }}
        onDragEnd={(e) => {
          setPayload(null);
          void handleDragEnd(e);
        }}
      >
        {children}
      </DndContext>
    </PLANNER_DRAG_DATA_CONTEXT.Provider>
  );
}
