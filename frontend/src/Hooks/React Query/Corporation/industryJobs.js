import getCorpIndustryJobs from "../../../Functions/EveESI/Corporation/getIndustryJobs";
import useUsersStore from "../../../Zustand/usersStore";
import { getQueryEnabled } from "../../useQueryEnabled";
import { getESIRateLimitStatus } from "../../../Functions/EveESI/fetchWithCustomHeaders";
import fetchPaginatedDataParallel from "../../../Functions/Helper/fetchPaginatedDataParallel";

const corporationIndustryJobsQueryKey = "corporationIndustryJobs";

/**
 * React Query configuration for fetching corporation industry jobs from EVE ESI API.
 * 
 * This query handles corporation industry job data fetching with:
 * - Pagination support for large corporation industry job collections
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimized for corporation industry job data
 * - Error handling with descriptive messages
 * - Corporation ID tracking for data organization
 * 
 * The query process:
 * 1. Checks ESI rate limits for industry group
 * 2. Fetches corporation industry jobs page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Returns data with corporation ID for identification
 * 5. Handles rate limiting errors with appropriate wait times
 * 6. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch corporation industry jobs
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.gcTime - Inactive cache retention in ms (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: corpIndustryJobs, isLoading, error } = useQuery(corporationIndustryJobsQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading corporation industry jobs...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Corporation Industry Jobs: {corpIndustryJobs.data.length} active jobs for corp {corpIndustryJobs.corporation_id}</div>;
 */
function corporationIndustryJobsQuery(characterHash) {
  const findCharacterByHash = useUsersStore.getState().account.actions.findCharacterByHash;

  return {
    queryKey: [corporationIndustryJobsQueryKey, characterHash],
    queryFn: async () => {
      const userObject = findCharacterByHash(characterHash);
      
      // Check if industry group is rate limited for this specific character
      // Use config.group as hint, will be updated from headers if different
      const industryStatus = getESIRateLimitStatus('industry', characterHash);

      if (industryStatus && industryStatus.availableTokens <= 0 && industryStatus.maxTokens && industryStatus.windowSize) {
        const tokensPerMs = industryStatus.maxTokens / industryStatus.windowSize;
        const tokensToRecover = industryStatus.maxTokens - industryStatus.availableTokens;
        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

        throw new Error(`Industry group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }

      try {
        const allData = await fetchPaginatedDataParallel(async (page) => {
          return await getCorpIndustryJobs({
            character: userObject,
            page: page,
            config: {
              characterHash,
              group: 'industry',
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
        console.error('Error fetching corporation industry jobs:', error);
        throw new Error(`Failed to fetch corporation industry jobs: ${error.message}`);
      }
    },
    enabled: getQueryEnabled(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes('rate limited')) {
        // Get status for this specific character's industry bucket
        const industryStatus = getESIRateLimitStatus('industry', characterHash);
        if (industryStatus && industryStatus.maxTokens && industryStatus.windowSize) {
          const tokensPerMs = industryStatus.maxTokens / industryStatus.windowSize;
          const tokensToRecover = industryStatus.maxTokens - industryStatus.availableTokens;
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

export { corporationIndustryJobsQueryKey, corporationIndustryJobsQuery };
