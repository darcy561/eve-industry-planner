import {
  characterTransactionsQuery,
  characterTransactionsQueryKey,
} from "../../React Query/Character/transactions";
import {
  readCharacterCollection,
  useCharacterCollection,
} from "./characterCollection";

/**
 * Reads every linked character's cached wallet transactions without triggering a fetch.
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function getAllCachedCharacterTransactions(queryClient) {
  return readCharacterCollection(queryClient, characterTransactionsQueryKey);
}

/**
 * Fetches every linked character's wallet transactions, once per character.
 *
 * @returns {import("./characterCollection").CharacterCollection}
 */
export default function useGetAllCharacterTransactions() {
  return useCharacterCollection(characterTransactionsQuery);
}
