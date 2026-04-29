/**
 * Legacy Firestore-shaped watchlist: `user_watchlist_deprecated` (private API).
 */
import useUsersStore from "../../../Zustand/usersStore.js";
import { requestWithPrivateHeaders } from "./applyPrivateHeaders.js";

/** Must match `mongocore.CollectionUserWatchlistDeprecated` / changestream `collection` field. */
export const USER_WATCHLIST_DEPRECATED_COLLECTION = "user_watchlist_deprecated";

/**
 * Fetches watchlist groups/items for the account and applies them to Zustand.
 * @returns {Promise<void>}
 */
export async function fetchWatchlistDeprecatedFromApi() {
  const url = new URL(
    "/api/v1/user/watchlist",
    window.location.origin
  );
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    { requestName: "getWatchlistDeprecated" }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET /api/v1/user/watchlist-deprecated failed: ${res.status} ${text || res.statusText}`
    );
  }
  const data = await res.json();
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const items = Array.isArray(data?.items) ? data.items : [];
  useUsersStore.getState().jobData.actions.setUserWatchlist(items, groups);
}

/**
 * @param {unknown[]} groups
 * @param {unknown[]} items
 * @returns {Promise<void>}
 */
export async function putWatchlistDeprecatedToApi(groups, items) {
  const res = await requestWithPrivateHeaders(
    "/api/v1/user/watchlist",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups, items }),
    },
    { requestName: "putWatchlistDeprecated" }
  );
  if (res.status === 204 || res.status === 200) return;
  const text = await res.text().catch(() => "");
  throw new Error(
    `PUT /api/v1/user/watchlist-deprecated failed: ${res.status} ${text || res.statusText}`
  );
}
