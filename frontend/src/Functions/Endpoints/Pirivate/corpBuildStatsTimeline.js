import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const CORP_BUILD_STATS_TIMELINE_PATH = "/api/v1/statistics/corp-build-stats/timeline";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

function corpBuildStatsTimelineURL(corporationID, typeID) {
  const params = new URLSearchParams();
  params.set("corporation_id", String(corporationID));
  params.set("typeID", String(typeID));
  return `${CORP_BUILD_STATS_TIMELINE_PATH}?${params.toString()}`;
}

async function getCorpBuildStatsTimeline(corporationID, typeID) {
  if (!corporationID || !typeID) return null;
  const corpStr = String(corporationID).trim();
  const typeStr = String(typeID).trim();
  if (!/^\d+$/.test(corpStr) || !/^\d+$/.test(typeStr)) return null;

  try {
    const response = await requestWithPrivateHeaders(
      corpBuildStatsTimelineURL(corpStr, typeStr),
      { method: "GET" },
      {
        requestName: "getCorpBuildStatsTimeline",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default getCorpBuildStatsTimeline;
