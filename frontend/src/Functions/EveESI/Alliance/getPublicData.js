import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * EVE's public information about an alliance — its name, ticker and executor.
 *
 * The alliance counterpart of the corporation's public fetch, on the same rate-limit group and the
 * same error handling: an alliance the server will not describe leaves the account with an
 * unnamed alliance rather than a failed login.
 *
 * @param {number|string} allianceID
 * @param {object} [config] - overrides for the request's rate-limit handling
 * @returns {Promise<object>} the alliance's public data, or `{}` when it cannot be had
 */
async function getAlliancePublicInfo(allianceID, config = {}) {
  try {
    if (!allianceID) {
      throw new Error("An alliance id is required.");
    }

    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/alliances/${allianceID}/?datasource=tranquility`,
      {},
      {
        priority: "normal",
        batchable: true,
        maxRetries: 3,
        useQueue: true,
        group: "universe",
        ...config,
      },
    );

    if (response.status === 204) return {};

    if (response.status >= 400) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error fetching public alliance data: ${err}`);
    return {};
  }
}

export default getAlliancePublicInfo;
