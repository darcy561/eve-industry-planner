import {
  characterHistoricMarketOrdersQuery,
  characterHistoricMarketOrdersQueryKey,
} from "../../React Query/Character/historicMarketOrders";
import {
  readCharacterCollection,
  useCharacterCollection,
} from "./characterCollection";

/**
 * Reads every linked character's cached closed market orders without triggering a fetch.
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function getAllCachedCharacterHistoricMarketOrders(queryClient) {
  return readCharacterCollection(
    queryClient,
    characterHistoricMarketOrdersQueryKey,
  );
}

/**
 * Fetches every linked character's closed market orders, once per character.
 *
 * @returns {import("./characterCollection").CharacterCollection}
 */
export function useGetAllCharacterHistoricMarketOrders() {
  return useCharacterCollection(characterHistoricMarketOrdersQuery);
}
