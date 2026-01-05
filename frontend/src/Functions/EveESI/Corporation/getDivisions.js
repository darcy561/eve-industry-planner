import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getCorpDivisions(character, config = {}) {
  try {
    if (!character || !character.aToken || !character.corporation_id) {
      throw new Error("Character information is incomplete.");
    }
    const { aToken, corporation_id } = character;
    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal',
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: 'corporation',
      characterHash: config.characterHash,
      ...config
    };

    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/v2/corporations/${corporation_id}/divisions`,
      {
        headers: {
          Authorization: `Bearer ${aToken}`,
        },
      },
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
    console.error(`Error fetching corporation divisions: ${err}`);
    return {};
  }
}

export default getCorpDivisions;
