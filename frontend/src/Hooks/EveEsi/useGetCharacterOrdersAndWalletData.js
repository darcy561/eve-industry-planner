import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../Zustand/usersStore";
import { characterJournalQuery, characterJournalQueryKey } from "../React Query/Character/journal";
import { characterTransactionsQuery, characterTransactionsQueryKey } from "../React Query/Character/transactions";
import { characterMarketOrdersQuery, characterMarketOrdersQueryKey } from "../React Query/Character/marketOrders";
import { characterHistoricMarketOrdersQuery, characterHistoricMarketOrdersQueryKey } from "../React Query/Character/historicMarketOrders";
import { corporationMarketOrdersQuery, corporationMarketOrdersQueryKey } from "../React Query/Corporation/marketOrders";
import { corporationHistoricMarketOrdersQuery, corporationHistoricMarketOrdersQueryKey } from "../React Query/Corporation/historicMarketOrders";
import { corporationJournalQuery, corporationJournalQueryKey } from "../React Query/Corporation/journal";
import { corporationTransactionsQuery, corporationTransactionsQueryKey } from "../React Query/Corporation/transactions";
import { isQueryStateLoading } from "./queryLoadingState";

/**
 * Empty character data model template for initialising character data structures.
 * Contains empty arrays and eTags objects for all character and corporation data types.
 * @constant {Object}
 * @private
 */
const emptyCharacterDataModel = {
  [characterMarketOrdersQueryKey]: { data: [], eTags: {} },
  [characterHistoricMarketOrdersQueryKey]: { data: [], eTags: {} },
  [characterTransactionsQueryKey]: { data: [], eTags: {} },
  [characterJournalQueryKey]: { data: [], eTags: {} },
  [corporationMarketOrdersQueryKey]: { data: [], eTags: {} },
  [corporationHistoricMarketOrdersQueryKey]: { data: [], eTags: {} },
  [corporationTransactionsQueryKey]: { data: [], eTags: {} },
  [corporationJournalQueryKey]: { data: [], eTags: {} },
};

/**
 * Custom hook that fetches character orders and wallet data for specified characters.
 * 
 * This hook provides comprehensive financial data fetching for EVE Online characters:
 * - Character market orders (active and historic)
 * - Character transactions and journal entries
 * - Corporation market orders (active and historic)
 * - Corporation transactions and journal entries
 * - Multi-character support with parallel data fetching
 * - Structured data organisation by character hash
 * - ETag support for efficient data updates
 * 
 * The fetching process:
 * 1. Validates character hashes and finds corresponding user objects
 * 2. Creates queries for all required data types (8 queries per character)
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Organises data by character hash with structured data models
 * 5. Handles pagination and data flattening for consistent access
 * 
 * @param {string|Array<string>} characterHashes - Character hash(es) to fetch data for
 * @returns {Object} Object containing character orders and wallet data
 * @returns {Object} returns.data - Object with character hashes as keys and data structures as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CharacterDataManager() {
 *   const { data, isLoading, isError, error } = useGetCharacterOrdersAndWalletData(characterHash);
 * 
 *   if (isLoading) return <div>Loading character data...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   const characterData = data[characterHash];
 *   return <div>Market Orders: {characterData.characterMarketOrders.data.length}</div>;
 * }
 */
export function useGetCharacterOrdersAndWalletData(characterHashes) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  // Convert single hash to array for consistent handling
  const hashes = Array.isArray(characterHashes)
    ? characterHashes
    : [characterHashes];

  // Get all requested characters
  const requestedCharacters = hashes
    .map((hash) =>
      useUsersStore.getState().account.actions.findCharacterByHash(hash)
    )
    .filter(Boolean);

  if (!requestedCharacters.length) {
    return {
      data: {},
      isLoading: false,
      isError: false,
      error: null,
    };
  }

  // Define the required queries for each character
  const requiredQueries = [
    characterMarketOrdersQuery,
    characterHistoricMarketOrdersQuery,
    characterTransactionsQuery,
    characterJournalQuery,
    corporationMarketOrdersQuery,
    corporationHistoricMarketOrdersQuery,
    corporationTransactionsQuery,
    corporationJournalQuery,
  ];

  // Create query configs for all characters and functions
  const queryConfigs = requestedCharacters.flatMap((character) =>
    requiredQueries.map((queryFunction) => queryFunction(character.CharacterHash))
  );

  const allQueries = useQueries({
    queries: queryConfigs,
  });

  // Initialise data structure for all characters
  const characterData = requestedCharacters.reduce((acc, character) => {
    acc[character.CharacterHash] = { ...emptyCharacterDataModel };
    return acc;
  }, {});

  // Process queries and populate data
  requestedCharacters.forEach((character, charIndex) => {
    const queriesForCharacter = allQueries.slice(
      charIndex * requiredQueries.length,
      (charIndex + 1) * requiredQueries.length
    );

    queriesForCharacter.forEach((query, funcIndex) => {
      if (query?.data) {
        const dataKey = getDataKeyFromQueryIndex(funcIndex);
        // Extract data from the pages structure that the existing queries return
        const flatData = query.data.pages?.flatMap(page => page.data || []) || [];
        characterData[character.CharacterHash][dataKey] = {
          data: flatData,
          eTags: {}, // The existing queries don't use eTags, so we'll keep this empty
        };
      }
    });
  });

  return {
    data: characterData,
    isLoading: allQueries.some((query) => query?.isLoading),
    isError: allQueries.some((query) => query?.isError),
    error: allQueries.find((query) => query?.isError)?.error,
  };
}

