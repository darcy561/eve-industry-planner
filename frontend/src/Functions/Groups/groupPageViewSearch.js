/** @typedef {'planner' | 'breakdown' | 'scheduler' | 'jobTree'} GroupPageViewTab */

export const GROUP_PAGE_VIEW_TABS = /** @type {const} */ ([
  "planner",
  "breakdown",
  "scheduler",
  "jobTree",
]);

/**
 * @param {unknown} v
 * @returns {GroupPageViewTab | undefined}
 */
export function parseGroupPageViewSearchParam(v) {
  if (typeof v !== "string") return undefined;
  return GROUP_PAGE_VIEW_TABS.includes(/** @type {GroupPageViewTab} */ (v))
    ? /** @type {GroupPageViewTab} */ (v)
    : undefined;
}

/**
 * Search object for `/group/$groupID` when returning from edit job.
 * When `pageView` is `jobTree` and `closedJobId` is set, includes `focusJobId` so the tree can center on that job.
 *
 * @param {{ pageView?: unknown }} [editJobSearch]
 * @param {string|null|undefined} [closedJobId]
 * @returns {{ pageView?: GroupPageViewTab, focusJobId?: string }}
 */
export function buildGroupSearchAfterEditClose(editJobSearch, closedJobId) {
  /** @type {{ pageView?: GroupPageViewTab, focusJobId?: string }} */
  const out = {};
  const pv = parseGroupPageViewSearchParam(editJobSearch?.pageView);
  if (pv) out.pageView = pv;
  if (
    pv === "jobTree" &&
    closedJobId != null &&
    closedJobId !== "" &&
    String(closedJobId).trim() !== ""
  ) {
    out.focusJobId = String(closedJobId).trim();
  }
  return out;
}

/**
 * The search an edit-job route carries to the next job it opens: the group it came from and the
 * group page's view.
 *
 * @param {{ activeGroup?: unknown, pageView?: unknown }} [editJobSearch]
 * @returns {{ activeGroup?: string, pageView?: string }}
 */
export function editJobSearchToCarry(editJobSearch) {
  const carried = {};
  for (const key of ["activeGroup", "pageView"]) {
    const value = editJobSearch?.[key];
    if (value != null && String(value) !== "") carried[key] = value;
  }
  return carried;
}

/**
 * Where leaving the editor goes: back to the group the job was opened from, on the view it was on,
 * or to the planner.
 *
 * @param {{ activeGroup?: unknown, pageView?: unknown }} [editJobSearch]
 * @param {string|null|undefined} [leftJobID]
 * @returns {{ to: string, params?: { groupID: string }, search?: object }}
 */
export function routeBackFromEditJob(editJobSearch, leftJobID) {
  const groupID = editJobSearch?.activeGroup;
  if (!groupID) return { to: "/jobplanner" };
  return {
    to: "/group/$groupID",
    params: { groupID },
    search: buildGroupSearchAfterEditClose(editJobSearch, leftJobID),
  };
}
