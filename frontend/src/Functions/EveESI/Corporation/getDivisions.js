import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getCorpDivisions(character, config = {}) {
  try {
    if (!character || !character.esiAccessToken || !character.corporation_id) {
      throw new Error("Character information is incomplete.");
    }
    const { esiAccessToken, corporation_id } = character;
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
      `https://esi.evetech.net/corporations/${corporation_id}/divisions/?datasource=tranquility`,
      {
        headers: {
          Authorization: `Bearer ${esiAccessToken}`,
        },
      },
      enhancedConfig
    );

    // Handle no content responses (204)
    if (response.status === 204) {
      return {};
    }

    // Most characters cannot read corp divisions (ESI returns 403); treat as optional.
    if (response.status === 403) {
      return {};
    }

    // Handle other client errors (4xx)
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
    console.error(`Error fetching corporation divisions:`, err);
    return {};
  }
}

export default getCorpDivisions;
