import {
  characterJournalQuery,
  characterJournalQueryKey,
} from "../../React Query/Character/journal";
import {
  readCharacterCollection,
  useCharacterCollection,
} from "./characterCollection";

/**
 * Reads every linked character's cached wallet journal entries without triggering a fetch.
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function getAllCachedCharacterJournal(queryClient) {
  return readCharacterCollection(queryClient, characterJournalQueryKey);
}

/**
 * Fetches every linked character's wallet journal entries, once per character.
 *
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function useGetAllCharacterJournal() {
  return useCharacterCollection(characterJournalQuery);
}