/**
 * Helper function to map query index to data key for character orders and wallet data.
 * Maps the index of a query function to its corresponding data key constant.
 * 
 * @param {number} index - Index of the query function in the requiredQueries array
 * @returns {string} Corresponding data key constant
 * 
 * @private
 */
function getDataKeyFromQueryIndex(index) {
  const dataKeys = [
    characterJournalQueryKey,
    characterTransactionsQueryKey, 
    characterMarketOrdersQueryKey,
    characterHistoricMarketOrdersQueryKey,
    corporationMarketOrdersQueryKey,
    corporationHistoricMarketOrdersQueryKey,
    corporationTransactionsQueryKey,
    corporationJournalQueryKey,
  ];
  return dataKeys[index];
}

/**
 * Retrieves cached character orders and wallet data from React Query cache.
 * 
 * This function provides access to cached character financial data without triggering new queries:
 * - Checks loading states for all character and corporation queries
 * - Extracts cached data from React Query cache
 * - Organises data by character hash with structured data models
 * - Handles pagination and data flattening for consistent access
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Validates character hashes and finds corresponding user objects
 * 2. Checks query states for all required data types
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Organises data by character hash with structured models
 * 
 * @param {string|Array<string>} characterHashes - Character hash(es) to get cached data for
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character orders and wallet data
 * @returns {Object} returns.data - Object with character hashes as keys and data structures as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedData = fetchCachedCharacterOrdersAndWalletData(characterHash, queryClient);
 * if (!cachedData.isLoading && !cachedData.isError) {
 *   const characterData = cachedData.data[characterHash];
 *   console.log(`Cached orders: ${characterData.characterMarketOrders.data.length}`);
 * }
 */
export function fetchCachedCharacterOrdersAndWalletData(
  characterHashes,
  queryClient
) {
  const hashes = Array.isArray(characterHashes)
    ? characterHashes
    : [characterHashes];
  const requestedCharacters = hashes
    .map((hash) =>
      useUsersStore.getState().account.actions.findCharacterByHash(hash)
    )
    .filter(Boolean);

  if (!requestedCharacters.length) {
    return {
      data: {},
      isLoading: false,
      isError: false,
    };
  }

  const characterData = requestedCharacters.reduce((acc, character) => {
    acc[character.CharacterHash] = { ...emptyCharacterDataModel };
    return acc;
  }, {});

  // Define the required queries for each character
  const requiredQueries = [
    characterJournalQuery,
    characterTransactionsQuery,
    characterMarketOrdersQuery,
    characterHistoricMarketOrdersQuery,
    corporationMarketOrdersQuery,
    corporationHistoricMarketOrdersQuery,
    corporationTransactionsQuery,
    corporationJournalQuery,
  ];

  const isLoading = requestedCharacters.some((character) =>
    requiredQueries.some((queryFunction) => {
      const queryState = queryClient.getQueryState(queryFunction(character.CharacterHash).queryKey);
      return isQueryStateLoading(queryState);
    })
  );

  if (isLoading) {
    return {
      data: characterData,
      isLoading: true,
      isError: false,
      error: null,
    };
  }

  const isError = requestedCharacters.find((character) =>
    requiredQueries.find((queryFunction) => {
      const queryState = queryClient.getQueryState(queryFunction(character.CharacterHash).queryKey);
      return queryState?.error;
    })
  );

  if (isError) {
    return {
      data: characterData,
      isLoading: false,
      isError: true,
      error: isError,
    };
  }

  requestedCharacters.forEach((character) => {
    requiredQueries.forEach((queryFunction, index) => {
      const dataKey = getDataKeyFromQueryIndex(index);
      const queryKey = queryFunction(character.CharacterHash).queryKey;
      const cachedData = queryClient.getQueryData(queryKey);
      if (cachedData) {
        // Extract data from the pages structure that the existing queries return
        const flatData = cachedData.pages?.flatMap(page => page.data || []) || [];
        characterData[character.CharacterHash][dataKey] = {
          data: flatData,
          eTags: {}, // The existing queries don't use eTags, so we'll keep this empty
        };
      }
    });
  });

  return {
    data: characterData,
    isLoading: false,
    isError: false,
    error: null,
  };
}
