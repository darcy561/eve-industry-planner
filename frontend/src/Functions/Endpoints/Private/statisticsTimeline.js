import requestWithPrivateHeaders from "./applyPrivateHeaders.js";
import { statisticsPath } from "./statisticsOwner.js";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

/**
 * A calendar month as the API accepts it, `YYYY-MM`.
 *
 * The format matches the month key the documents are stored under, so a month a
 * caller names is the month the rows were filed against.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCalendarMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * Builds a query string for the timeline views.
 *
 * `from` and `to` travel together or not at all: the API rejects half a range
 * rather than filling in the missing bound, because a silently narrowed window
 * is indistinguishable from an account with little history.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number}} [options]
 * @returns {URLSearchParams}
 */
function rangeParams({ from, to, range, typeID, includeProductionChain } = {}) {
  const params = new URLSearchParams();
  // Everything the account has. Sent instead of a range rather than alongside
  // one: the server refuses the two together, since a bounded window and "all of
  // it" are different requests.
  if (range === "all") {
    params.set("range", "all");
  } else if (from && to) {
    params.set("from", from);
    params.set("to", to);
  }
  if (typeID != null && typeID !== "") {
    params.set("typeID", String(typeID));
  }
  // The server counts chain output only for a request scoped to one item, so
  // sending it unscoped would return figures the caller did not ask for.
  if (includeProductionChain && typeID != null && typeID !== "") {
    params.set("includeProductionChain", "true");
  }
  return params;
}

/**
 * Reads a private statistics endpoint and returns its parsed body.
 *
 * Returns `null` on any failure, matching the other private endpoint modules:
 * these feed panels that render an empty state rather than surfacing an error,
 * and a rejected range is a caller bug rather than something to retry.
 *
 * @param {string} url
 * @param {string} requestName
 * @returns {Promise<Object|null>}
 */
async function readStatistics(url, requestName) {
  try {
    const response = await requestWithPrivateHeaders(
      url,
      { method: "GET" },
      {
        requestName,
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `${requestName}: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error?.message?.includes("Authentication required")) {
      console.error(`${requestName}: authentication required`);
    } else {
      console.error(`${requestName}:`, error);
    }
    return null;
  }
}

/**
 * Monthly figures for the signed-in account, summed across every item type
 * unless `typeID` narrows it.
 *
 * GET `/api/v1/statistics/{owner}/timeline` (private). The path names the owner
 * and the session decides whether it may be read.
 *
 * Omitting the range gives the current month and the one before it — the
 * month-on-month comparison — and the response reports `period.defaulted` so a
 * caller can tell that window from one it asked for. Each month carries
 * `complete`, false for the month still in progress.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number}} [options]
 * @returns {Promise<{period: Object, totals: Object, months: Object[]}|null>}
 *
 * @example
 * const timeline = await getAccountTimeline();
 * const [previous, current] = timeline?.months ?? [];
 */
export async function getAccountTimeline(options = {}) {
  const { from, to } = options;
  if ((from && !to) || (to && !from)) {
    console.error("getAccountTimeline: from and to must be given together");
    return null;
  }
  if ((from && !isCalendarMonth(from)) || (to && !isCalendarMonth(to))) {
    console.error("getAccountTimeline: from and to must be YYYY-MM");
    return null;
  }

  const path = statisticsPath("timeline");
  if (!path) return null;

  const params = rangeParams(options);
  const query = params.toString();
  return readStatistics(query ? `${path}?${query}` : path, "getAccountTimeline");
}

/**
 * The per-item breakdown of the same window, ranked and paged.
 *
 * GET `/api/v1/statistics/{owner}/timeline/items` (private).
 *
 * Ranking happens on the server: ordering item types by profit needs every type
 * in the window before a page can be taken, so `sort` is a request parameter
 * rather than something to apply to the returned array. `paging.totalItems` is
 * every item type in the window, not the page length.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number, sort?: string, order?: "asc"|"desc", limit?: number, offset?: number}} [options]
 * @returns {Promise<{period: Object, paging: Object, items: Object[]}|null>}
 */
export async function getAccountTimelineItems(options = {}) {
  const { from, to, sort, order, limit, offset } = options;
  if ((from && !to) || (to && !from)) {
    console.error("getAccountTimelineItems: from and to must be given together");
    return null;
  }
  if ((from && !isCalendarMonth(from)) || (to && !isCalendarMonth(to))) {
    console.error("getAccountTimelineItems: from and to must be YYYY-MM");
    return null;
  }

  const path = statisticsPath("timeline/items");
  if (!path) return null;

  const params = rangeParams(options);
  if (sort) params.set("sort", String(sort));
  if (order) params.set("order", String(order));
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));

  const query = params.toString();
  return readStatistics(
    query ? `${path}?${query}` : path,
    "getAccountTimelineItems"
  );
}
