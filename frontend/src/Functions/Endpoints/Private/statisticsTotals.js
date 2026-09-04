import requestWithPrivateHeaders from "./applyPrivateHeaders.js";
import { statisticsPath } from "./statisticsOwner.js";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

/**
 * @param {string|number} typeID
 * @returns {string}
 */
function totalsURL(typeID) {
  const path = statisticsPath("totals");
  if (!path) return null;
  const params = new URLSearchParams();
  params.set("typeID", String(typeID));
  return `${path}?${params.toString()}`;
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
    history: { buildCount: 0 },
    breakdown: {},
  };
}

/**
 * Fetches an account's lifetime totals for one item type.
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
 * @returns {Promise<Object|null>} Stats object (`jobType`, `typeID`, running totals, `history`, `breakdown`) or `null` if unauthenticated or request failed
 *
 * @example
 * const totals = await getAccountTotalsByTypeID(activeJob.itemID);
 * if (totals?.history?.buildCount) { ... }
 */
async function getAccountTotalsByTypeID(typeID) {
  if (typeID == null || typeID === "") {
    console.error("getAccountTotalsByTypeID: invalid typeID");
    return null;
  }

  const idStr = String(typeID).trim();
  if (!idStr || !/^\d+$/.test(idStr)) {
    console.error("getAccountTotalsByTypeID: typeID must be a non-negative integer");
    return null;
  }

  const url = totalsURL(idStr);
  if (!url) return null;

  try {
    const response = await requestWithPrivateHeaders(
      url,
      { method: "GET" },
      {
        requestName: "getAccountTotalsByTypeID",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `getAccountTotalsByTypeID: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    const payload = await response.json();
    const row = payload?.items?.[0];
    return row ?? emptyTotals(Number(idStr));
  } catch (error) {
    if (error?.message?.includes("Authentication required")) {
      console.error("getAccountTotalsByTypeID: authentication required");
    } else {
      console.error("getAccountTotalsByTypeID:", error);
    }
    return null;
  }
}

/**
 * The account's whole archive as one aggregate row.
 *
 * GET `/api/v1/statistics/{owner}/totals?summary=1`, with no `typeID`: the
 * endpoint rejects `typeID=0` rather than reading it as "everything", and the
 * unfiltered read returns a row per item type, each carrying an unbounded
 * per-job snapshot array. `summary=1` asks the server to fold them instead.
 *
 * @returns {Promise<Object|null>} The summed row, or null if the request failed
 */
export async function getAccountTotalsSummary() {
  const path = statisticsPath("totals");
  if (!path) return null;

  try {
    const response = await requestWithPrivateHeaders(
      `${path}?summary=1`,
      { method: "GET" },
      {
        requestName: "getAccountTotalsSummary",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );

    if (!response.ok) {
      console.error(
        `getAccountTotalsSummary: ${response.status} ${response.statusText}`,
        await response.text()
      );
      return null;
    }

    const payload = await response.json();
    return payload?.total ?? null;
  } catch (error) {
    console.error("getAccountTotalsSummary:", error);
    return null;
  }
}

export default getAccountTotalsByTypeID;
