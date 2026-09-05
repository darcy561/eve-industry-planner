/**
 * The vocabulary a realtime message uses to describe itself.
 *
 * Two fields rather than one: `type` says how to route the message at all, and
 * `subtype` says what to do with it inside that family. Before them, "this is a
 * document change" was implicit in the message shape, so anything that was not
 * one had nowhere to go and was dropped without a word.
 *
 * The backend defines the same vocabulary in Go. Neither side can import the
 * other, so both are checked against `testing/fixtures/realtime-messages/kinds.json`
 * — adding a kind here without adding it there fails the test.
 */

/**
 * A change to a document, carrying its collection and body. Producers of these
 * predate the field and send none, so a message with no `type` is this family.
 */
export const MESSAGE_TYPE_DOCUMENT = "document";

/** Something happened. Carries no document; the client decides whether it cares. */
export const MESSAGE_TYPE_NOTIFICATION = "notification";

/** An owner's archived-job statistics have been written. Carries no figures. */
export const NOTIFICATION_ARCHIVE_STATS_PROCESSED = "archiveStatsProcessed";

/** The vocabulary itself, family to kinds. */
export const MESSAGE_KINDS = {
  [MESSAGE_TYPE_DOCUMENT]: [],
  [MESSAGE_TYPE_NOTIFICATION]: [NOTIFICATION_ARCHIVE_STATS_PROCESSED],
};

/**
 * The family a message belongs to. A message that names none is a document
 * change, which is what every producer predating the field sends.
 *
 * @param {Record<string, unknown>} msg
 * @returns {string}
 */
export function messageFamily(msg) {
  const type = typeof msg?.type === "string" ? msg.type.trim() : "";
  return type === "" ? MESSAGE_TYPE_DOCUMENT : type;
}
