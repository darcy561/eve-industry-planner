/**
 * Utility for logging and exporting React Query waterfall data
 * Helps visualize when queries start and complete to identify sequential vs parallel execution
 * 
 * Set ENABLE_QUERY_WATERFALL_LOGGING to false to disable all tracking and logging
 */

// Enable/disable flag for debugging purposes
export const ENABLE_QUERY_WATERFALL_LOGGING = false;

const STORAGE_KEY = 'queryWaterfallTimings';
const COUNTER_KEY = 'queryWaterfallCounter';
const SESSION_KEY = 'queryWaterfallSession';

// Generate a unique session ID for this page load
let sessionId = null;
if (typeof window !== 'undefined' && ENABLE_QUERY_WATERFALL_LOGGING) {
  // Try to get existing session ID, or create a new one
  sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
}

const queryTimings = [];
let queryCounter = 0;

// Load persisted data on module initialization
function loadPersistedData() {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) return;
  
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const counter = sessionStorage.getItem(COUNTER_KEY);
    const storedSessionId = sessionStorage.getItem(SESSION_KEY);
    
    // Only restore if it's from the same session (same page load, just module reloaded)
    if (stored && storedSessionId === sessionId) {
      const parsed = JSON.parse(stored);
      // Restore timings, but only if they're recent (within last 5 minutes) AND from this session
      const now = Date.now();
      const recentTimings = parsed.filter(t => 
        (now - t.endTimestamp) < 5 * 60 * 1000 && 
        t.sessionId === sessionId
      );
      if (recentTimings.length > 0) {
        // Recalculate relative times based on absolute timestamps
        // Use the earliest start timestamp as baseline (0ms)
        const earliestStartTimestamp = Math.min(...recentTimings.map(t => t.startTimestamp));
        
        // Adjust relative times to be relative to the earliest query
        const adjustedTimings = recentTimings.map(timing => ({
          ...timing,
          // Recalculate relative times from absolute timestamps
          // Make them relative to the earliest query (which becomes 0ms)
          startTime: timing.startTimestamp - earliestStartTimestamp,
          endTime: timing.endTimestamp - earliestStartTimestamp,
          duration: timing.endTimestamp - timing.startTimestamp
        }));
        
        queryTimings.push(...adjustedTimings);
        console.log(`[TRACK] Restored ${recentTimings.length} query timings from sessionStorage (session: ${sessionId}, earliest: ${new Date(earliestStartTimestamp).toISOString()})`);
      }
    } else if (stored && storedSessionId !== sessionId) {
      // Different session - clear old data
      console.log(`[TRACK] New session detected (${sessionId}), clearing old data from previous session (${storedSessionId})`);
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(COUNTER_KEY);
    }
    
    if (counter && storedSessionId === sessionId) {
      // Restore counter to continue from where we left off
      // This ensures queryIds don't conflict after page navigation
      const restoredCounter = parseInt(counter, 10) || 0;
      queryCounter = Math.max(queryCounter, restoredCounter);
      console.log(`[TRACK] Restored query counter: ${queryCounter} (was ${restoredCounter})`);
    }
  } catch (e) {
    console.warn('[TRACK] Failed to load persisted query timings:', e);
  }
}

// Save data to sessionStorage
function persistData() {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) return;
  
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queryTimings));
    sessionStorage.setItem(COUNTER_KEY, queryCounter.toString());
  } catch (e) {
    console.warn('[TRACK] Failed to persist query timings:', e);
  }
}

// Load persisted data on initialization
if (typeof window !== 'undefined' && ENABLE_QUERY_WATERFALL_LOGGING) {
  loadPersistedData();
}

/**
 * Start tracking a query
 * @param {string} queryName - Name of the query being tracked
 * @param {string} [characterHash] - Optional character hash for uniqueness
 * @returns {Function} Function to call when query completes
 */
