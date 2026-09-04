import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import { characterSkillsQuery, characterSkillsQueryKey } from "../../React Query/Character/skills";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "../queryLoadingState";

/**
 * Utility function to check loading state from query results.
 *
 * @param {Array<Object>} results - Array of query result objects
 * @returns {boolean} True if any query is loading
 * 
 * @private
 */
function checkLoadingState(results) {
  return results.some(isQueryObserverResultLoading);
}

/**
 * Utility function to find first error from query results.
 *
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Error|null} First error found, or null if none
 * 
 * @private
 */
function findFirstError(results) {
  return results.find((result) => result.error)?.error;
}

/**
 * Utility function to create error object for character skills queries.
 *
 * @param {Error} error - Error object
 * @returns {Object} Error state object
 * 
 * @private
 */
function createErrorObject(error) {
  return {
    data: {},
    isLoading: false,
    isError: error !== null,
    error,
  };
}

/**
 * Utility function to create loading object for character skills queries.
 *
 * @returns {Object} Loading state object
 * 
 * @private
 */
function createLoadingObject() {
  return {
    data: {},
    isLoading: true,
    isError: false,
    error: null,
  };
}

/**
 * Utility function to create success object for character skills queries.
 *
 * @param {Object} data - Object with character hashes as keys and skills objects as values
 * @returns {Object} Success state object
 * 
 * @private
 */
function createSuccessObject(data) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
  };
}

/**
 * Utility function to merge skills by character hash.
 *
 * @param {Array<Object>} results - Array of query result objects
 * @param {Array<Object>} characters - Array of user objects with CharacterHash
 * @returns {Object} Object with character hashes as keys and skills objects as values
 * 
 * @private
 */
function mergeSkillsByCharacter(results, characters) {
  const skillsByCharacter = {};
  
  results.forEach((result, index) => {
    const character = characters[index];
    if (character && result.data) {
      skillsByCharacter[character.CharacterHash] = result.data;
    }
  });
  
  return skillsByCharacter;
}

/**
 * Retrieves cached character skills data from React Query cache for all users.
 *
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all character skills queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Organises data by character hash
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character skills data
 * @returns {Object} returns.data - Object with character hashes as keys and skills objects as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 */
export function getCachedCharacterSkills(queryClient) {
  const characters = useUsersStore.getState().account.characters;

  // Get query states for all characters
  const queryStates = characters.map(({ CharacterHash }) => {
    const queryKey = [characterSkillsQueryKey, CharacterHash];
    return {
      queryState: queryClient.getQueryState(queryKey),
      cachedData: queryClient.getQueryData(queryKey),
      characterHash: CharacterHash,
    };
  });

  // Check loading state
  const isLoading = queryStates.some(({ queryState }) =>
    isQueryStateLoading(queryState)
  );

  if (isLoading) {
    return createLoadingObject();
  }

  // Check for errors
  const error = queryStates.find(({ queryState }) => queryState?.error)?.queryState?.error;

  if (error) {
    return createErrorObject(error);
  }

  // Extract cached skills and merge by character
  const skillsByCharacter = {};
  queryStates.forEach(({ cachedData, characterHash }) => {
    if (cachedData) {
      skillsByCharacter[characterHash] = cachedData;
    }
  });

  return createSuccessObject(skillsByCharacter);
}

/**
 * Custom hook that fetches character skills for all user characters.
 *
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all character skills data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Organises data by character hash for structured access
 *
 * @returns {Object} Object containing character skills data and states
 * @returns {Object} returns.data - Object with character hashes as keys and skills objects as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 */
export default function useGetAllCharacterSkills() {
  const characters = useUsersStore((state) => state.account.characters);

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);
    const skillsByCharacter = mergeSkillsByCharacter(results, characters);

    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    return createSuccessObject(skillsByCharacter);
  }, [characters]);

  const result = useQueries({
    queries: characters.map(({ CharacterHash }) => characterSkillsQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
} 