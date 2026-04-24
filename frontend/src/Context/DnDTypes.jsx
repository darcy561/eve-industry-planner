
/**
 * Drag and Drop item types for EVE Industry Planner.
 * 
 * Defines the different types of draggable items used in the drag and drop
 * functionality throughout the application. These types are used to identify
 * and handle different draggable elements in the UI.
 * 
 * @type {Object}
 * @property {string} jobCard - Job card draggable item type
 * @property {string} groupCard - Group card draggable item type
 * @property {string} stage - Stage draggable item type
 * 
 * @example
 * {
 *   jobCard: "JobCard",
 *   groupCard: "GroupCard",
 *   stage: "Stage"
 * }
 */
export const ItemTypes = {
    jobCard: "JobCard",
    groupCard: "GroupCard",
    stage: "Stage"
};

/**
 * Which planner UI rendered the draggable job row (on @dnd-kit draggable `data`).
 */
export const JobCardUiSource = {
    /** Main job planner accordion lists canonical `Job` rows (`jobArray`, `displayOnPlanner`). */
    jobPlannerSnapshots: "jobPlannerSnapshots",
    /** Group planner accordion lists jobs from `jobArray` filtered by the active group. */
    groupJobObjects: "groupJobObjects",
};

/** Droppable `data.type` for job-planner workflow stages (see PlannerDnDProvider). */
export const PLANNER_STAGE_DROP_TYPE = "planner-stage";

/** Stable droppable id per workflow stage (job planner accordion). */
export function plannerStageDroppableId(stageId) {
    return `planner-stage-${stageId}`;
}
