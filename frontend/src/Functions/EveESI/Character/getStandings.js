import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getCharacterStandings({
  character,
  existingData = {},
}) {
  try {
    if (!character || !character.aToken || !character.CharacterID) {
      throw new Error("Character information is incomplete.");
    }

    const { aToken, CharacterID } = character;
    const endpointURL = `https://esi.evetech.net/v2/characters/${CharacterID}/standings/?datasource=tranquility`;

    const response = await fetchWithCustomHeaders(endpointURL, {
      headers: {
        "If-None-Match": existingData?.etag || "",
        Authorization: `Bearer ${aToken}`,
      },
    });

    // Helper to return default response structure
    const getDefaultResponse = (data = existingData.data || []) => ({
      data,
      etag: existingData.etag || "",
    });

    // Handle cached/not modified responses
    if (response.status === 304) {
      return getDefaultResponse();
    }

    // Handle no content responses (204)
    if (response.status === 204) {
      return {
        data: [],
        etag: response.headers.get("etag") || "",
      };
    }

    // Handle client errors (4xx)
    if (response.status >= 400 && response.status < 500) {
      // Permission errors - return empty data gracefully
      if (response.status === 403) {
        console.warn(`Access forbidden for character standings: ${CharacterID}`);
        return { data: [] };
      }
      // Other client errors - throw
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
    const etag = response.headers.get("etag");
    const data = await response.json();

    return {
      data,
      etag,
    };

  } catch (err) {
    console.error(`Error fetching character standings: ${err}`);
    return { data: [] };
  }
}

export default getCharacterStandings;
