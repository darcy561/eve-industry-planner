import {
  characterSkillsQuery,
  characterSkillsQueryKey,
} from "../../React Query/Character/skills";
import {
  readCharacterCollection,
  useCharacterCollection,
} from "./characterCollection";

/**
 * A character's trained skills, which arrive as a map keyed by skill id rather
 * than as a list of rows.
 *
 * @param {Object|undefined} payload
 * @returns {Object}
 */
const skillsOf = (payload) => payload ?? {};

/**
 * Reads every linked character's cached skills without triggering a fetch.
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function getAllCachedCharacterSkills(queryClient) {
  return readCharacterCollection(queryClient, characterSkillsQueryKey, {
    rows: skillsOf,
  });
}

/**
 * Fetches every linked character's skills, once per character.
 *
 * @returns {import("./characterCollection").CharacterCollection}
 */
export default function useGetAllCharacterSkills() {
  return useCharacterCollection(characterSkillsQuery, { rows: skillsOf });
}
