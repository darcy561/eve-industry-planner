import getCorpTransactions from "../../../Functions/EveESI/Corporation/getTransactions";
import useUsersStore from "../../../Zustand/usersStore";
import { getQueryEnabled } from "../../useQueryEnabled";
import { getESIRateLimitStatus } from "../../../Functions/EveESI/fetchWithCustomHeaders";

const corporationTransactionsQueryKey = "corporationTransactions";

/**
 * React Query configuration for fetching corporation transactions from EVE ESI API.
 *
 * This query handles corporation transaction data fetching with:
 * - Division-based data fetching for corporation wallet divisions
 * - ESI rate limiting awareness and handling
 * - Automatic retry with exponential backoff
 * - Caching strategy optimized for corporation transaction data
 * - Error handling with descriptive messages
 * - Division data flattening for unified access
 *
 * The query process:
 * 1. Checks ESI rate limits for corporation group
 * 2. Fetches corporation transactions for all wallet divisions
 * 3. Flattens division data into a single array
 * 4. Handles rate limiting errors with appropriate wait times
 * 5. Caches data for 1 hour with 30-minute stale time
 *
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} React Query configuration object
 * @returns {Array} returns.queryKey - Query key array for React Query
 * @returns {Function} returns.queryFn - Async function to fetch corporation transactions
 * @returns {boolean} returns.enabled - Whether the query is enabled
 * @returns {number} returns.staleTime - Time before data is considered stale (30 minutes)
 * @returns {number} returns.gcTime - Inactive cache retention in ms (1 hour)
 * @returns {number} returns.retry - Number of retry attempts (3)
 * @returns {Function} returns.retryDelay - Function to calculate retry delay
 * @returns {boolean} returns.refetchOnWindowFocus - Whether to refetch on window focus (false)
 * @returns {boolean} returns.refetchOnMount - Whether to refetch on component mount (false)
 *
 * @example
 * const { data: corpTransactions, isLoading, error } = useQuery(corporationTransactionsQuery(characterHash));
 *
 * if (isLoading) return <div>Loading corporation transactions...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>Corporation Transactions: {corpTransactions.length} transactions across all divisions</div>;
 */
function corporationTransactionsQuery(characterHash) {
  const findCharacterByHash =
    useUsersStore.getState().account.actions.findCharacterByHash;
  return {
    queryKey: [corporationTransactionsQueryKey, characterHash],
    queryFn: async () => {
      const userObject = findCharacterByHash(characterHash);
      
      // Check if corporation group is rate limited for this specific character
      // Use config.group as hint, will be updated from headers if different
      const corporationStatus = getESIRateLimitStatus('corporation', characterHash);

      if (
        corporationStatus &&
        corporationStatus.availableTokens <= 0 &&
        corporationStatus.maxTokens &&
        corporationStatus.windowSize
      ) {
        const tokensPerMs =
          corporationStatus.maxTokens / corporationStatus.windowSize;
        const tokensToRecover =
          corporationStatus.maxTokens - corporationStatus.availableTokens;
        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

        throw new Error(
          `Corporation group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`
        );
      }

      try {
        // Fetch all divisions for the current page

        const result = await getCorpTransactions({
          character: userObject,
          config: {
            characterHash,
            group: "corporation",
            priority: "normal",
            batchable: true,
          },
        });

        const divisionData = (result?.data || [])
          .map((result) => result?.data || [])
          .flat();

        // Combine all division results for this page
        return divisionData;
      } catch (error) {
        console.error("Error fetching corporation transactions:", error);
        throw new Error(
          `Failed to fetch corporation transactions: ${error.message}`
        );
      }
    },
    enabled: getQueryEnabled(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes("rate limited")) {
        // Get status for this specific character's corporation bucket
        const corporationStatus = getESIRateLimitStatus('corporation', characterHash);
        if (
          corporationStatus &&
          corporationStatus.maxTokens &&
          corporationStatus.windowSize
        ) {
          const tokensPerMs =
            corporationStatus.maxTokens / corporationStatus.windowSize;
          const tokensToRecover =
            corporationStatus.maxTokens - corporationStatus.availableTokens;
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

export { corporationTransactionsQuery, corporationTransactionsQueryKey };
