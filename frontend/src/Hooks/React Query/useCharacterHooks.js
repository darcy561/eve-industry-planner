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
import { startQueryTracking, logWaterfall, clearQueryTimings, ENABLE_QUERY_WATERFALL_LOGGING } from "../../Functions/Debugging/queryWaterfallLogger"

/**
 * Creates a tracked query by wrapping the queryFn with tracking
 * This ensures queries are tracked even if React Query returns cached data immediately
 * Note: Tracking also happens at promise level to catch queries that fail before queryFn executes
 * @param {Function} queryFactory - Function that returns a query config object
 * @param {string} queryName - Name of the query for tracking
 * @param {string} characterHash - Character hash for tracking
 * @returns {Function} Function that returns a query config with tracked queryFn
 */
function createTrackedQuery(queryFactory, queryName, characterHash) {
  return (characterHashParam) => {
    const queryConfig = queryFactory(characterHashParam);
    // Don't wrap queryFn here - tracking happens at promise level instead
    // This ensures we catch all queries, even if they fail before queryFn executes
    return queryConfig;
  };
}

/**
 * Maximum number of characters to process concurrently
 * This prevents overwhelming ESI endpoints when users have many characters
 * Each character triggers 14 queries (8 character + 6 corporation), so 3 characters = 42 concurrent queries
 */
const MAX_CONCURRENT_CHARACTERS = 3;

/**
 * Process an array of items in batches with a maximum concurrency limit
 * @param {Array} items - Array of items to process
 * @param {Function} processor - Async function to process each item
 * @param {number} batchSize - Maximum number of items to process concurrently
 * @returns {Promise<Array>} Promise that resolves when all items are processed
 */