export function startQueryTracking(queryName, characterHash = '') {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) {
    // Return a no-op function if logging is disabled
    return () => 0;
  }
  
  const queryId = ++queryCounter;
  const startTime = performance.now();
  const startTimestamp = Date.now();
  const uniqueName = characterHash ? `${queryName} (${characterHash.slice(0, 8)})` : `${queryName} #${queryId}`;
  
  const endTracking = () => {
    if (!ENABLE_QUERY_WATERFALL_LOGGING) return 0;
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    const timingEntry = {
      queryId,
      queryName,
      uniqueName,
      characterHash: characterHash || null,
      startTime,
      endTime,
      duration,
      startTimestamp,
      endTimestamp: Date.now(),
      sessionId: sessionId // Track which session this query belongs to
    };
    
    // Check if an entry with the same queryId already exists (shouldn't happen, but safety check)
    const existingIndex = queryTimings.findIndex(t => t.queryId === queryId);
    if (existingIndex !== -1) {
      console.warn(`[TRACK] Query ID ${queryId} already exists! Overwriting entry for ${uniqueName}`);
      queryTimings[existingIndex] = timingEntry;
    } else {
      queryTimings.push(timingEntry);
    }
    
    // Persist data to survive page navigations
    if (typeof window !== 'undefined') {
      persistData();
    }
    
    // Debug logging to verify tracking
    if (characterHash) {
      console.log(`[TRACK] Added timing for ${uniqueName}: queryId=${queryId}, duration=${duration.toFixed(0)}ms, total entries=${queryTimings.length}, current counter=${queryCounter}`);
    }
    
    return duration;
  };
  
  return endTracking;
}

/**
 * Get all query timings
 * @returns {Array} Array of query timing objects
 */
export function getQueryTimings() {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) return [];
  return [...queryTimings];
}

/**
 * Clear all query timings
 * @param {boolean} force - If true, clears even if queries might still be in progress
 */
export function clearQueryTimings(force = false) {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) return;
  
  const previousCount = queryTimings.length;
  
  // Don't clear if we have recent queries that might still be in progress
  if (!force && previousCount > 0) {
    const now = Date.now();
    // Check if any queries completed very recently (within last 60 seconds)
    // This suggests queries are still running
    const veryRecentQueries = queryTimings.filter(t => {
      const age = now - t.endTimestamp;
      return age < 60 * 1000; // Within last 60 seconds
    });
    
    // If we have very recent queries, don't clear (they might still be in progress)
    if (veryRecentQueries.length > 0) {
      console.log(`[TRACK] Skipping clear - ${previousCount} entries present, ${veryRecentQueries.length} completed within last 60s (may still be in progress)`);
      return;
    }
  }
  
  queryTimings.length = 0;
  queryCounter = 0; // Also reset counter when clearing
  
  // Clear persisted data only if force is true or if we actually cleared
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(COUNTER_KEY);
      // Don't clear session ID - it should persist across module reloads
    } catch (e) {
      console.warn('[TRACK] Failed to clear persisted query timings:', e);
    }
  }
  
  console.log(`[TRACK] Cleared query timings (was ${previousCount} entries)`);
}

/**
 * Export query timings as JSON
 * @returns {string} JSON string of query timings
 */
export function exportQueryTimingsAsJSON() {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) return '[]';
  return JSON.stringify(queryTimings, null, 2);
}

/**
 * Export query timings as CSV
 * @returns {string} CSV string of query timings
 */
export function exportQueryTimingsAsCSV() {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) {
    return 'Query Name,Start Time (ms),End Time (ms),Duration (ms),Start Timestamp,End Timestamp\n';
  }
  
  if (queryTimings.length === 0) {
    return 'Query Name,Start Time (ms),End Time (ms),Duration (ms),Start Timestamp,End Timestamp\n';
  }
  
  const headers = 'Query Name,Start Time (ms),End Time (ms),Duration (ms),Start Timestamp,End Timestamp\n';
  const rows = queryTimings.map(timing => 
    `${timing.queryName},${timing.startTime.toFixed(2)},${timing.endTime.toFixed(2)},${timing.duration.toFixed(2)},${timing.startTimestamp},${timing.endTimestamp}`
  ).join('\n');
  
  return headers + rows;
}

/**
 * Log waterfall visualization to console
 */
