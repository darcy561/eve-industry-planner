import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getAssetLocationNames(
  character,
  locationIDs,
  scope = "character"
) {
  try {
    if (!character || !locationIDs) {
      throw new Error("Input information is incomplete.");
    }

    if (locationIDs instanceof Set) {
      locationIDs = [...locationIDs];
    } else if (!Array.isArray(locationIDs)) {
      throw new Error("locationIDs must be an array or a set.");
    }

    if (locationIDs.length === 0) {
      return new Map();
    }

    const { CharacterID, corporation_id, esiAccessToken } = character;

    const chunkSize = 1000;
    const namesMap = new Map();
    const selectedURLDestination =
      scope === "character"
        ? `v1/characters/${CharacterID}`
        : `v1/corporations/${corporation_id}`;

    for (let i = 0; i < locationIDs.length; i += chunkSize) {
      const chunk = locationIDs.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      const response = await fetchWithCustomHeaders(
        `https://esi.evetech.net/${selectedURLDestination}/assets/names/?datasource=tranquility`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${esiAccessToken}`,
          },
          body: JSON.stringify(chunk),
        }
      );

      if (!response.ok) {
        throw new Error(
          `API request failed with status ${response.status}: ${response.statusText}`
        );
      }

      const json = await response.json();

      for (let a of json) {
        if (a.name !== "None") {
          namesMap.set(a.item_id, a);
        }
      }
    }
    return namesMap;
  } catch (err) {
    console.error(`Error retrieving character asset location names: ${err}`);
    return new Map();
  }
}

export default getAssetLocationNames;
