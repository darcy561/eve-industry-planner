/**
 * The notification family: a signal that the server wrote something, carrying no
 * document. Handlers refetch rather than apply a payload.
 */

import { queryClient } from "../../queryClient.js";
import { invalidateArchiveQueries } from "../../Hooks/React Query/Backend/archivedJobsList.js";
import { showSnackbar } from "../../Events/snackbarEvents.js";
import { NOTIFICATION_ARCHIVE_STATS_PROCESSED } from "../messageKinds.js";

/** Invalidates both the archive list and the statistics views together. */
function handleArchiveStatsProcessed() {
  invalidateArchiveQueries(queryClient);
  showSnackbar("Archive statistics updated", "info", 3);
}

const NOTIFICATION_HANDLERS = {
  [NOTIFICATION_ARCHIVE_STATS_PROCESSED]: handleArchiveStatsProcessed,
};

/**
 * @param {Record<string, unknown>} msg
 * @returns {boolean} whether a handler took it
 */
export function applyNotificationMessage(msg) {
  const subtype = typeof msg?.subtype === "string" ? msg.subtype.trim() : "";
  const handler = NOTIFICATION_HANDLERS[subtype];
  if (!handler) return false;
  handler(msg);
  return true;
}
