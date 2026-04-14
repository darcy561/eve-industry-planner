import getCharacterJournal from "../../../Functions/EveESI/Character/getJournal";
import useUsersStore from "../../../Zustand/usersStore";
import { getQueryEnabled } from "../../useQueryEnabled";
import { getESIRateLimitStatus } from "../../../Functions/EveESI/fetchWithCustomHeaders";
import fetchPaginatedDataParallel from "../../../Functions/Helper/fetchPaginatedDataParallel";

const characterJournalQueryKey = "characterJournal";

/**
 * React Query configuration for fetching character journal from EVE ESI API.
 * 
 * This query handles character journal data fetching with:
 * - Pagination support for large journal collections
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimized for journal data
 * - Error handling with descriptive messages
 * 
 * The query process:
 * 1. Checks ESI rate limits for character group
 * 2. Fetches journal entries page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Handles rate limiting errors with appropriate wait times
 * 5. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch character journal
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.gcTime - Inactive cache retention in ms (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: journal, isLoading, error } = useQuery(characterJournalQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading journal...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Journal: {journal.length} entries</div>;
 */
function characterJournalQuery(characterHash) {
  const findCharacterByHash = useUsersStore.getState().account.actions.findCharacterByHash;

  return {
    queryKey: [characterJournalQueryKey, characterHash],
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
          return await getCharacterJournal({
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
        console.error('Error fetching character journal:', error);
        throw new Error(`Failed to fetch character journal: ${error.message}`);
      }
    },
    enabled: getQueryEnabled(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      // If rate limited, use the wait time
      if (error?.message?.includes('rate limited')) {
        // Get status for this specific character's character bucket
        const characterStatus = getESIRateLimitStatus('character', characterHash);
        if (characterStatus && characterStatus.maxTokens && characterStatus.windowSize) {
          const tokensPerMs = characterStatus.maxTokens / characterStatus.windowSize;
          const tokensToRecover = characterStatus.maxTokens - characterStatus.availableTokens;
          const waitTime = Math.ceil(tokensToRecover / tokensPerMs);
          return Math.max(waitTime, 1000); // At least 1 second
        }
      }
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  };
}

export { characterJournalQuery, characterJournalQueryKey };
