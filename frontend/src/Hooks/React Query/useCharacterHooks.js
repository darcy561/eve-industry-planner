import { characterSkillsQuery } from "../React Query/Character/skills"
import { characterStandingsQuery } from "../React Query/Character/standings"
import { characterBlueprintsQuery } from "../React Query/Character/blueprints"
import { characterHistoricMarketOrdersQuery } from "../React Query/Character/historicMarketOrders"
import { characterIndustryJobsQuery } from "../React Query/Character/industryJobs"
import { characterJournalQuery } from "./Character/journal"
import { characterMarketOrdersQuery } from "../React Query/Character/marketOrders"
import { characterTransactionsQuery } from "../React Query/Character/transactions"
import { corporationTransactionsQuery } from "../React Query/Corporation/transactions"
import { corporationMarketOrdersQuery } from "../React Query/Corporation/marketOrders"
import { corporationHistoricMarketOrdersQuery } from "../React Query/Corporation/historicMarketOrders"
import { corporationIndustryJobsQuery } from "../React Query/Corporation/industryJobs"
import { corporationBlueprintsQuery } from "../React Query/Corporation/blueprints"
import { corporationJournalQuery } from "../React Query/Corporation/journal"

/**
 * Custom hook that provides character data prefetching functionality for EVE Online industry planning.
 * 
 * This hook manages React Query prefetching for all character and corporation data:
 * - Character data: Skills, standings, blueprints, industry jobs, journal, market orders, transactions
 * - Corporation data: Transactions, market orders, historic market orders, industry jobs, blueprints, journal
 * - Prefetching strategy: Loads data in background for improved user experience
 * - Rate limiting awareness: Respects ESI API rate limits during prefetching
 * 
 * The prefetching process:
 * 1. Character data prefetch: Skills, standings, blueprints, industry jobs, journal, market orders, transactions
 * 2. Corporation data prefetch: All corporation-related data for the character
 * 3. Combined prefetch: Triggers both character and corporation data prefetching
 * 4. Background loading: Data is loaded without blocking the UI
 * 
 * @returns {Object} Object containing character data prefetching functions
 * @returns {Function} returns.triggerCharacterDataPrefetch - Triggers prefetching for all character and corporation data
 * 
 * @example
 * function CharacterDataManager() {
 *   const { triggerCharacterDataPrefetch } = useCharacterHooks();
 * 
 *   const handlePrefetchData = (queryClient, characterHash) => {
 *     triggerCharacterDataPrefetch(queryClient, characterHash);
 *     console.log("Character data prefetching started");
 *   };
 * 
 *   return <button onClick={() => handlePrefetchData(queryClient, hash)}>Prefetch Data</button>;
 * }
 */
export function useCharacterHooks() {

    // Function to trigger data fetching without hooks
    function prefetchCharacterData(queryClient, characterHash) {
        queryClient.prefetchQuery(characterSkillsQuery(characterHash))
        queryClient.prefetchQuery(characterStandingsQuery(characterHash))
        queryClient.prefetchQuery(characterBlueprintsQuery(characterHash))
        queryClient.prefetchQuery(characterHistoricMarketOrdersQuery(characterHash))
        queryClient.prefetchQuery(characterIndustryJobsQuery(characterHash))
        queryClient.prefetchQuery(characterJournalQuery(characterHash))
        queryClient.prefetchQuery(characterMarketOrdersQuery(characterHash))
        queryClient.prefetchQuery(characterTransactionsQuery(characterHash))
    }

    function prefetchCorporationData(queryClient, characterHash) {
        queryClient.prefetchQuery(corporationTransactionsQuery(characterHash))
        queryClient.prefetchQuery(corporationMarketOrdersQuery(characterHash))
        queryClient.prefetchQuery(corporationHistoricMarketOrdersQuery(characterHash))
        queryClient.prefetchQuery(corporationIndustryJobsQuery(characterHash))
        queryClient.prefetchQuery(corporationBlueprintsQuery(characterHash))
        queryClient.prefetchQuery(corporationJournalQuery(characterHash))
    }


    function triggerCharacterDataPrefetch(queryClient, characterHash) {
        prefetchCharacterData(queryClient, characterHash)
        prefetchCorporationData(queryClient, characterHash)

    }
    

    return {    
        triggerCharacterDataPrefetch
    }

}
