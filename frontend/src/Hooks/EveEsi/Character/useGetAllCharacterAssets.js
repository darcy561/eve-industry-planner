import { useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { characterAssetsQuery, characterAssetsQueryKey } from "../../React Query/Character/assets";
import {
    isQueryObserverResultLoading,
    isQueryStateLoading,
} from "../queryLoadingState";

/**
 * Creates a loading state object for character assets queries.
 *
 * @returns {Object} Loading state object
 * 
 * @private
 */
function createLoadingObject() {
    return {
        isLoading: true,
        error: null,
        data: null,
    };
}

/**
 * Creates an error state object for character assets queries.
 *
 * @param {Error} error - Error object
 * @returns {Object} Error state object
 * 
 * @private
 */
function createErrorObject(error) {
    return {
        isLoading: false,
        error: error,
        data: null,
    };
}

/**
 * Creates a success state object for character assets queries.
 *
 * @param {Array<Object>} data - Array of character asset objects
 * @returns {Object} Success state object
 * 
 * @private
 */
function createSuccessObject(data) {
    return {
        isLoading: false,
        error: null,
        data: data,
    };
}

/**
 * Finds the first error in query results.
 *
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Error|null} First error found, or null if none
 * 
 * @private
 */
function findFirstError(results) {
    return results.find((result) =>
        result?.error || result?.isError
    )?.error;
}

/**
 * Retrieves cached character assets data from React Query cache for all users.
 *
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all character asset queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Organises data by character hash
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character assets data
 * @returns {Object} returns.data - Object with character hashes as keys and asset arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {Error|null} returns.error - First error encountered, if any
 */
export function getAllCachedCharacterAssets(queryClient) {
    const characters = useUsersStore.getState().account.characters;
    const queryStates = characters.map(({ CharacterHash }) => {
        const queryKey = [characterAssetsQueryKey, CharacterHash];
        return {
            CharacterHash,
            queryState: queryClient.getQueryState(queryKey),
            cachedData: queryClient.getQueryData(queryKey),
        };
    });

    const isLoading = queryStates.some(({ queryState }) =>
        isQueryStateLoading(queryState)
    );

    if (isLoading) {
        return createLoadingObject();
    }

    // Check if any queries have errors
    const error = queryStates.find(({ queryState }) =>
        queryState?.error
    )?.error;

    if (error) {
        return createErrorObject(error);
    }

    // Success case - combine all cached data
    const assetsByCharacter = {};
    queryStates.forEach(({ CharacterHash, cachedData }) => {
        if (cachedData) {
            assetsByCharacter[CharacterHash] = cachedData;
        }
    });

    return createSuccessObject(assetsByCharacter);
}

/**
 * Custom hook that fetches character assets for all user characters.
 *
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all character asset data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Flattens all character assets into a single array
 *
 * @returns {Object} Object containing character assets data and states
 * @returns {Array<Object>} returns.data - Flattened array of all character assets
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {Error|null} returns.error - First error encountered, if any
 */
export function useGetAllCharacterAssets(enabled = true) {
    const characters = useUsersStore((state) => state.account.characters);

    const combineFunction = useCallback((results) => {
        const isLoading = results.some(isQueryObserverResultLoading);
        const error = findFirstError(results);

        if (isLoading) {
            return createLoadingObject();
        }

        if (error) {
            return createErrorObject(error);
        }

        // Success case - combine all the data
        const data = results.map((result) => result?.data || []).flat();
        return createSuccessObject(data);
    }, [characters]);

    const result = useQueries({
        queries: characters.map(({ CharacterHash }) => {
            const query = characterAssetsQuery(CharacterHash);
            return {
                ...query,
                enabled: enabled && query.enabled,
            };
        }),
        combine: combineFunction,
    });

    return result;
}       
