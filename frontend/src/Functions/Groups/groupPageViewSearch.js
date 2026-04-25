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
