import {
  characterAssetsQuery,
  characterAssetsQueryKey,
} from "../../React Query/Character/assets";
import {
  readCharacterCollection,
  useCharacterCollection,
} from "./characterCollection";

/**
 * Reads every linked character's cached assets without triggering a fetch.
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function getAllCachedCharacterAssets(queryClient) {
  return readCharacterCollection(queryClient, characterAssetsQueryKey);
}

/**
 * Fetches every linked character's assets, once per character.
 *
 * Assets are the one collection a reader opts into rather than the app fetching
 * it for them, so the caller says when the queries may run.
 *
 * @param {boolean} [enabled] - false holds every character's query off
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function useGetAllCharacterAssets(enabled = true) {
  return useCharacterCollection(characterAssetsQuery, { enabled });
}
