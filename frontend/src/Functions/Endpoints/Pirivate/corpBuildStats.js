import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const CORP_BUILD_STATS_PATH = "/api/v1/statistics/corp-build-stats";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

function corpBuildStatsURL(corporationID, typeID) {
  const params = new URLSearchParams();
  params.set("corporation_id", String(corporationID));
  params.set("typeID", String(typeID));
  return `${CORP_BUILD_STATS_PATH}?${params.toString()}`;
}

async function getCorpBuildStats(corporationID, typeID) {
  if (!corporationID || !typeID) return null;
  const corpStr = String(corporationID).trim();
  const typeStr = String(typeID).trim();
  if (!/^\d+$/.test(corpStr) || !/^\d+$/.test(typeStr)) return null;

  try {
    const response = await requestWithPrivateHeaders(
      corpBuildStatsURL(corpStr, typeStr),
      { method: "GET" },
      {
        requestName: "getCorpBuildStats",
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default getCorpBuildStats;
