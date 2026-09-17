/**
 * The document family: a change to a document the account can see.
 *
 * Dispatches on `collection` and `operationType` to the per-collection handlers.
 */

import useUsersStore from "../../Zustand/usersStore.js";
import { enqueueInboundJobDocumentChange } from "../../Functions/Debounce/inboundJobDocumentsCoalesce.js";
import {
  handleApplicationSettingsDocumentDelete,
  handleApplicationSettingsDocumentUpsert,
  handleUserJobGroupDelete,
  handleUserJobGroupUpsert,
  handleUsersDocumentDelete,
  handleUsersDocumentUpsert,
  handleWatchlistDeprecatedDelete,
  handleWatchlistDeprecatedUpsert,
} from "./index.js";
import { USER_JOB_GROUPS_COLLECTION } from "../../Functions/Endpoints/Private/groups.js";
import { USER_JOB_DOCUMENTS_COLLECTION } from "../../Functions/Endpoints/Private/jobDocuments.js";
import { USER_WATCHLIST_DEPRECATED_COLLECTION } from "../../Functions/Endpoints/Private/watchlistDeprecated.js";

/**
 * @param {unknown} raw - parsed JSON from WebSocket
 */
export async function applyDocumentMessage(msg) {
  const collection = typeof msg.collection === "string" ? msg.collection : null;
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
  const owner = typeof msg.owner === "string" ? msg.owner : null;
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
  const rs = useUsersStore.getState().websocketSync.actions;

  // The delivery's place in the stream, not the document's own stamp: a delete
  // carries one too, and a redelivery repeats it. An older server sends none,
  // which reads as "unknown" and applies rather than discards.
  const position = Number.isFinite(msg?.position) ? msg.position : null;
  const ctxBase = { accountId, docKey, docID, rs, position };

  if (isPlannerHeld(collection) && !isFromActivePlanner(owner)) return;

  // At or below what has been applied is a copy of a change already made, which
  // is what a redelivery looks like. Deliveries are ordered per document rather
  // than per socket, so this guards a delete as much as an upsert: a late delete
  // would otherwise remove what a change already applied after it put there.
  if (position != null && position <= rs.getPosition(docKey)) {
    return;
  }

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
      enqueueInboundJobDocumentChange("delete", docID, undefined, position);
      return;
    }
    return;
  }

  if (!document || typeof document !== "object") return;

  const upsertCtx = {
    ...ctxBase,
    document,
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
    enqueueInboundJobDocumentChange("upsert", docID, document, position);
  }
}

/**
 * Mirrors `PlannerHeldCollections` in services/shared/mongo/names.go. A
 * collection added there and not here is one the store takes from any planner.
 *
 * @type {ReadonlySet<string>}
 */
const PLANNER_HELD_COLLECTIONS = new Set([
  USER_JOB_DOCUMENTS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
]);

/** @param {string} collection @returns {boolean} */
function isPlannerHeld(collection) {
  return PLANNER_HELD_COLLECTIONS.has(collection);
}

/**
 * The store holds one planner's jobs, so a document from another would merge in
 * with nothing to tell the two apart.
 *
 * @param {string|null} owner - the owner handle the message named
 * @returns {boolean}
 */
function isFromActivePlanner(owner) {
  return (
    owner ===
    useUsersStore.getState().activePlanner.actions.getActivePlannerOwner()
  );
}
