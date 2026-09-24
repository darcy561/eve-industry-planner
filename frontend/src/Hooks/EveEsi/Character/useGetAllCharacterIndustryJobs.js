import {
  characterIndustryJobsQuery,
  characterIndustryJobsQueryKey,
} from "../../React Query/Character/industryJobs";
import {
  readCharacterCollection,
  useCharacterCollection,
} from "./characterCollection";

/**
 * Reads every linked character's cached industry jobs without triggering a fetch.
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function getAllCachedCharacterIndustryJobs(queryClient) {
  return readCharacterCollection(queryClient, characterIndustryJobsQueryKey);
}

/**
 * Fetches every linked character's industry jobs, once per character.
 *
 * @returns {import("./characterCollection").CharacterCollection}
 */
function useGetAllCharacterIndustryJobs() {
  return useCharacterCollection(characterIndustryJobsQuery);
}

export default useGetAllCharacterIndustryJobs;
