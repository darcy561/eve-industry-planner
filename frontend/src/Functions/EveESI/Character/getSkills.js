import skillsReference from "../../../RawData/bpSkills.json";
import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * Fetches character skills from EVE ESI API and maps them to skill reference data.
 * Returns a skills map with both active and trained skill levels for all blueprint skills.
 * 
 * @param {Object} params - Parameters object
 * @param {Object} params.character - Character object with esiAccessToken and CharacterID
 * @param {Object} [params.existingData={}] - Existing data for caching
 * @param {Object} [params.config={}] - Additional configuration options
 * @returns {Promise<Object>} Promise that resolves to skills map with etag
 * 
 * @example
 * const skills = await getCharacterSkills({
 *   character: { esiAccessToken: "token", CharacterID: 123456 },
 *   config: { characterHash: "hash" }
 * });
 * console.log(skills.data[3385].activeLevel); // Active skill level
 */
async function getCharacterSkills({
  character,
  existingData = {},
  config = {}
}) {
  try {
    if (!character || !character.esiAccessToken || !character.CharacterID) {
      throw new Error("Character information is incomplete.");
    }

    const { esiAccessToken, CharacterID } = character;
    const endpointURL = `https://esi.evetech.net/v4/characters/${CharacterID}/skills/?datasource=tranquility`;

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal',
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: 'character',
      characterHash: config.characterHash,
      ...config
    };

    const response = await fetchWithCustomHeaders(
      endpointURL,
      {
        headers: {
          "If-None-Match": existingData?.etag || "",
          Authorization: `Bearer ${esiAccessToken}`,
        },
      },
      enhancedConfig
    );

    // Helper to return default response structure
    const getDefaultResponse = (data = existingData.data || {}) => ({
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
        data: {},
        etag: response.headers.get("etag") || "",
      };
    }

    // Handle client errors (4xx)
    if (response.status >= 400 && response.status < 500) {
      // Permission errors - return empty data gracefully
      if (response.status === 403) {
        console.warn(`Access forbidden for character skills: ${CharacterID}`);
        return { data: {} };
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
    const responseData = await response.json();
    const skillsMap = {};

    Object.values(skillsReference).forEach((ref) => {
      const skill = responseData.skills.find((s) => s.skill_id === ref.id);

      skillsMap[ref.id] = {
        id: ref.id,
        activeLevel: skill?.active_skill_level || 0,
        trainedLevel: skill?.trained_skill_level || 0,
      };
    });

    return {
      data: skillsMap,
      etag,
    };

  } catch (err) {
    console.error(`Error fetching character skills: ${err}`);
    return { data: {} };
  }
}

export default getCharacterSkills;
