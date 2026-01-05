import getCharacterBlueprints from "../../../Functions/EveESI/Character/getBlueprints";
import useUsersStore from "../../../Zustand/usersStore";
import { getQueryEnabled } from "../../useQueryEnabled";
import { getESIRateLimitStatuses } from "../../../Functions/EveESI/fetchWithCustomHeaders";

const characterBlueprintsQueryKey = "characterBlueprints";

/**
 * React Query configuration for fetching character blueprints from EVE ESI API.
 * 
 * This query handles character blueprint data fetching with:
 * - Pagination support for large blueprint collections
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimized for blueprint data
 * - Error handling with descriptive messages
 * - Character hash tracking for data organization
 * 
 * The query process:
 * 1. Checks ESI rate limits for character group
 * 2. Fetches blueprints page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Returns data with character hash for identification
 * 5. Handles rate limiting errors with appropriate wait times
 * 6. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch character blueprints
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.cacheTime - Time to keep data in cache (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: blueprints, isLoading, error } = useQuery(characterBlueprintsQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading blueprints...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Blueprints: {blueprints.data.length} items for {blueprints.characterHash}</div>;
 */
function characterBlueprintsQuery(characterHash) {
  const isLoggedIn = useUsersStore.getState().users.isLoggedIn;
  const findUserByCharacterHash = useUsersStore.getState().users.actions.findUserByCharacterHash;
  return {
    queryKey: [characterBlueprintsQueryKey, characterHash],
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
      let page = 1;
      let totalPages = 1;
      const userObject = findUserByCharacterHash(characterHash);
      try {
        do {
          const result = await getCharacterBlueprints({
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

        return {
          data: allData,
          characterHash: characterHash,
        };
      } catch (error) {
        console.error('Error fetching character blueprints:', error);
        throw new Error(`Failed to fetch character blueprints: ${error.message}`);
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

export { characterBlueprintsQuery, characterBlueprintsQueryKey };
