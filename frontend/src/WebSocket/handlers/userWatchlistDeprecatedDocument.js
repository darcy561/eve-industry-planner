/**
 * Change-stream handlers for `watchlist_deprecated` (legacy Firestore-shaped watchlist blob).
 */

import useUsersStore from "../../Zustand/usersStore.js";

/**
 * @param {{
 *   docID: string;
 *   docKey: string;
 *   rs: { setPosition: (k: string, position: number|null) => void };
 * }} ctx
 */
export function handleWatchlistDeprecatedDelete(ctx) {
  const { docKey, rs, position } = ctx;
  const actions = useUsersStore.getState().jobData.actions;
  actions.setUserWatchlist([], []);
  rs.setPosition(docKey, position);
}

/**
 * @param {{
 *   accountId: string;
 *   docKey: string;
 *   document: Record<string, unknown>;
 *   rs: { setPosition: (k: string, position: number|null) => void };
 * }} ctx
 */
export function handleWatchlistDeprecatedUpsert(ctx) {
  const { document, rs, docKey, position } = ctx;
  const items = Array.isArray(document?.items) ? document.items : [];
  const groups = Array.isArray(document?.groups) ? document.groups : [];
  const actions = useUsersStore.getState().jobData.actions;
  actions.setUserWatchlist(items, groups);
  rs.setPosition(docKey, position);
}
