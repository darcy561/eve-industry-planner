/**
 * Routes NATS/WebSocket `ChangeStreamMessage`-shaped JSON into Zustand (users + application_settings).
 * Skips stale/duplicate events using `realtimeSync` monotonic cursors.
 *
 * Per-collection logic lives under `handlers/` — add new handler modules there and
 * dispatch from this file.
 */

import useUsersStore from "../Zustand/usersStore.js";
import { metaLastModifiedMs } from "../Zustand/realtimeSyncSlice.js";
import { enqueueInboundJobDocumentChange } from "../Functions/Debounce/inboundJobDocumentsCoalesce.js";
import {
  handleApplicationSettingsDocumentDelete,
  handleApplicationSettingsDocumentUpsert,
  handleUserJobGroupDelete,
  handleUserJobGroupUpsert,
  handleUsersDocumentDelete,
  handleUsersDocumentUpsert,
  handleWatchlistDeprecatedDelete,
  handleWatchlistDeprecatedUpsert,
} from "./handlers/index.js";
import { USER_JOB_GROUPS_COLLECTION } from "../Functions/Endpoints/Pirivate/groups.js";
import { USER_JOB_DOCUMENTS_COLLECTION } from "../Functions/Endpoints/Pirivate/jobDocuments.js";
import { USER_WATCHLIST_DEPRECATED_COLLECTION } from "../Functions/Endpoints/Pirivate/watchlistDeprecated.js";

/**
 * @param {unknown} raw - parsed JSON from WebSocket
 */
export async function applyRemoteMessage(raw) {
  if (!raw || typeof raw !== "object") return;

  const msg = /** @type {Record<string, unknown>} */ (raw);
  const collection =
    typeof msg.collection === "string" ? msg.collection : null;
  const operationType =
    typeof msg.operationType === "string"
      ? msg.operationType.toLowerCase()
      : "";
  const rawId = msg.docID ?? msg.docId;
  const docID =
    typeof rawId === "string"
      ? rawId
      : typeof rawId === "number" && Number.isFinite(rawId)
        ? String(rawId)
        : null;
  const document = /** @type {Record<string, unknown>|undefined} */ (
    msg.document
  );
  const previousDocument = /** @type {Record<string, unknown>|undefined} */ (
    msg.previousDocument
  );
  const refreshTokensChanged =
    typeof msg.refreshTokensChanged === "boolean"
      ? msg.refreshTokensChanged
      : typeof msg.refresh_tokens_changed === "boolean"
        ? msg.refresh_tokens_changed
        : false;
  const linkedCharactersChanged =
    typeof msg.linkedCharactersChanged === "boolean"
      ? msg.linkedCharactersChanged
      : typeof msg.linked_characters_changed === "boolean"
        ? msg.linked_characters_changed
        : refreshTokensChanged;

  if (!collection || !docID) return;

  const accountId = useUsersStore.getState().account.accountID;
  if (!accountId) return;

  const docKey = `${collection}.${docID}`;
  const rs = useUsersStore.getState().realtimeSync.actions;

  const ctxBase = { accountId, docKey, docID, rs };

  if (operationType === "delete" || operationType === "drop") {
    if (collection === "account_settings") {
      handleApplicationSettingsDocumentDelete(ctxBase);
      return;
    }
    if (collection === "accounts") {
      handleUsersDocumentDelete(ctxBase);
      return;
    }
    if (collection === USER_JOB_GROUPS_COLLECTION) {
      await handleUserJobGroupDelete(ctxBase);
      return;
    }
    if (collection === USER_WATCHLIST_DEPRECATED_COLLECTION) {
      handleWatchlistDeprecatedDelete(ctxBase);
      return;
    }
    if (collection === USER_JOB_DOCUMENTS_COLLECTION) {
      enqueueInboundJobDocumentChange("delete", docID);
      return;
    }
    return;
  }

  if (!document || typeof document !== "object") return;

  const remoteMs = metaLastModifiedMs(document);
  if (remoteMs == null) {
    return;
  }
  const prevCursor = rs.getCursorMs(docKey);
  // Only drop strictly older events. `<=` would drop a new update that shares the same
  // _meta.lastModified ms as the cursor (ties, sub-ms resolution, or duplicate deliveries).
  if (remoteMs < prevCursor) {
    return;
  }

  const upsertCtx = {
    ...ctxBase,
    document,
    remoteMs,
    previousDocument,
    refreshTokensChanged,
    linkedCharactersChanged,
  };

  if (collection === "accounts") {
    handleUsersDocumentUpsert(upsertCtx);
    return;
  }

  if (collection === "account_settings") {
    handleApplicationSettingsDocumentUpsert(upsertCtx);
    return;
  }

  if (collection === USER_JOB_GROUPS_COLLECTION) {
    handleUserJobGroupUpsert(upsertCtx);
    return;
  }

  if (collection === USER_WATCHLIST_DEPRECATED_COLLECTION) {
    handleWatchlistDeprecatedUpsert(upsertCtx);
    return;
  }

  if (collection === USER_JOB_DOCUMENTS_COLLECTION) {
    enqueueInboundJobDocumentChange("upsert", docID, document);
  }
}
