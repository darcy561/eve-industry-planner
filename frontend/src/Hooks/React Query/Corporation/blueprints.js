import getCorpBlueprints from "../../../Functions/EveESI/Corporation/getBlueprints";
import useUsersStore from "../../../Zustand/usersStore";
import { isQueryExecutionEnabled } from "../../../Functions/Shared/queryExecutionEnabled";
import { getESIRateLimitStatus } from "../../../Functions/EveESI/fetchWithCustomHeaders";
import fetchPaginatedDataParallel from "../../../Functions/Helper/fetchPaginatedDataParallel";
const corporationBlueprintsQueryKey = "corporationBlueprints";

/**
 * React Query configuration for fetching corporation blueprints from EVE ESI API.
 * 
 * This query handles corporation blueprint data fetching with:
 * - Pagination support for large corporation blueprint collections
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimised for corporation blueprint data
 * - Error handling with descriptive messages
 * - Corporation ID tracking for data organisation
 * 
 * The query process:
 * 1. Checks ESI rate limits for corporation group
 * 2. Fetches corporation blueprints page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Returns data with corporation ID for identification
 * 5. Handles rate limiting errors with appropriate wait times
 * 6. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch corporation blueprints
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.gcTime - Inactive cache retention in ms (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: corpBlueprints, isLoading, error } = useQuery(corporationBlueprintsQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading corporation blueprints...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Corporation Blueprints: {corpBlueprints.data.length} items for corp {corpBlueprints.corporation_id}</div>;
 */
function corporationBlueprintsQuery(characterHash) {
  const findCharacterByHash = useUsersStore.getState().account.actions.findCharacterByHash;
  return {
    queryKey: [corporationBlueprintsQueryKey, characterHash],
    queryFn: async () => {
      const userObject = findCharacterByHash(characterHash);
      
      // Check if corporation group is rate limited for this specific character
      // Use config.group as hint, will be updated from headers if different
      const corporationStatus = getESIRateLimitStatus('corporation', characterHash);

      if (corporationStatus && corporationStatus.availableTokens <= 0 && corporationStatus.maxTokens && corporationStatus.windowSize) {
        const tokensPerMs = corporationStatus.maxTokens / corporationStatus.windowSize;
        const tokensToRecover = corporationStatus.maxTokens - corporationStatus.availableTokens;
        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

        throw new Error(`Corporation group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }

      try {
        const allData = await fetchPaginatedDataParallel(async (page) => {
          return await getCorpBlueprints({
            character: userObject,
            page: page,
            config: {
              characterHash,
              group: 'corporation',
              priority: 'normal',
              batchable: true
            }
          });

        });

        return {
          data: allData,
          corporation_id: userObject.corporation_id,
        };
      } catch (error) {
        console.error('Error fetching corporation blueprints:', error);
        throw new Error(`Failed to fetch corporation blueprints: ${error.message}`);
      }
    },
    enabled: isQueryExecutionEnabled(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes('rate limited')) {
        // Get status for this specific character's corporation bucket
        const corporationStatus = getESIRateLimitStatus('corporation', characterHash);
        if (corporationStatus && corporationStatus.maxTokens && corporationStatus.windowSize) {
          const tokensPerMs = corporationStatus.maxTokens / corporationStatus.windowSize;
          const tokensToRecover = corporationStatus.maxTokens - corporationStatus.availableTokens;
          const waitTime = Math.ceil(tokensToRecover / tokensPerMs);
          return Math.max(waitTime, 1000);
        }
      }
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  };
}

export { corporationBlueprintsQueryKey, corporationBlueprintsQuery };
