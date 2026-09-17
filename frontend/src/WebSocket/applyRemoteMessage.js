/**
 * Routes an inbound websocket message to the family that handles it.
 *
 * A message no family claims is warned about rather than dropped silently, so an
 * unrouted producer is visible on its first message.
 */

import { applyDocumentMessage } from "./handlers/documentMessage.js";
import { applyNotificationMessage } from "./handlers/notificationMessage.js";
import { applyMaintenanceMessage } from "./handlers/maintenanceMessage.js";
import { applyStaticDataMessage } from "./handlers/staticDataMessage.js";
import {
  MESSAGE_TYPE_DOCUMENT,
  MESSAGE_TYPE_MAINTENANCE,
  MESSAGE_TYPE_NOTIFICATION,
  MESSAGE_TYPE_STATIC_DATA,
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
        "[websocket] no handler for notification",
        typeof msg.subtype === "string" ? msg.subtype : "(none)",
      );
    }
    return;
  }

  if (family === MESSAGE_TYPE_MAINTENANCE) {
    if (!applyMaintenanceMessage(msg)) {
      console.warn("[websocket] maintenance message without enabled", msg);
    }
    return;
  }

  if (family === MESSAGE_TYPE_STATIC_DATA) {
    if (!applyStaticDataMessage(msg)) {
      console.warn("[websocket] static data message without a build", msg);
    }
    return;
  }

  console.warn("[websocket] no handler for message family", family);
}
