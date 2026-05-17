import useUsersStore from "../../Zustand/usersStore.js";
import { DOCUMENT_LOCK_API_ERROR_LOCK_HELD_ELSEWHERE } from "./documentLockEvents.js";

/**
 * Parses a 409 response body and patches document-lock scopes for each `rejected` row.
 * @param {string} text - Raw response body (already read from `Response`).
 * @returns {boolean} true if this was a structured lock conflict and scopes were updated.
 */
export function applyLockHeldElsewhereFromApiBody(text) {
  let body;
  try {
    body = JSON.parse(text.trim() || "{}");
  } catch {
    return false;
  }
  if (!body || typeof body !== "object") return false;
  if (body.error !== DOCUMENT_LOCK_API_ERROR_LOCK_HELD_ELSEWHERE) return false;
  const collection =
    typeof body.collection === "string" ? body.collection : "";
  const rejected = Array.isArray(body.rejected) ? body.rejected : [];
  if (!collection || rejected.length === 0) return false;

  const patch = useUsersStore.getState().documentLock.actions.patchDocumentLockForScope;
  for (const row of rejected) {
    if (!row || typeof row.docID !== "string" || !row.docID) continue;
    const exp =
      typeof row.lockExpiresAtUnix === "number" ? row.lockExpiresAtUnix : null;
    patch(collection, row.docID, {
      lockHeld: false,
      readOnly: true,
      holderSessionID:
        typeof row.holderSessionID === "string" ? row.holderSessionID : "",
      lockExpiresAtUnix: exp,
      lockTtlSeconds: null,
      pendingAccessRequest: false,
    });
  }
  return true;
}
