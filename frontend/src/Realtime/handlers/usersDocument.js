/**
 * Change-stream handlers for `users` collection (account singleton doc).
 */

import useUsersStore from "../../Zustand/usersStore.js";
import {
  enqueueReconcile,
  normalizeRefreshTokens,
  reconcileAfterRemoteUserDoc,
} from "./accountReconcile.js";

/**
 * @param {{
 *   accountId: string;
 *   docKey: string;
 *   docID: string;
 *   rs: { setCursorMs: (k: string, ms: number) => void };
 * }} ctx
 * @returns {boolean} true if handled
 */
export function handleUsersDocumentDelete(ctx) {
  const { accountId, docID, docKey, rs } = ctx;
  if (docID !== accountId) return false;

  rs.setCursorMs(docKey, Date.now());
  console.warn("[realtime] users document delete — session may be invalid");
  return true;
}

/**
 * @param {{
 *   accountId: string;
 *   docKey: string;
 *   docID: string;
 *   document: Record<string, unknown>;
 *   previousDocument?: Record<string, unknown>;
 *   rs: { setCursorMs: (k: string, ms: number) => void };
 *   remoteMs: number;
 * }} ctx
 * @returns {boolean}
 */
export function handleUsersDocumentUpsert(ctx) {
  const { accountId, docID, docKey, document, previousDocument, rs, remoteMs } =
    ctx;
  if (docID !== accountId) return false;

  let snap;
  if (previousDocument && typeof previousDocument === "object") {
    const rawPrev =
      previousDocument.refreshTokens ?? previousDocument.refresh_tokens;
    if (Array.isArray(rawPrev)) {
      snap = { prevLinkedTokens: normalizeRefreshTokens(rawPrev) };
    }
  }
  if (!snap) {
    snap = {
      prevLinkedTokens: normalizeRefreshTokens(
        useUsersStore.getState().account.linkedCharacterRefreshTokens
      ),
    };
  }

  useUsersStore.getState().account.actions.applyUserDocumentFromRemote(document);
  rs.setCursorMs(docKey, remoteMs);

  enqueueReconcile(async () => {
    await reconcileAfterRemoteUserDoc(snap, document);
  });

  return true;
}
