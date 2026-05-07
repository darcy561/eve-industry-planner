import requestWithPrivateHeaders from "./applyPrivateHeaders.js";
import { appendBuildStatsRollupPeriod } from "./buildStatsRollup.js";

const CORP_ROLLUP_PATH = "/api/v1/statistics/corp-build-stats/rollup";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

/**
 * Corporation-scope rollup over corp_archived_job_stats (JWT corp claim required).
 * @param {{ corporationID: string|number, typeID?: string|number|null, period: object }} opts
 * @returns {Promise<{ period: object, typeID?: number, totals: object, byType?: object[] } | null>}
 */
async function getCorpBuildStatsRollup(opts) {
  if (!opts?.period || opts.corporationID == null || opts.corporationID === "") {
    return null;
  }
  const corpStr = String(opts.corporationID).trim();
  if (!/^\d+$/.test(corpStr)) return null;

  const params = new URLSearchParams();
  params.set("corporation_id", corpStr);
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
      `${CORP_ROLLUP_PATH}?${params.toString()}`,
      { method: "GET" },
      {
        requestName: "getCorpBuildStatsRollup",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default getCorpBuildStatsRollup;
