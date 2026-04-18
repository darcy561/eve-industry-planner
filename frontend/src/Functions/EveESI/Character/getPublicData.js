import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getCharacterPublicInfo(characterID) {
  try {
    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/characters/${characterID}/?datasource=tranquility`
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
    return await response.json();
  } catch (err) {
    console.error(`Error fetching character data: ${err}`);
    throw err;
  }
}

export default getCharacterPublicInfo;
