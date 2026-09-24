import {
  characterMarketOrdersQuery,
  characterMarketOrdersQueryKey,
} from "../../React Query/Character/marketOrders";
import {
  readCharacterCollection,
  useCharacterCollection,
} from "./characterCollection";

/**
 * Reads every linked character's cached open market orders without triggering a fetch.
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function getAllCachedCharacterMarketOrders(queryClient) {
  return readCharacterCollection(queryClient, characterMarketOrdersQueryKey);
}

/**
 * Fetches every linked character's open market orders, once per character.
 *
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function useGetAllCharacterMarketOrders() {
  return useCharacterCollection(characterMarketOrdersQuery);
}
