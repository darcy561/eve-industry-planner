import getCharacterAssets from "../../../Functions/EveESI/Character/getAssets";
import useUsersStore from "../../../Zustand/usersStore";
import { getQueryEnabled } from "../../useQueryEnabled";
import { getESIRateLimitStatuses } from "../../../Functions/EveESI/fetchWithCustomHeaders";

const characterAssetsQueryKey = "characterAssets";

/**
 * React Query configuration for fetching character assets from EVE ESI API.
 * 
 * This query handles character asset data fetching with:
 * - Pagination support for large asset collections
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimized for asset data
 * - Error handling with descriptive messages
 * 
 * The query process:
 * 1. Checks ESI rate limits for assets group
 * 2. Fetches assets page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Handles rate limiting errors with appropriate wait times
 * 5. Caches data for 30 minutes with 5-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch character assets
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (5 minutes)
 * @returns {number} returns.cacheTime - Time to keep data in cache (30 minutes)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: assets, isLoading, error } = useQuery(characterAssetsQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading assets...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Assets: {assets.length} items</div>;
 */
function characterAssetsQuery(characterHash) {
  const isLoggedIn = useUsersStore.getState().users.isLoggedIn;
  const findUserByCharacterHash =
    useUsersStore.getState().users.actions.findUserByCharacterHash;
  return {
    queryKey: [characterAssetsQueryKey, characterHash],
    queryFn: async () => {
      // Check if assets group is rate limited
      const rateLimits = getESIRateLimitStatuses();
      const assetsStatus = rateLimits.find(status => status.group === 'assets');

      if (assetsStatus && assetsStatus.availableTokens <= 0) {
        const now = Date.now();
        const tokensPerMs = assetsStatus.maxTokens / assetsStatus.windowSize;
        const tokensToRecover = assetsStatus.maxTokens - assetsStatus.availableTokens;
        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

        throw new Error(`Assets group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }

      const allData = [];
      let page = 1;
      let totalPages = 1;
      const userObject = findUserByCharacterHash(characterHash);
      try {
        do {
          const result = await getCharacterAssets({
            character: userObject,
            page: page,
            config: {
              characterHash,
              group: 'assets',
              priority: 'normal',
              batchable: true
            }
          });

          allData.push(...result.data);

          totalPages = result.totalPages ?? 1;
          page++;
        } while (page <= totalPages);

        return allData;
      } catch (error) {
        console.error("Error fetching character assets:", error);
        throw new Error(`Failed to fetch character assets: ${error.message}`);
      }
    },
    enabled: getQueryEnabled(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes('rate limited')) {
        const rateLimits = getESIRateLimitStatuses();
        const assetsStatus = rateLimits.find(status => status.group === 'assets');
        if (assetsStatus) {
          const now = Date.now();
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

export { characterAssetsQuery, characterAssetsQueryKey };
