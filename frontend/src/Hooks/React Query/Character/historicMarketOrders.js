import getCharacterHistoricMarketOrders from "../../../Functions/EveESI/Character/getHistoricMarketOrders";
import useUsersStore from "../../../Zustand/usersStore";
import { isQueryExecutionEnabled } from "../../../Functions/Shared/queryExecutionEnabled";
import { getESIRateLimitStatus } from "../../../Functions/EveESI/fetchWithCustomHeaders";
import fetchPaginatedDataParallel from "../../../Functions/Helper/fetchPaginatedDataParallel";

const characterHistoricMarketOrdersQueryKey = "characterHistoricMarketOrders";

/**
 * React Query configuration for fetching character historic market orders from EVE ESI API.
 * 
 * This query handles character historic market order data fetching with:
 * - Pagination support for large historic market order collections
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimised for historic market order data
 * - Error handling with descriptive messages
 * 
 * The query process:
 * 1. Checks ESI rate limits for character group
 * 2. Fetches historic market orders page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Returns data wrapped in an object for consistency
 * 5. Handles rate limiting errors with appropriate wait times
 * 6. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch character historic market orders
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.gcTime - Inactive cache retention in ms (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: historicOrders, isLoading, error } = useQuery(characterHistoricMarketOrdersQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading historic market orders...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Historic Orders: {historicOrders.data.length} completed orders</div>;
 */
function characterHistoricMarketOrdersQuery(characterHash) {
  const findCharacterByHash = useUsersStore.getState().account.actions.findCharacterByHash;
  return {
    queryKey: [characterHistoricMarketOrdersQueryKey, characterHash],
    queryFn: async () => {
      const userObject = findCharacterByHash(characterHash);
      
      // Check if character group is rate limited for this specific character
      // Use config.group as hint, will be updated from headers if different
      const characterStatus = getESIRateLimitStatus('character', characterHash);

      if (characterStatus && characterStatus.availableTokens <= 0 && characterStatus.maxTokens && characterStatus.windowSize) {
        const tokensPerMs = characterStatus.maxTokens / characterStatus.windowSize;
        const tokensToRecover = characterStatus.maxTokens - characterStatus.availableTokens;
        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

        throw new Error(`Character group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }

      try {
        return await fetchPaginatedDataParallel(async (page) => {
          return await getCharacterHistoricMarketOrders({
            character: userObject,
            page: page,
            config: {
              characterHash,
              group: 'character',
              priority: 'normal',
              batchable: true
            }
          });
        });

      } catch (error) {
        console.error('Error fetching character historic market orders:', error);
        throw new Error(`Failed to fetch character historic market orders: ${error.message}`);
      }
    },
    enabled: isQueryExecutionEnabled(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes('rate limited')) {
        // Get status for this specific character's character bucket
        const characterStatus = getESIRateLimitStatus('character', characterHash);
        if (characterStatus && characterStatus.maxTokens && characterStatus.windowSize) {
          const tokensPerMs = characterStatus.maxTokens / characterStatus.windowSize;
          const tokensToRecover = characterStatus.maxTokens - characterStatus.availableTokens;
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

export { characterHistoricMarketOrdersQuery, characterHistoricMarketOrdersQueryKey };
