import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const BUILD_STATS_PATH = "/api/v1/statistics/build-stats";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

/**
 * @param {string|number} typeID
 * @returns {string}
 */
function buildStatsURL(typeID) {
  const params = new URLSearchParams();
  params.set("typeID", String(typeID));
  return `${BUILD_STATS_PATH}?${params.toString()}`;
}

/**
 * Fetches aggregated build statistics for one item type from Mongo (`build_stats`).
 * Response shape is totals-only (no `dataSnapshots`).
 *
 * GET `/api/v1/statistics/build-stats?typeID=…` (private JWT). Retries **408 / 429 / 5xx** only
 * (via `requestWithPrivateHeaders`); **401**, **403**, etc. are not retried. Missing Mongo rows return **200**
 * with a zeroed aggregate (not 404).
 *
 * @param {string|number} typeID - EVE item type ID
 * @returns {Promise<Object|null>} Stats object (`jobType`, `typeID`, running totals) or `null` if unauthenticated or request failed
 *
 * @example
 * const stats = await getBuildStatsByTypeID(activeJob.itemID);
 * if ((stats?.totalJobs ?? 0) > 0) { ... }
 */
async function getBuildStatsByTypeID(typeID) {
  if (typeID == null || typeID === "") {
    console.error("getBuildStatsByTypeID: invalid typeID");
    return null;
  }

  const idStr = String(typeID).trim();
  if (!idStr || !/^\d+$/.test(idStr)) {
    console.error("getBuildStatsByTypeID: typeID must be a non-negative integer");
    return null;
  }

  try {
    const response = await requestWithPrivateHeaders(
      buildStatsURL(idStr),
      { method: "GET" },
      {
        requestName: "getBuildStatsByTypeID",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `getBuildStatsByTypeID: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error?.message?.includes("Authentication required")) {
      console.error("getBuildStatsByTypeID: authentication required");
    } else {
      console.error("getBuildStatsByTypeID:", error);
    }
    return null;
  }
}

export default getBuildStatsByTypeID;
