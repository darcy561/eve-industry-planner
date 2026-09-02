/**
 * The notification family: something happened that a client may want to react to.
 *
 * A notification carries no document. It is a signal that the server has written
 * something, not a delivery of what was written, so a handler here refetches what
 * the user is actually looking at rather than applying a payload.
 */

import { queryClient } from "../../queryClient.js";
import { invalidateArchiveQueries } from "../../Hooks/React Query/Backend/archivedJobsList.js";
import { showSnackbar } from "../../Events/snackbarEvents.js";
import { NOTIFICATION_ARCHIVE_STATS_PROCESSED } from "../messageKinds.js";

/**
 * An owner's archived-job statistics have been written.
 *
 * One handler invalidates both the archive list and the statistics views, so a
 * call site that archives a job does not have to know what archiving
 * invalidates. Spreading that knowledge across the archiving entry points is how
 * two of them came to refresh the figures and leave the list showing a page that
 * no longer matches it.
 *
 * React Query refetches only what is mounted, so a user with no archive on
 * screen pays nothing for this.
 */
function handleArchiveStatsProcessed() {
  invalidateArchiveQueries(queryClient);
  showSnackbar("Archive statistics updated", "info", 3);
}

const NOTIFICATION_HANDLERS = {
  [NOTIFICATION_ARCHIVE_STATS_PROCESSED]: handleArchiveStatsProcessed,
};

/**
 * Route one notification to its handler.
 *
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
