import { activePlannerOwnerHandle } from "../../../Zustand/activePlanner/read.js";

/**
 * Key prefix every statistics view shares.
 *
 * Archiving a job moves lifetime totals, the monthly timeline and the per-job
 * rows together, so a write invalidates every view rather than the one item type
 * that changed.
 */
export const STATISTICS_QUERY_KEY_ROOT = "statistics";

/** Key prefix for reads over the archive itself, as opposed to its statistics. */
export const ARCHIVE_QUERY_KEY_ROOT = "archive";

/** Key prefix for the settings a planner's work is done under. */
export const PLANNER_SETTINGS_QUERY_KEY_ROOT = "plannerSettings";

/** Every root whose keys hold one planner's documents. */
const PLANNER_SCOPED_QUERY_ROOTS = [
  STATISTICS_QUERY_KEY_ROOT,
  ARCHIVE_QUERY_KEY_ROOT,
  PLANNER_SETTINGS_QUERY_KEY_ROOT,
];

/**
 * The prefix every planner-scoped key carries: the backend root, then whose
 * documents they are.
 *
 * Invalidation stops above the owner, so a write reaches every planner's entries
 * rather than the active one alone.
 *
 * @param {string} root - what the keys beneath this scope are for
 * @returns {import("@tanstack/react-query").QueryKey}
 */
export function plannerQueryScope(root) {
  return ["backend", root, activePlannerOwnerHandle() ?? ""];
}

/**
 * The scoped prefixes for the planner currently active, for a switch dropping
 * what was cached under the planner it leaves.
 *
 * @returns {import("@tanstack/react-query").QueryKey[]}
 */
export function plannerScopedQueryRoots() {
  return PLANNER_SCOPED_QUERY_ROOTS.map((root) => plannerQueryScope(root));
}
