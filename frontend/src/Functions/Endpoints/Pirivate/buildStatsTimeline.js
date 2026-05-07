import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const BUILD_STATS_TIMELINE_PATH = "/api/v1/statistics/build-stats/timeline";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

function buildStatsTimelineURL(typeIDStr, opts = {}) {
  const params = new URLSearchParams();
  params.set("typeID", String(typeIDStr));
  const scope = opts.scope === "corp" ? "corp" : "personal";
  params.set("scope", scope);
  if (scope === "corp" && opts.corporationId != null && opts.corporationId !== "") {
    params.set("corporation_id", String(opts.corporationId));
  }
  return `${BUILD_STATS_TIMELINE_PATH}?${params.toString()}`;
}

/**
 * @param {string|number} typeID
 * @param {{ scope?: 'personal' | 'corp', corporationId?: string|number|null }} [opts]
 */
async function getBuildStatsTimelineByTypeID(typeID, opts = {}) {
  if (typeID == null || typeID === "") return null;
  const idStr = String(typeID).trim();
  if (!idStr || !/^\d+$/.test(idStr)) return null;

  try {
    const response = await requestWithPrivateHeaders(
      buildStatsTimelineURL(idStr, opts),
      { method: "GET" },
      {
        requestName: "getBuildStatsTimelineByTypeID",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default getBuildStatsTimelineByTypeID;
