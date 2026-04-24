import useUsersStore from "../../../Zustand/usersStore";
import getCorpAssets from "../../../Functions/EveESI/Corporation/getAssets";
import { isQueryExecutionEnabled } from "../../../Functions/Shared/queryExecutionEnabled";
import { getESIRateLimitStatus } from "../../../Functions/EveESI/fetchWithCustomHeaders";
import fetchPaginatedDataParallel from "../../../Functions/Helper/fetchPaginatedDataParallel";

const corporationAssetsQueryKey = "corporationAssets";

/**
 * React Query configuration for fetching corporation assets from EVE ESI API.
 * 
 * This query handles corporation asset data fetching with:
 * - Pagination support for large corporation asset collections
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimized for corporation asset data
 * - Error handling with descriptive messages
 * 
 * The query process:
 * 1. Checks ESI rate limits for assets group
 * 2. Fetches corporation assets page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Handles rate limiting errors with appropriate wait times
 * 5. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch corporation assets
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.gcTime - Inactive cache retention in ms (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: corpAssets, isLoading, error } = useQuery(corporationAssetsQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading corporation assets...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Corporation Assets: {corpAssets.length} items</div>;
 */
function corporationAssetsQuery(characterHash) {
  const findCharacterByHash =
    useUsersStore.getState().account.actions.findCharacterByHash;
  return {
    queryKey: [corporationAssetsQueryKey, characterHash],
    queryFn: async () => {
      const userObject = findCharacterByHash(characterHash);
      
      // Check if assets group is rate limited for this specific character
      // Use config.group as hint, will be updated from headers if different
      const assetsStatus = getESIRateLimitStatus('assets', characterHash);

      if (assetsStatus && assetsStatus.availableTokens <= 0 && assetsStatus.maxTokens && assetsStatus.windowSize) {
        const tokensPerMs = assetsStatus.maxTokens / assetsStatus.windowSize;
        const tokensToRecover = assetsStatus.maxTokens - assetsStatus.availableTokens;
        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

        throw new Error(`Assets group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }

      try {
        return await fetchPaginatedDataParallel(async (page) => {
          return await getCorpAssets({
            character: userObject,
            page: page,
            config: {
              characterHash,
              group: 'assets',
              priority: 'normal',
              batchable: true
            }
          });

        });

      } catch (error) {
        console.error("Error fetching corporation assets:", error);
        throw new Error(`Failed to fetch corporation assets: ${error.message}`);
      }
    },
    enabled: isQueryExecutionEnabled(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes('rate limited')) {
        // Get status for this specific character's assets bucket
        const assetsStatus = getESIRateLimitStatus('assets', characterHash);
        if (assetsStatus && assetsStatus.maxTokens && assetsStatus.windowSize) {
          const tokensPerMs = assetsStatus.maxTokens / assetsStatus.windowSize;
          const tokensToRecover = assetsStatus.maxTokens - assetsStatus.availableTokens;
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

export { corporationAssetsQuery, corporationAssetsQueryKey };
