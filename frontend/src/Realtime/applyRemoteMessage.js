/**
 * Routes an inbound realtime message to the family that knows what to do with it.
 *
 * A message names its family in `type` and, within that family, its kind in
 * `subtype`. A message that names no family is a document change: every producer
 * of those predates the field.
 *
 * A message no family claims is reported rather than dropped. Silence here is
 * what let two collections stream to every browser for nothing without anyone
 * noticing, so the next such gap should be visible on its first message.
 */

import { applyDocumentMessage } from "./handlers/documentMessage.js";
import { applyNotificationMessage } from "./handlers/notificationMessage.js";
import {
  MESSAGE_TYPE_DOCUMENT,
  MESSAGE_TYPE_NOTIFICATION,
  messageFamily,
} from "./messageKinds.js";

/**
 * @param {unknown} raw - parsed JSON from WebSocket
 */
export async function applyRemoteMessage(raw) {
  if (!raw || typeof raw !== "object") return;

  const msg = /** @type {Record<string, unknown>} */ (raw);
  const family = messageFamily(msg);

  if (family === MESSAGE_TYPE_DOCUMENT) {
    await applyDocumentMessage(msg);
    return;
  }

  if (family === MESSAGE_TYPE_NOTIFICATION) {
    if (!applyNotificationMessage(msg)) {
      console.warn(
        "[realtime] no handler for notification",
        typeof msg.subtype === "string" ? msg.subtype : "(none)",
      );
    }
    return;
  }

  console.warn("[realtime] no handler for message family", family);
}
