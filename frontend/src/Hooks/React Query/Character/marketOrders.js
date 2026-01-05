import getCharacterMarketOrders from "../../../Functions/EveESI/Character/getMarketOrders";
import useUsersStore from "../../../Zustand/usersStore";
import { getQueryEnabled } from "../../useQueryEnabled";
import { getESIRateLimitStatuses } from "../../../Functions/EveESI/fetchWithCustomHeaders";

const characterMarketOrdersQueryKey = "characterMarketOrders";

/**
 * React Query configuration for fetching character market orders from EVE ESI API.
 * 
 * This query handles character market order data fetching with:
 * - Pagination support for large market order collections
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimized for market order data
 * - Error handling with descriptive messages
 * 
 * The query process:
 * 1. Checks ESI rate limits for character group
 * 2. Fetches market orders page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Handles rate limiting errors with appropriate wait times
 * 5. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch character market orders
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.cacheTime - Time to keep data in cache (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: marketOrders, isLoading, error } = useQuery(characterMarketOrdersQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading market orders...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Market Orders: {marketOrders.length} active orders</div>;
 */
function characterMarketOrdersQuery(characterHash) {
  const isLoggedIn = useUsersStore.getState().users.isLoggedIn;
  const findUserByCharacterHash = useUsersStore.getState().users.actions.findUserByCharacterHash;
  return {
    queryKey: [characterMarketOrdersQueryKey, characterHash],
    queryFn: async () => {
      // Check if character group is rate limited
      const rateLimits = getESIRateLimitStatuses();
      const characterStatus = rateLimits.find(status => status?.group === 'character');

      if (characterStatus && characterStatus.availableTokens <= 0 && characterStatus.maxTokens && characterStatus.windowSize) {
        const now = Date.now();
        const tokensPerMs = characterStatus.maxTokens / characterStatus.windowSize;
        const tokensToRecover = characterStatus.maxTokens - characterStatus.availableTokens;
        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

        throw new Error(`Character group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }

      const allData = [];
      const userObject = findUserByCharacterHash(characterHash);
      let page = 1;
      let totalPages = 1;

      try {
        do {
          const result = await getCharacterMarketOrders({
            character: userObject,
            page: page,
            config: {
              characterHash,
              group: 'character',
              priority: 'normal',
              batchable: true
            }
          });

          allData.push(...result.data);

          totalPages = result.totalPages ?? 1;
          page++;
        } while (page <= totalPages);

        return allData
      } catch (error) {
        console.error('Error fetching character market orders:', error);
        throw new Error(`Failed to fetch character market orders: ${error.message}`);
      }
    },
    enabled: getQueryEnabled(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes('rate limited')) {
        const rateLimits = getESIRateLimitStatuses();
        const characterStatus = rateLimits.find(status => status?.group === 'character');
        if (characterStatus && characterStatus.maxTokens && characterStatus.windowSize) {
          const now = Date.now();
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

export { characterMarketOrdersQuery, characterMarketOrdersQueryKey };
