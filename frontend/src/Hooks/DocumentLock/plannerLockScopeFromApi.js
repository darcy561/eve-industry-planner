import { getDocumentLockStatus } from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import { applyDocumentLockStatusFromPayload } from "../../Functions/DocumentLock/applyDocumentLockStatusFromPayload.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../../Functions/DocumentLock/documentLockCollections.js";

/**
 * Refresh a single planner-job lock scope from the server. Used by the
 * planner sync hooks when a WebSocket fan-out names a specific job — cheaper
 * than re-batching the whole planner.
 *
 * @param {string} jobID
 */
export async function patchPlannerJobLockScopeFromApi(jobID) {
  if (!jobID) return;
  try {
    const res = await getDocumentLockStatus(USER_JOBS_COLLECTION, jobID);
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    applyDocumentLockStatusFromPayload(USER_JOBS_COLLECTION, jobID, data);
  } catch {
    /* ignore */
  }
}

/**
 * Refresh a single planner-group lock scope from the server.
 *
 * @param {string} groupID
 */
export async function patchPlannerGroupLockScopeFromApi(groupID) {
  if (!groupID) return;
  try {
    const res = await getDocumentLockStatus(
      USER_JOB_GROUPS_COLLECTION,
      groupID
    );
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    applyDocumentLockStatusFromPayload(
      USER_JOB_GROUPS_COLLECTION,
      groupID,
      data
    );
  } catch {
    /* ignore */
  }
}
