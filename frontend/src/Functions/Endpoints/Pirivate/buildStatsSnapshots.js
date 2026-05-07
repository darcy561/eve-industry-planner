import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const BUILD_STATS_SNAPSHOTS_PATH = "/api/v1/statistics/build-stats/snapshots";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

/**
 * @param {string} typeIDStr
 * @param {{ scope?: 'personal' | 'corp', corporationId?: string|number|null }} [opts]
 */
function buildStatsSnapshotsURL(typeIDStr, opts = {}) {
  const params = new URLSearchParams();
  params.set("typeID", String(typeIDStr));
  const scope = opts.scope === "corp" ? "corp" : "personal";
  params.set("scope", scope);
  if (scope === "corp" && opts.corporationId != null && opts.corporationId !== "") {
    params.set("corporation_id", String(opts.corporationId));
  }
  return `${BUILD_STATS_SNAPSHOTS_PATH}?${params.toString()}`;
}

/**
 * Per-archived-job snapshots for one item type — personal (`user_archived_job_stats`) or corp (`corp_archived_job_stats`).
 * @param {string|number} typeID
 * @param {{ scope?: 'personal' | 'corp', corporationId?: string|number|null }} [opts]
 * @returns {Promise<{ snapshots: Array<Object> } | null>}
 */
async function getBuildStatsSnapshotsByTypeID(typeID, opts = {}) {
  if (typeID == null || typeID === "") return null;
  const idStr = String(typeID).trim();
  if (!idStr || !/^\d+$/.test(idStr)) return null;

  try {
    const response = await requestWithPrivateHeaders(
      buildStatsSnapshotsURL(idStr, opts),
      { method: "GET" },
      {
        requestName: "getBuildStatsSnapshotsByTypeID",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default getBuildStatsSnapshotsByTypeID;
