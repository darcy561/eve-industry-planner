import getCharacterIndustryJobs from "../../../Functions/EveESI/Character/getIndustryJobs";
import useUsersStore from "../../../Zustand/usersStore";
import { isQueryExecutionEnabled } from "../../../Functions/Shared/queryExecutionEnabled";
import { getESIRateLimitStatus } from "../../../Functions/EveESI/fetchWithCustomHeaders";

const characterIndustryJobsQueryKey = "characterIndustryJobs";

/**
 * React Query configuration for fetching character industry jobs from EVE ESI API.
 *
 * This query handles character industry job data fetching with:
 *
 * The query process:
 * 1. Checks ESI rate limits for industry group
 * 2. Fetches all character industry jobs in a single request
 * 3. Returns industry job data with production information
 * 4. Handles rate limiting errors with appropriate wait times
 * 5. Caches data for 1 hour with 30-minute stale time
 *
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch character industry jobs
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.gcTime - Inactive cache retention in ms (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 */
function characterIndustryJobsQuery(characterHash) {
  const findCharacterByHash = useUsersStore.getState().account.actions.findCharacterByHash;
  return {
    queryKey: [characterIndustryJobsQueryKey, characterHash],
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
        return await getCharacterIndustryJobs({
          character: userObject,
          existingData: {
            data: null,
            etag: null,
          },
          config: {
            characterHash,
            group: 'industry',
            priority: 'normal',
            batchable: true
          }
        });
      } catch (error) {
        console.error('Error fetching character industry jobs:', error);
        throw new Error(`Failed to fetch character industry jobs: ${error.message}`);
      }
    },
    enabled: isQueryExecutionEnabled(),
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

export { characterIndustryJobsQuery, characterIndustryJobsQueryKey };