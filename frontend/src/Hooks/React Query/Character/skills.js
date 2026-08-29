import getCharacterSkills from "../../../Functions/EveESI/Character/getSkills";
import useUsersStore from "../../../Zustand/usersStore";
import { isQueryExecutionEnabled } from "../../../Functions/Shared/queryExecutionEnabled";
import { getESIRateLimitStatus } from "../../../Functions/EveESI/fetchWithCustomHeaders";

const characterSkillsQueryKey = "characterSkills";

/**
 * React Query configuration for fetching character skills from EVE ESI API.
 * 
 * This query handles character skill data fetching with:
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimised for skill data
 * - Error handling with descriptive messages
 * - Single-page data fetching (skills are not paginated)
 * 
 * The query process:
 * 1. Checks ESI rate limits for character group
 * 2. Fetches all character skills in a single request
 * 3. Returns skill data with levels and training information
 * 4. Handles rate limiting errors with appropriate wait times
 * 5. Caches data for 1 hour with 30-minute stale time
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch character skills
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.gcTime - Inactive cache retention in ms (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 * 
 * @example
 * const { data: skills, isLoading, error } = useQuery(characterSkillsQuery(characterHash));
 * 
 * if (isLoading) return <div>Loading skills...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Skills: {Object.keys(skills).length} skills loaded</div>;
 */
function characterSkillsQuery(characterHash) {
  const findCharacterByHash = useUsersStore.getState().account.actions.findCharacterByHash;
  return {
    queryKey: [characterSkillsQueryKey, characterHash],
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
      const result = await getCharacterSkills({
        character: userObject,
        config: {
          characterHash,
          group: 'character',
          priority: 'normal',
          batchable: true
        }
      });
      return result.data;
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
  
export { characterSkillsQuery, characterSkillsQueryKey };
