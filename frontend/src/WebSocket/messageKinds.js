/**
 * The vocabulary a websocket message uses to describe itself: `type` routes the
 * message, `subtype` says what to do with it inside that family.
 *
 * The backend defines the same vocabulary in Go. Neither side can import across
 * the language boundary, so both are checked against
 * `testing/fixtures/realtime-messages/kinds.json`.
 *
 * The families here are the messages addressed to an audience, which is not
 * every `type` a browser can see: replies and lifecycle frames are written to
 * the one connection they concern and address nobody.
 */

import { DOCUMENT_LOCK_FRAME_TYPES } from "../Functions/DocumentLock/documentLockEvents.js";

/** A message with no `type` is this family. */
export const MESSAGE_TYPE_DOCUMENT = "document";

export const MESSAGE_TYPE_NOTIFICATION = "notification";

export const NOTIFICATION_ARCHIVE_STATS_PROCESSED = "archiveStatsProcessed";

export const MESSAGE_TYPE_MAINTENANCE = "maintenance";

export const MESSAGE_TYPE_STATIC_DATA = "staticData";

/**
 * Lock events carry their kind in an `event` field of the frame rather than in a
 * subtype, so this family lists none. The spelling comes from the document-lock
 * module that already owns it rather than being written again here.
 */
export const MESSAGE_TYPE_DOCUMENT_LOCK = DOCUMENT_LOCK_FRAME_TYPES.CHANNEL;

export const MESSAGE_KINDS = {
  [MESSAGE_TYPE_DOCUMENT]: [],
  [MESSAGE_TYPE_NOTIFICATION]: [NOTIFICATION_ARCHIVE_STATS_PROCESSED],
  [MESSAGE_TYPE_MAINTENANCE]: [],
  [MESSAGE_TYPE_STATIC_DATA]: [],
  [MESSAGE_TYPE_DOCUMENT_LOCK]: [],
};

/**
 * @param {Record<string, unknown>} msg
 * @returns {string}
 */
export function messageFamily(msg) {
  const type = typeof msg?.type === "string" ? msg.type.trim() : "";
  return type === "" ? MESSAGE_TYPE_DOCUMENT : type;
}
