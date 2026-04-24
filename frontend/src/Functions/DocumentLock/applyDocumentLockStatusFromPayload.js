import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Maps a single `/document-locks/status` (or batch row) JSON payload into Zustand document-lock scope state.
 *
 * @param {string} collection
 * @param {string} docID
 * @param {Record<string, unknown>} data
 */
export function applyDocumentLockStatusFromPayload(collection, docID, data) {
  if (!docID || !data || typeof data !== "object") return;

  const sessionID = useUsersStore.getState().account.sessionID;
  const held = data.held === true;
  const holder =
    typeof data.holderSessionID === "string" ? data.holderSessionID : "";

  let readOnly = false;
  let lockHeld = false;
  if (held && holder) {
    if (sessionID && holder === sessionID) {
      lockHeld = true;
      readOnly = false;
    } else {
      readOnly = true;
      lockHeld = false;
    }
  }

  useUsersStore.getState().documentLock.actions.patchDocumentLockForScope(
    collection,
    docID,
    {
      readOnly,
      lockHeld,
      lockExpiresAtUnix:
        typeof data.expiresAtUnix === "number" ? data.expiresAtUnix : null,
      lockTtlSeconds:
        typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
    }
  );
}
