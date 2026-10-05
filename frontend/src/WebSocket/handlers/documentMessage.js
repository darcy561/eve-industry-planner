import useUsersStore from "../../Zustand/usersStore.js";
import { enqueueInboundJobDocumentChange } from "../../Functions/Job/sync/inboundJobDocuments.js";
import { deltaFromMessage } from "../../Functions/Job/sync/jobDelta.js";
import {
  handleApplicationSettingsDocumentDelete,
  handleApplicationSettingsDocumentUpsert,
  handlePlannerSettingsDelete,
  handlePlannerSettingsUpsert,
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
import { PLANNER_SETTINGS_COLLECTION } from "../../Functions/Endpoints/Private/planners.js";

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

  const position = Number.isFinite(msg?.position) ? msg.position : null;
  const ctxBase = { accountId, docKey, docID, owner, rs, position };

  if (isPlannerHeld(collection) && !isFromActivePlanner(owner)) return;

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
    if (collection === PLANNER_SETTINGS_COLLECTION) {
      handlePlannerSettingsDelete(ctxBase);
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
    enqueueInboundJobDocumentChange(
      "upsert",
      docID,
      document,
      position,
      deltaFromMessage(msg),
    );
    return;
  }

  if (collection === PLANNER_SETTINGS_COLLECTION) {
    handlePlannerSettingsUpsert(upsertCtx);
  }
}

/**
 * The collections whose documents the store holds for one planner at a time, so
 * a delivery from any other has nowhere to go and is dropped.
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
