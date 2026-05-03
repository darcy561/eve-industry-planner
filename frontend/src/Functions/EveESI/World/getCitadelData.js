import fetchWithCustomHeaders from "../fetchWithCustomHeaders";
import {
  LOCATION_RESOLUTION_STATUS,
  NO_ACCESS_LOCATION_NAME_PREFIX,
} from "../../Assets/assetLocationConstants";
import useUsersStore from "../../../Zustand/usersStore";
import {
  buildEsiStructureSubmission,
  queueCitadelStructureSubmission,
  resolveCitadelName,
} from "../../Endpoints/Pirivate/citadelNames";

async function getCitadelData(citadelID, character, config = {}) {
  try {
    if (!citadelID) {
      return {};
    }
    if (!character) {
      throw new Error("Input information is incomplete");
    }

    const { esiAccessToken } = character;

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
      `https://esi.evetech.net/universe/structures/${citadelID}/?datasource=tranquility`,
      {
        headers: {
          Authorization: `Bearer ${esiAccessToken}`,
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
    json.resolutionStatus = LOCATION_RESOLUTION_STATUS.RESOLVED;
    const shouldShare = Boolean(
      useUsersStore.getState().account?.shareCitadelNames
    );
    if (shouldShare) {
      const submission = buildEsiStructureSubmission(citadelID, json);
      if (submission) {
        queueCitadelStructureSubmission(submission);
      }
    }
    return json;
  } catch (err) {
    console.error(`Error retrieving citadel data: ${err}`);
    const fallback = await resolveCitadelName(citadelID);
    if (fallback?.name) {
      return {
        id: citadelID,
        name: fallback.name,
        source: "community",
        resolutionStatus: LOCATION_RESOLUTION_STATUS.COMMUNITY,
      };
    }
    return {
      id: citadelID,
      name: `${NO_ACCESS_LOCATION_NAME_PREFIX} - ${citadelID}`,
      resolutionStatus: LOCATION_RESOLUTION_STATUS.NO_ACCESS,
    };
  }
}

export default getCitadelData;
