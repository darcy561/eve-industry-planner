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
 * @param {Array<Object>} userArray - Array of user objects with CharacterHash
 * @returns {Object} Object with character hashes as keys and skills objects as values
 * 
 * @private
 */
function mergeSkillsByCharacter(results, userArray) {
  const skillsByCharacter = {};
  
  results.forEach((result, index) => {
    const character = userArray[index];
    if (character && result.data) {
      skillsByCharacter[character.CharacterHash] = result.data;
    }
  });
  
  return skillsByCharacter;
}

/**
 * Retrieves cached character skills data from React Query cache for all users.
 * 
 * This function provides access to cached character skills data without triggering new queries:
 * - Fetches skills for all user characters
 * - Checks loading states for all character skills queries
 * - Extracts cached data from React Query cache
 * - Organizes data by character hash for easy access
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all character skills queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Organizes data by character hash
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character skills data
 * @returns {Object} returns.data - Object with character hashes as keys and skills objects as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedSkills = getCachedCharacterSkills(queryClient);
 * if (!cachedSkills.isLoading && !cachedSkills.isError) {
 *   Object.keys(cachedSkills.data).forEach(characterHash => {
 *     console.log(`Character ${characterHash}: ${Object.keys(cachedSkills.data[characterHash]).length} skills`);
 *   });
 * }
 */
export function getCachedCharacterSkills(queryClient) {
  const userArray = useUsersStore.getState().users.userArray;

  // Get query states for all characters
  const queryStates = userArray.map(({ CharacterHash }) => {
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
 * This hook provides comprehensive character skills data fetching:
 * - Fetches skills for all user characters in parallel
 * - Organizes skills by character hash for easy access
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports skill analysis and character progression tracking
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all character skills data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Organizes data by character hash for structured access
 * 
 * @returns {Object} Object containing character skills data and states
 * @returns {Object} returns.data - Object with character hashes as keys and skills objects as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CharacterSkillsManager() {
 *   const { data: skillsByCharacter, isLoading, isError, error } = useGetAllCharacterSkills();
 * 
 *   if (isLoading) return <div>Loading character skills...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       {Object.keys(skillsByCharacter).map(characterHash => (
 *         <div key={characterHash}>
 *           Character {characterHash}: {Object.keys(skillsByCharacter[characterHash]).length} skills
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export default function useGetAllCharacterSkills() {
  const { userArray } = useUsersStore((state) => state.users);

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);
    const skillsByCharacter = mergeSkillsByCharacter(results, userArray);

    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    return createSuccessObject(skillsByCharacter);
  }, [userArray]);

  const result = useQueries({
    queries: userArray.map(({ CharacterHash }) => characterSkillsQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
} 