async function processInBatches(items, processor, batchSize) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    results.push(...batchResults);
  }
  
  return results;
}

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
 * 1. Character data prefetch: All character queries run in parallel (Skills, standings, blueprints, industry jobs, journal, market orders, transactions)
 * 2. Corporation data prefetch: All corporation queries run in parallel (Transactions, market orders, historic market orders, industry jobs, blueprints, journal)
 * 3. Combined prefetch: Triggers both character and corporation data prefetching in parallel
 * 4. Background loading: Data is loaded without blocking the UI
 * 5. Batch processing: Multiple characters are processed in batches to prevent overwhelming ESI endpoints
 * 
 * @returns {Object} Object containing character data prefetching functions
 * @returns {Function} returns.triggerCharacterDataPrefetch - Triggers prefetching for a single character's data
 * @returns {Function} returns.prefetchMultipleCharacters - Triggers prefetching for multiple characters in batches
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

    // Function to trigger data fetching without hooks - all queries run in parallel
    async function prefetchCharacterData(queryClient, characterHash) {
        // Create tracked versions of queries - tracking happens inside queryFn
        const trackedSkillsQuery = createTrackedQuery(characterSkillsQuery, 'Character Skills', characterHash);
        const trackedStandingsQuery = createTrackedQuery(characterStandingsQuery, 'Character Standings', characterHash);
        const trackedBlueprintsQuery = createTrackedQuery(characterBlueprintsQuery, 'Character Blueprints', characterHash);
        const trackedHistoricOrdersQuery = createTrackedQuery(characterHistoricMarketOrdersQuery, 'Character Historic Market Orders', characterHash);
        const trackedIndustryJobsQuery = createTrackedQuery(characterIndustryJobsQuery, 'Character Industry Jobs', characterHash);
        const trackedJournalQuery = createTrackedQuery(characterJournalQuery, 'Character Journal', characterHash);
        const trackedMarketOrdersQuery = createTrackedQuery(characterMarketOrdersQuery, 'Character Market Orders', characterHash);
        const trackedTransactionsQuery = createTrackedQuery(characterTransactionsQuery, 'Character Transactions', characterHash);

        // Start all prefetch calls immediately - tracking happens at promise level
        // Use fetchQuery to force execution even if cached (unlike prefetchQuery which may skip)
        // Override enabled flag to ensure execution for tracking purposes
        // Track at promise level to catch all queries, even if they fail before queryFn executes
        const queries = [];
        
        // Create all query configs with error handling
        try {
            queries.push({ name: 'Character Skills', config: { ...trackedSkillsQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Character Skills query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Character Standings', config: { ...trackedStandingsQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Character Standings query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Character Blueprints', config: { ...trackedBlueprintsQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Character Blueprints query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Character Historic Market Orders', config: { ...trackedHistoricOrdersQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Character Historic Market Orders query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Character Industry Jobs', config: { ...trackedIndustryJobsQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Character Industry Jobs query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Character Journal', config: { ...trackedJournalQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Character Journal query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Character Market Orders', config: { ...trackedMarketOrdersQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Character Market Orders query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Character Transactions', config: { ...trackedTransactionsQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Character Transactions query for ${characterHash}:`, e); }
        
        if (queries.length !== 8) {
            console.warn(`Expected 8 character queries for ${characterHash}, but only created ${queries.length}`);
        }
        
        if (ENABLE_QUERY_WATERFALL_LOGGING) {
            console.log(`[${characterHash.slice(0, 8)}] Creating ${queries.length} character queries:`, queries.map(q => q.name));
        }
        
        // Track each query - start tracking BEFORE creating promise to capture correct start time
        await Promise.allSettled(
            queries.map(({ name, config }) => {
                if (ENABLE_QUERY_WATERFALL_LOGGING) {
                    console.log(`[${characterHash.slice(0, 8)}] Starting query: ${name}`);
                }
                const trackQuery = startQueryTracking(name, characterHash);
                let tracked = false;
                const markTracked = () => {
                    if (!tracked) {
                        tracked = true;
                        const duration = trackQuery();
                        if (ENABLE_QUERY_WATERFALL_LOGGING) {
                            console.log(`[${characterHash.slice(0, 8)}] Tracked query: ${name} (${duration.toFixed(0)}ms)`);
                        }
                    }
                };
                try {
                    const promise = queryClient.fetchQuery(config);
                    return promise
                        .then(() => {
                            if (ENABLE_QUERY_WATERFALL_LOGGING) {
                                console.log(`[${characterHash.slice(0, 8)}] Query completed: ${name}`);
                            }
                            markTracked();
                        })
                        .catch((error) => {
                            if (ENABLE_QUERY_WATERFALL_LOGGING) {
                                console.error(`[${characterHash.slice(0, 8)}] Query failed: ${name}`, error);
                            }
                            markTracked();
                            throw error;
                        });
                } catch (error) {
                    // If fetchQuery throws synchronously, still track it
                    if (ENABLE_QUERY_WATERFALL_LOGGING) {
                        console.error(`[${characterHash.slice(0, 8)}] Query threw synchronously: ${name}`, error);
                    }
                    markTracked();
                    return Promise.reject(error);
                }
            })
        );
    }

    async function prefetchCorporationData(queryClient, characterHash) {
        // Create tracked versions of queries - tracking happens inside queryFn
        const trackedTransactionsQuery = createTrackedQuery(corporationTransactionsQuery, 'Corporation Transactions', characterHash);
        const trackedMarketOrdersQuery = createTrackedQuery(corporationMarketOrdersQuery, 'Corporation Market Orders', characterHash);
        const trackedHistoricOrdersQuery = createTrackedQuery(corporationHistoricMarketOrdersQuery, 'Corporation Historic Market Orders', characterHash);
        const trackedIndustryJobsQuery = createTrackedQuery(corporationIndustryJobsQuery, 'Corporation Industry Jobs', characterHash);
        const trackedBlueprintsQuery = createTrackedQuery(corporationBlueprintsQuery, 'Corporation Blueprints', characterHash);
        const trackedJournalQuery = createTrackedQuery(corporationJournalQuery, 'Corporation Journal', characterHash);

        // Start all prefetch calls immediately - tracking happens at promise level
        // Use fetchQuery to force execution even if cached (unlike prefetchQuery which may skip)
        // Override enabled flag to ensure execution for tracking purposes
        // Track at promise level to catch all queries, even if they fail before queryFn executes
        const queries = [];
        
        // Create all query configs with error handling
        try {
            queries.push({ name: 'Corporation Transactions', config: { ...trackedTransactionsQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Corporation Transactions query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Corporation Market Orders', config: { ...trackedMarketOrdersQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Corporation Market Orders query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Corporation Historic Market Orders', config: { ...trackedHistoricOrdersQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Corporation Historic Market Orders query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Corporation Industry Jobs', config: { ...trackedIndustryJobsQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Corporation Industry Jobs query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Corporation Blueprints', config: { ...trackedBlueprintsQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Corporation Blueprints query for ${characterHash}:`, e); }
        try {
            queries.push({ name: 'Corporation Journal', config: { ...trackedJournalQuery(characterHash), enabled: true } });
        } catch (e) { console.error(`Failed to create Corporation Journal query for ${characterHash}:`, e); }
        
        if (queries.length !== 6) {
            console.warn(`Expected 6 corporation queries for ${characterHash}, but only created ${queries.length}`);
        }
        
        if (ENABLE_QUERY_WATERFALL_LOGGING) {
            console.log(`[${characterHash.slice(0, 8)}] Creating ${queries.length} corporation queries:`, queries.map(q => q.name));
        }
        
        // Track each query - start tracking BEFORE creating promise to capture correct start time
        await Promise.allSettled(
            queries.map(({ name, config }) => {
                if (ENABLE_QUERY_WATERFALL_LOGGING) {
                    console.log(`[${characterHash.slice(0, 8)}] Starting query: ${name}`);
                }
                const trackQuery = startQueryTracking(name, characterHash);
                let tracked = false;
                const markTracked = () => {
                    if (!tracked) {
                        tracked = true;
                        const duration = trackQuery();
                        if (ENABLE_QUERY_WATERFALL_LOGGING) {
                            console.log(`[${characterHash.slice(0, 8)}] Tracked query: ${name} (${duration.toFixed(0)}ms)`);
                        }
                    }
                };
                try {
                    const promise = queryClient.fetchQuery(config);
                    return promise
                        .then(() => {
                            if (ENABLE_QUERY_WATERFALL_LOGGING) {
                                console.log(`[${characterHash.slice(0, 8)}] Query completed: ${name}`);
                            }
                            markTracked();
                        })
                        .catch((error) => {
                            if (ENABLE_QUERY_WATERFALL_LOGGING) {
                                console.error(`[${characterHash.slice(0, 8)}] Query failed: ${name}`, error);
                            }
                            markTracked();
                            throw error;
                        });
                } catch (error) {
                    // If fetchQuery throws synchronously, still track it
                    if (ENABLE_QUERY_WATERFALL_LOGGING) {
                        console.error(`[${characterHash.slice(0, 8)}] Query threw synchronously: ${name}`, error);
                    }
                    markTracked();
                    return Promise.reject(error);
                }
            })
        );
    }


    async function triggerCharacterDataPrefetch(queryClient, characterHash, shouldLog = false) {
        const overallStart = performance.now();
        
        // Trigger both character and corporation data prefetching in parallel
        await Promise.all([
            prefetchCharacterData(queryClient, characterHash),
            prefetchCorporationData(queryClient, characterHash)
        ]);
        
        const overallDuration = performance.now() - overallStart;
        if (shouldLog) {
            console.log(`✅ All queries completed for ${characterHash.slice(0, 8)} in ${overallDuration.toFixed(2)}ms`);
            logWaterfall(); // Log the waterfall visualization
        }
    }
    

    /**
     * Prefetch data for multiple characters in batches to avoid overwhelming ESI endpoints
     * @param {Object} queryClient - React Query client
     * @param {Array<string>} characterHashes - Array of character hashes to prefetch
     * @param {boolean} shouldLog - Whether to log waterfall visualization
     * @returns {Promise<void>} Promise that resolves when all characters are processed
     */
    async function prefetchMultipleCharacters(queryClient, characterHashes, shouldLog = false) {
        if (characterHashes.length === 0) return;
        
        // Process characters in batches to avoid overwhelming ESI endpoints
        await processInBatches(
            characterHashes,
            (characterHash) => triggerCharacterDataPrefetch(queryClient, characterHash, false),
            MAX_CONCURRENT_CHARACTERS
        );
        
        if (shouldLog) {
            logWaterfall();
        }
    }

    return {    
        triggerCharacterDataPrefetch,
        prefetchMultipleCharacters
    }

}
