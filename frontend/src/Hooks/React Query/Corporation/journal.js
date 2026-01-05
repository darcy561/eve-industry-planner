import getCorpJournal from "../../../Functions/EveESI/Corporation/getJournal";
import useUsersStore from "../../../Zustand/usersStore";
import { getQueryEnabled } from "../../useQueryEnabled";
import { getESIRateLimitStatuses } from "../../../Functions/EveESI/fetchWithCustomHeaders";

const corporationJournalQueryKey = "corporationJournal";

/**
 * React Query configuration for fetching corporation journal from EVE ESI API.
 * 
 * This query handles corporation journal data fetching with:
 * - Multi-division support for corporation wallet divisions (up to 7 divisions)
 * - Pagination support for each division's journal entries
 * - Parallel fetching of all divisions for improved performance
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimized for corporation journal data
 * - Error handling with descriptive messages
 * 
 * The query process:
 * 1. Checks ESI rate limits for corporation group
 * 2. Fetches journal entries for all 7 wallet divisions in parallel
 * 3. Handles pagination for each division separately
 * 4. Combines all division data into a single flattened array
 * 5. Handles rate limiting errors with appropriate wait times
 * 6. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch corporation journal
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.cacheTime - Time to keep data in cache (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: corpJournal, isLoading, error } = useQuery(corporationJournalQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading corporation journal...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Corporation Journal: {corpJournal.length} entries across all divisions</div>;
 */
function corporationJournalQuery(characterHash) {
  const isLoggedIn = useUsersStore.getState().users.isLoggedIn;
  const findUserByCharacterHash = useUsersStore.getState().users.actions.findUserByCharacterHash;
  return {
    queryKey: [corporationJournalQueryKey, characterHash],
    queryFn: async () => {
      // Check if corporation group is rate limited
      const rateLimits = getESIRateLimitStatuses();
      const corporationStatus = rateLimits.find(status => status?.group === 'corporation');

      if (corporationStatus && corporationStatus.availableTokens <= 0 && corporationStatus.maxTokens && corporationStatus.windowSize) {
        const now = Date.now();
        const tokensPerMs = corporationStatus.maxTokens / corporationStatus.windowSize;
        const tokensToRecover = corporationStatus.maxTokens - corporationStatus.availableTokens;
        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

        throw new Error(`Corporation group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }

      const userObject = findUserByCharacterHash(characterHash);
      const maxDivisions = 7;

      try {
        // Fetch all divisions for the current page
        const divisionPromises = Array.from({ length: maxDivisions }, async (_, i) => {
          let page = 1;
          let divisionPages = 1;
          const divisionData = [];
          try {
            do {
              const result = await getCorpJournal({
                character: userObject,
                division: i + 1,
                page: page,
                config: {
                  characterHash,
                  group: 'corporation',
                  priority: 'normal',
                  batchable: true
                }
              });

              divisionData.push(...result.data);

              divisionPages = result.totalPages ?? 1;
              page++;
            } while (page <= divisionPages);

            return divisionData;

          } catch (error) {
            console.error('Error fetching corporation journal:', error);
            throw new Error(`Failed to fetch corporation journal: ${error.message}`);
          }
        });

        const divisionResults = await Promise.all(divisionPromises);

        // Combine all division results into a single array
        const allData = divisionResults.flatMap((result) => result);

        return allData;
      } catch (error) {
        console.error('Error fetching corporation journal:', error);
        throw new Error(`Failed to fetch corporation journal: ${error.message}`);
      }
    },
    enabled: getQueryEnabled(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes('rate limited')) {
        const rateLimits = getESIRateLimitStatuses();
        const corporationStatus = rateLimits.find(status => status?.group === 'corporation');
        if (corporationStatus && corporationStatus.maxTokens && corporationStatus.windowSize) {
          const now = Date.now();
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

export { corporationJournalQueryKey, corporationJournalQuery };
