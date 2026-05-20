/**
 * Gates SSO-style refreshes (ESI access via SSO or planner session rotate) using the
 * Tranquility status cache from React Query (`TRANQUILITY_SERVER_STATUS_QUERY_KEY`).
 *
 * Until the first successful `/status/` fetch, refreshes are allowed (same as the prior
 * `eveServerStatusUpdatedAt == null` behavior). After a successful fetch records offline,
 * staggered and interval refreshes defer.
 */

import {
  getTranquilityServerStatusFromCache,
  getTranquilityServerStatusQueryState,
} from "../../Hooks/React Query/tranquilityServerStatus.js";

/**
 * @param {Function} _get - Unused; kept so call sites can pass Zustand `get` unchanged.
 * @returns {boolean} True if planner/ESI refresh attempts should be skipped (Tranquility cached offline).
 */
export function shouldDeferAuthRefreshDueToTranquilityOffline(_get) {
  const qState = getTranquilityServerStatusQueryState();
  const data = getTranquilityServerStatusFromCache();
  if (data?.online === true) {
    return false;
  }
  if (qState?.status !== "success" || !qState.dataUpdatedAt) {
    return false;
  }
  return data?.online === false;
}
