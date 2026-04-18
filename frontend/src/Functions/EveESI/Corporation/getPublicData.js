import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getCorpPublicInfo(character, config = {}) {
  try {
    if (!character || !character.corporation_id) {
      throw new Error("Character information is incomplete.");
    }
    const { corporation_id } = character;
    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal',
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: 'universe',
      ...config
    };

    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/corporations/${corporation_id}/?datasource=tranquility`,
      {},
      enhancedConfig
    );

    // Handle no content responses (204)
    if (response.status === 204) {
      return {};
    }

    // Handle client errors (4xx)
    if (response.status >= 400 && response.status < 500) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    // Handle server errors (5xx)
    if (response.status >= 500) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    // Handle successful responses (2xx with body)
    const data = await response.json();

    return data;
  } catch (err) {
    console.error(`Error fetching public corporation data: ${err}`);
    return {};
  }
}

export default getCorpPublicInfo;
