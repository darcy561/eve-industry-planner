/**
 * Change-stream handlers for `account_watchlist_deprecated` (legacy Firestore-shaped watchlist blob).
 */

import useUsersStore from "../../Zustand/usersStore.js";

/**
 * @param {{
 *   docID: string;
 *   docKey: string;
 *   rs: { setCursorMs: (k: string, ms: number) => void };
 * }} ctx
 */
export function handleWatchlistDeprecatedDelete(ctx) {
  const { docKey, rs } = ctx;
  const actions = useUsersStore.getState().jobData.actions;
  actions.setUserWatchlist([], []);
  rs.setCursorMs(docKey, Date.now());
}

/**
 * @param {{
 *   accountId: string;
 *   docKey: string;
 *   document: Record<string, unknown>;
 *   rs: { setCursorMs: (k: string, ms: number) => void };
 *   remoteMs: number;
 * }} ctx
 */
export function handleWatchlistDeprecatedUpsert(ctx) {
  const { document, rs, docKey, remoteMs } = ctx;
  const items = Array.isArray(document?.items) ? document.items : [];
  const groups = Array.isArray(document?.groups) ? document.groups : [];
  const actions = useUsersStore.getState().jobData.actions;
  actions.setUserWatchlist(items, groups);
  rs.setCursorMs(docKey, remoteMs);
}
