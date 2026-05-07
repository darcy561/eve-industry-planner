import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const ROLLUP_PATH = "/api/v1/statistics/build-stats/rollup";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

/**
 * Append period query fields (same priority as API: years → from/to → year+month → year only).
 * @param {URLSearchParams} params
 * @param {object} period
 * @param {number[]} [period.years]
 * @param {number} [period.fromYear]
 * @param {number} [period.fromMonth]
 * @param {number} [period.toYear]
 * @param {number} [period.toMonth]
 * @param {number} [period.year]
 * @param {number} [period.month]
 */
export function appendBuildStatsRollupPeriod(params, period) {
  if (period.years?.length) {
    params.set("years", period.years.join(","));
    return;
  }
  if (
    period.fromYear != null &&
    period.fromMonth != null &&
    period.toYear != null &&
    period.toMonth != null
  ) {
    params.set("fromYear", String(period.fromYear));
    params.set("fromMonth", String(period.fromMonth));
    params.set("toYear", String(period.toYear));
    params.set("toMonth", String(period.toMonth));
    return;
  }
  if (period.year != null && period.month != null) {
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    return;
  }
  if (period.year != null) {
    params.set("year", String(period.year));
    return;
  }
  throw new Error("buildStatsRollup: missing period (years, from/to, year+month, or year)");
}

/**
 * Personal-scope rollup over user_archived_job_stats (all types or one typeID).
 * @param {{ typeID?: string|number|null, period: object }} opts
 * @returns {Promise<{ period: object, typeID?: number, totals: object, byType?: object[] } | null>}
 */
async function getPersonalBuildStatsRollup(opts) {
  if (!opts?.period) return null;
  const params = new URLSearchParams();
  if (opts.typeID != null && opts.typeID !== "") {
    const id = String(opts.typeID).trim();
    if (!/^\d+$/.test(id)) return null;
    params.set("typeID", id);
  }
  try {
    appendBuildStatsRollupPeriod(params, opts.period);
  } catch {
    return null;
  }
  try {
    const response = await requestWithPrivateHeaders(
      `${ROLLUP_PATH}?${params.toString()}`,
      { method: "GET" },
      {
        requestName: "getPersonalBuildStatsRollup",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default getPersonalBuildStatsRollup;