export function logWaterfall() {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) {
    return;
  }
  
  if (queryTimings.length === 0) {
    console.log('No query timings recorded');
    return;
  }
  
  // Find the earliest start time to normalize
  const earliestStart = Math.min(...queryTimings.map(t => t.startTime));
  const latestEnd = Math.max(...queryTimings.map(t => t.endTime));
  const totalDuration = latestEnd - earliestStart;
  
  console.group('📊 Query Waterfall Visualization');
  console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`);
  console.log(`Queries: ${queryTimings.length}`);
  console.log('');
  
  // Sort by start time
  const sorted = [...queryTimings].sort((a, b) => a.startTime - b.startTime);
  
  // Group by query name to show summary
  const queryGroups = {};
  sorted.forEach(timing => {
    if (!queryGroups[timing.queryName]) {
      queryGroups[timing.queryName] = [];
    }
    queryGroups[timing.queryName].push(timing);
  });
  
  // Group by character hash to identify batches
  const characterGroups = {};
  sorted.forEach(timing => {
    if (timing.characterHash) {
      if (!characterGroups[timing.characterHash]) {
        characterGroups[timing.characterHash] = [];
      }
      characterGroups[timing.characterHash].push(timing);
    }
  });
  
  // Identify batches by grouping characters that start within a small time window (100ms)
  const BATCH_TIME_WINDOW = 100; // Characters starting within 100ms are considered the same batch
  const batches = [];
  const processedCharacters = new Set();
  const characterBatchData = [];
  
  // First, collect all character data
  Object.entries(characterGroups).forEach(([characterHash, timings]) => {
    if (timings.length > 0) {
      const batchStart = Math.min(...timings.map(t => t.startTime));
      const batchEnd = Math.max(...timings.map(t => t.endTime));
      characterBatchData.push({
        characterHash,
        startTime: batchStart,
        endTime: batchEnd,
        queryCount: timings.length
      });
    }
  });
  
  // Sort by start time
  characterBatchData.sort((a, b) => a.startTime - b.startTime);
  
  // Group characters into batches based on start time proximity
  let currentBatch = [];
  let currentBatchStart = null;
  
  characterBatchData.forEach(character => {
    if (currentBatchStart === null || (character.startTime - currentBatchStart) <= BATCH_TIME_WINDOW) {
      // Add to current batch
      if (currentBatch.length === 0) {
        currentBatchStart = character.startTime;
      }
      currentBatch.push(character);
    } else {
      // Start a new batch
      if (currentBatch.length > 0) {
        batches.push({
          batchNumber: batches.length + 1,
          characters: currentBatch,
          startTime: currentBatchStart,
          endTime: Math.max(...currentBatch.map(c => c.endTime))
        });
      }
      currentBatch = [character];
      currentBatchStart = character.startTime;
    }
  });
  
  // Add the last batch
  if (currentBatch.length > 0) {
    batches.push({
      batchNumber: batches.length + 1,
      characters: currentBatch,
      startTime: currentBatchStart,
      endTime: Math.max(...currentBatch.map(c => c.endTime))
    });
  }
  
  console.log('📈 Summary by Query Type:');
  Object.entries(queryGroups).forEach(([name, timings]) => {
    const avgDuration = timings.reduce((sum, t) => sum + t.duration, 0) / timings.length;
    const minDuration = Math.min(...timings.map(t => t.duration));
    const maxDuration = Math.max(...timings.map(t => t.duration));
    console.log(`  ${name}: ${timings.length} execution(s), avg: ${avgDuration.toFixed(0)}ms, min: ${minDuration.toFixed(0)}ms, max: ${maxDuration.toFixed(0)}ms`);
  });
  
  if (batches.length > 0) {
    const EXPECTED_QUERIES_PER_CHARACTER = 14; // 8 character queries + 6 corporation queries
    
    console.log('');
    console.log('👥 Character Batches:');
    batches.forEach((batch) => {
      const batchOffset = ((batch.startTime - earliestStart) / totalDuration) * 100;
      const batchDuration = ((batch.endTime - batch.startTime) / totalDuration) * 100;
      const totalQueries = batch.characters.reduce((sum, c) => sum + c.queryCount, 0);
      const expectedTotal = batch.characters.length * EXPECTED_QUERIES_PER_CHARACTER;
      
      if (batch.characters.length === 1) {
        const char = batch.characters[0];
        const isComplete = char.queryCount === EXPECTED_QUERIES_PER_CHARACTER;
        const statusIcon = isComplete ? '✅' : '⚠️';
        const statusText = isComplete 
          ? `${char.queryCount}/${EXPECTED_QUERIES_PER_CHARACTER} queries`
          : `${char.queryCount}/${EXPECTED_QUERIES_PER_CHARACTER} queries (missing ${EXPECTED_QUERIES_PER_CHARACTER - char.queryCount})`;
        console.log(`  Batch ${batch.batchNumber}: ${statusIcon} Character ${char.characterHash.slice(0, 8)} - ${statusText}, started at ${batchOffset.toFixed(1)}% of total duration`);
      } else {
        const allComplete = batch.characters.every(c => c.queryCount === EXPECTED_QUERIES_PER_CHARACTER);
        const statusIcon = allComplete ? '✅' : '⚠️';
        const statusText = totalQueries === expectedTotal 
          ? `${totalQueries} total queries (${batch.characters.length} × ${EXPECTED_QUERIES_PER_CHARACTER})`
          : `${totalQueries}/${expectedTotal} total queries (expected ${batch.characters.length} × ${EXPECTED_QUERIES_PER_CHARACTER})`;
        console.log(`  Batch ${batch.batchNumber}: ${statusIcon} ${batch.characters.length} characters - ${statusText}, started at ${batchOffset.toFixed(1)}% of total duration`);
        batch.characters.forEach(char => {
          const isComplete = char.queryCount === EXPECTED_QUERIES_PER_CHARACTER;
          const charStatus = isComplete ? '✅' : '⚠️';
          const charText = isComplete 
            ? `${char.queryCount}/${EXPECTED_QUERIES_PER_CHARACTER} queries`
            : `${char.queryCount}/${EXPECTED_QUERIES_PER_CHARACTER} queries (missing ${EXPECTED_QUERIES_PER_CHARACTER - char.queryCount})`;
          console.log(`    ${charStatus} Character ${char.characterHash.slice(0, 8)}: ${charText}`);
        });
      }
    });
  }
  
  console.log('');
  console.log('📊 Detailed Waterfall:');
  
  sorted.forEach(timing => {
    const offset = ((timing.startTime - earliestStart) / totalDuration) * 100;
    const width = (timing.duration / totalDuration) * 100;
    const bar = '█'.repeat(Math.max(1, Math.floor(width / 2)));
    const displayName = timing.uniqueName || timing.queryName;
    
    // Color code by duration (red for slow queries)
    const color = timing.duration > 10000 ? '#F44336' : timing.duration > 5000 ? '#FF9800' : '#4CAF50';
    
    console.log(
      `%c${displayName.padEnd(50)} %c[${offset.toFixed(1)}%] ${bar} ${timing.duration.toFixed(0)}ms`,
      `color: ${color}`,
      'color: #2196F3'
    );
  });
  
  console.groupEnd();
}

/**
 * Download query timings as a file
 * @param {string} format - 'json' or 'csv'
 */
export function downloadQueryTimings(format = 'json') {
  if (!ENABLE_QUERY_WATERFALL_LOGGING) {
    return;
  }
  
  const data = format === 'csv' ? exportQueryTimingsAsCSV() : exportQueryTimingsAsJSON();
  const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `query-waterfall-${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Make functions available globally for console access
if (typeof window !== 'undefined') {
  window.queryWaterfall = {
    getTimings: getQueryTimings,
    clear: clearQueryTimings,
    exportJSON: exportQueryTimingsAsJSON,
    exportCSV: exportQueryTimingsAsCSV,
    log: logWaterfall,
    download: downloadQueryTimings,
    enabled: ENABLE_QUERY_WATERFALL_LOGGING
  };
}
