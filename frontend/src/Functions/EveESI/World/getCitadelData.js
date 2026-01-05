import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getCitadelData(citadelID, character, config = {}) {
  try {
    if (!citadelID) {
      return {};
    }
    if (!character) {
      throw new Error("Input information is incomplete");
    }

    const { aToken } = character;

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal',
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: 'universe',
      characterHash: config.characterHash,
      ...config
    };

    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/v2/universe/structures/${citadelID}/`,
      {
        headers: {
          Authorization: `Bearer ${aToken}`,
        },
      },
      enhancedConfig
    );
    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }
    const json = await response.json();
    json.id = citadelID;
    return json;
  } catch (err) {
    console.error(`Error retrieving citadel data: ${err}`);
    return {
      id: citadelID,
      name: `No Access To Location - ${citadelID}`,
      unResolvedLocation: true,
    };
  }
}

export default getCitadelData;
