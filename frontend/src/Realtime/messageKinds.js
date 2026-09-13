/**
 * The vocabulary a realtime message uses to describe itself: `type` routes the
 * message, `subtype` says what to do with it inside that family.
 *
 * The backend defines the same vocabulary in Go. Neither side can import the
 * other, so both are checked against
 * `testing/fixtures/realtime-messages/kinds.json`.
 */

/** A message with no `type` is this family. */
export const MESSAGE_TYPE_DOCUMENT = "document";

export const MESSAGE_TYPE_NOTIFICATION = "notification";

export const NOTIFICATION_ARCHIVE_STATS_PROCESSED = "archiveStatsProcessed";

export const MESSAGE_TYPE_MAINTENANCE = "maintenance";

export const MESSAGE_TYPE_STATIC_DATA = "staticData";

export const MESSAGE_KINDS = {
  [MESSAGE_TYPE_DOCUMENT]: [],
  [MESSAGE_TYPE_NOTIFICATION]: [NOTIFICATION_ARCHIVE_STATS_PROCESSED],
  [MESSAGE_TYPE_MAINTENANCE]: [],
  [MESSAGE_TYPE_STATIC_DATA]: [],
};

/**
 * @param {Record<string, unknown>} msg
 * @returns {string}
 */
export function messageFamily(msg) {
  const type = typeof msg?.type === "string" ? msg.type.trim() : "";
  return type === "" ? MESSAGE_TYPE_DOCUMENT : type;
}
