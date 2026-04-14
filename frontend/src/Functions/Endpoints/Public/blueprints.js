import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";

/**
 * Retrieves blueprint recipe data from the public v1 API.
 * Supports both single-blueprint and multi-blueprint requests.
 *
 * GET  /api/v1/blueprints/:blueprintID
 * POST /api/v1/blueprints { idArray: number[] }
 *
 * Uses `fetchWithPublicHeaders` retries (408 / 429 / 5xx including 503). Non-retriable: 400, 404, 405 — see `BlueprintsHandler` in `services/api/v1endpoints/blueprints.go`.
 *
 * @param {string|number|Array<string|number>} blueprintRequests - Blueprint ID or array of blueprint IDs
 * @returns {Promise<Object|Array|null>} Single blueprint object, array of blueprints, or null/[] on failure
 */
async function fetchBlueprints(blueprintRequests) {
  const isSingleBlueprint =
    !Array.isArray(blueprintRequests) || blueprintRequests.length === 1;

  try {
    const blueprintID = Array.isArray(blueprintRequests)
      ? blueprintRequests[0]
      : blueprintRequests;

    const URL = isSingleBlueprint
      ? `/api/v1/blueprints/${blueprintID}`
      : "/api/v1/blueprints";

    const response = await fetchWithPublicHeaders(
      URL,
      {
        method: isSingleBlueprint ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: !isSingleBlueprint
          ? JSON.stringify({
              idArray: blueprintRequests.map((id) => Number(id)),
            })
          : undefined,
      },
      { requestName: "fetchBlueprints" }
    );

    if (!response.ok) {
      throw new Error(`Error retrieving blueprints: ${response.statusText}`);
    }

    const result = await response.json();

    if (Array.isArray(blueprintRequests) && blueprintRequests.length === 1) {
      return [result];
    }

    return result;
  } catch (error) {
    console.error("Error fetching blueprints:", error);
    return isSingleBlueprint ? null : [];
  }
}

export default fetchBlueprints;
