import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const TOTALS_PATH = "/api/v1/statistics/account/totals";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

/**
 * @param {string|number} typeID
 * @returns {string}
 */
function totalsURL(typeID) {
  const params = new URLSearchParams();
  params.set("typeID", String(typeID));
  return `${TOTALS_PATH}?${params.toString()}`;
}

/**
 * Zeroed aggregate for a type the account has never built.
 *
 * The endpoint returns an empty `items` list rather than a placeholder row,
 * because absent and zero are different answers and only a caller knows which
 * its view should show. Callers here have always been handed a zeroed row, so
 * that shape is produced at this boundary rather than pushed into the panels.
 *
 * @param {number} typeID
 */
function emptyTotals(typeID) {
  return {
    jobType: 0,
    typeID,
    totalJobs: 0,
    itemBuildCount: 0,
    buildCostTotal: 0,
    brokersFeeTotal: 0,
    transactionFeeTotal: 0,
    jobCostTotal: 0,
    salesTotal: 0,
    profitLoss: 0,
    dataSnapshots: [],
  };
}

/**
 * Fetches lifetime build statistics for one item type.
 *
 * GET `/api/v1/statistics/account/totals?typeID=…` (private; the account comes from the
 * session cookie and is never sent). Retries **408 / 429 / 5xx** only (via
 * `requestWithPrivateHeaders`); **401**, **403**, etc. are not retried.
 *
 * The endpoint answers with `{ typeID, items: [...] }` because it also serves the
 * whole-account read. This unwraps the single row a caller asked for, and returns a
 * zeroed aggregate when the account has never built that type, so the shape callers
 * receive is unchanged.
 *
 * @param {string|number} typeID - EVE item type ID
 * @returns {Promise<Object|null>} Stats object (`jobType`, `typeID`, running totals, `dataSnapshots`) or `null` if unauthenticated or request failed
 *
 * @example
 * const stats = await getBuildStatsByTypeID(activeJob.itemID);
 * if (stats?.dataSnapshots?.length) { ... }
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
      totalsURL(idStr),
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

    const payload = await response.json();
    const row = payload?.items?.[0];
    return row ?? emptyTotals(Number(idStr));
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
