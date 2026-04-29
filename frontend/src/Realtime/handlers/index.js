/**
 * Realtime change-stream message handlers (per collection / file).
 * Routed from `applyRemoteMessage.js`.
 */

export {
  normalizeRefreshTokens,
  enqueueReconcile,
  scheduleSystemIndexRefresh,
  reconcileAfterRemoteUserDoc,
  reconcileAfterRemoteApplicationSettings,
} from "./accountReconcile.js";

export {
  handleUsersDocumentDelete,
  handleUsersDocumentUpsert,
} from "./usersDocument.js";

export {
  handleApplicationSettingsDocumentDelete,
  handleApplicationSettingsDocumentUpsert,
} from "./applicationSettingsDocument.js";

export {
  handleUserJobGroupDelete,
  handleUserJobGroupUpsert,
} from "./userJobGroupsDocument.js";

export {
  handleWatchlistDeprecatedDelete,
  handleWatchlistDeprecatedUpsert,
} from "./userWatchlistDeprecatedDocument.js";
