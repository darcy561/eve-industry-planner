import { eventEmitter } from "../utils/EventSystem";

export const JOB_DEPENDENCY_TREE_DIALOGUE_EVENT = "jobDependencyTreeDialogue";

/**
 * Opens the job dependency tree `ContentDialogue` (see `JobDependencyTreeDialogue.jsx`).
 *
 * @param {object} [payload]
 * @param {string|undefined} [payload.groupId] - When set, load jobs from this group
 *   (`Group.includedJobIDs`); if `jobIds` is set too, the tree is the intersection
 *   (in group order is not guaranteed — jobs are built from store order).
 * @param {string[]|ReadonlySet<string>|Set<string>|undefined} [payload.jobIds] -
 *   Explicit job IDs to show. If omitted with `groupId`, all jobs in the group are shown.
 *   If `groupId` is omitted, these IDs are resolved from the current `jobArray`.
 * @param {string[]|ReadonlySet<string>|Set<string>|undefined} [payload.chainHighlightJobIds] -
 *   Panel-style chain highlight (non-empty: dim the rest, ring these nodes).
 * @param {string|number|undefined} [payload.initialFocusJobId] - Fit and emphasis seed.
 * @param {string|undefined} [payload.title] - Dialog title (default: "Job dependency tree").
 * @param {boolean|undefined} [payload.showHelpText] - Default true.
 * @param {string|undefined} [payload.editReturnPageView] - `pageView` search param when
 *   deep-linking back from the edit job route; default `"jobTree"`.
 * @param {string|undefined} [payload.activeGroupForEdit] - `activeGroup` search for edit
 *   navigation; defaults to `groupId` when that is set.
 * @param {string|number|undefined} [payload.interactionResetKey] - optional override; otherwise
 *   a new timestamp is used when opening.
 */
export function openJobDependencyTreeDialogue(payload = {}) {
  const p = payload;
  const toIdList = (x) => {
    if (x == null) return null;
    if (x instanceof Set) return [...x].map(String);
    if (Array.isArray(x)) return x.map(String);
    return null;
  };

  const idList = toIdList(p.jobIds);
  const chain = toIdList(p.chainHighlightJobIds);

  eventEmitter.emit(JOB_DEPENDENCY_TREE_DIALOGUE_EVENT, {
    isOpen: true,
    openSession:
      p.interactionResetKey != null ? Number(p.interactionResetKey) : Date.now(),
    fromEditContext: false,
    editContextJobId: null,
    editSearchActiveGroup: null,
    editSearchPageView: null,
    groupId: p.groupId != null ? String(p.groupId) : null,
    jobIds: idList,
    chainHighlightJobIds: chain,
    initialFocusJobId:
      p.initialFocusJobId != null ? String(p.initialFocusJobId) : null,
    title:
      typeof p.title === "string" && p.title.trim()
        ? p.title.trim()
        : "Job dependency tree",
    showHelpText: p.showHelpText !== false,
    editReturnPageView: p.editReturnPageView != null ? p.editReturnPageView : "jobTree",
    activeGroupForEdit: p.activeGroupForEdit != null ? String(p.activeGroupForEdit) : null,
  });
}

/**
 * Opens the link tree from the edit job route with minimal data; resolution
 * (related jobs, group pool, focus) is handled inside `JobDependencyTreeDialogue`.
 *
 * @param {object} p
 * @param {string|number} p.jobId
 * @param {string|undefined} [p.activeGroup] - Route `search.activeGroup` when present
 * @param {string|undefined} [p.pageView] - Route `search.pageView` when present
 */
export function openJobLinkTreeFromEditPage(p) {
  if (p == null || p.jobId == null || p.jobId === "") {
    return;
  }
  eventEmitter.emit(JOB_DEPENDENCY_TREE_DIALOGUE_EVENT, {
    isOpen: true,
    openSession: Date.now(),
    fromEditContext: true,
    editContextJobId: String(p.jobId),
    editSearchActiveGroup:
      p.activeGroup != null && String(p.activeGroup) !== ""
        ? String(p.activeGroup)
        : null,
    editSearchPageView: p.pageView != null ? p.pageView : null,
    groupId: null,
    jobIds: null,
    chainHighlightJobIds: null,
    initialFocusJobId: null,
    title: "Job link tree",
    showHelpText: true,
    editReturnPageView: p.pageView != null ? p.pageView : "jobTree",
    activeGroupForEdit: null,
  });
}

export function closeJobDependencyTreeDialogue() {
  eventEmitter.emit(JOB_DEPENDENCY_TREE_DIALOGUE_EVENT, { isOpen: false });
}
