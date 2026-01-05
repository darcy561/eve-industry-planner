import getMarketDataStatusFromFirebase from "../Firebase/getMarketDataStatus";
import getMarketDataFromFirebase from "../Firebase/getMarketData";

/**
 * Polls for processing items until they're ready or timeout is reached.
 * Continuously checks the status of items that are still being processed
 * on the server and fetches their data once they become available.
 * 
 * @param {Array<Object>} processingItems - Array of items still being processed
 * @param {Object} initialResults - Initial results object to update with new data
 * @param {number} [maxAttempts=10] - Maximum number of polling attempts
 * @param {number} [delayMs=4000] - Delay between polling attempts in milliseconds
 * @returns {Promise<void>} Promise that resolves when polling is complete
 * 
 * @example
 * const processingItems = [{ typeID: 34, status: 'processing' }];
 * const results = {};
 * await pollForProcessingItems(processingItems, results, 5, 2000);
 * console.log("Polling complete");
 */
async function pollForProcessingItems(processingItems, initialResults, maxAttempts = 10, delayMs = 4000) {
    const processingIDs = processingItems.map(item => item.typeID);
    let attempts = 0;

    while (attempts < maxAttempts && processingIDs.length > 0) {
        attempts++;

        // Wait before polling
        await new Promise(resolve => setTimeout(resolve, delayMs));

        try {
            // Check status of processing items
            const statusData = await getMarketDataStatusFromFirebase(processingIDs);
            const readyItems = statusData.filter(item => item.status === 'ready');

            if (readyItems.length > 0) {
                // Fetch the actual data for ready items
                const readyIDs = readyItems.map(item => item.typeID);
                const dataResponse = await getMarketDataFromFirebase(readyIDs);

                // Update initial results with new data
                if (Array.isArray(dataResponse)) {
                    dataResponse.forEach((item, index) => {
                        // Only process items that have actual market data (not processing status objects)
                        if (item.typeID && (!item.hasOwnProperty('status') || item.status !== 'processing') && item.lastUpdated !== null) {
                            initialResults[item.typeID] = item;
                        }
                    });
                } else {
                    const values = Object.values(dataResponse);
                    values.forEach((item, index) => {
                        // Only process items that have actual market data (not processing status objects)
                        if (item.typeID && (!item.hasOwnProperty('status') || item.status !== 'processing') && item.lastUpdated !== null) {
                            initialResults[item.typeID] = item;
                        }
                    });
                }

                // Remove ready items from processing list
                const stillProcessing = processingIDs.filter(id =>
                    !readyItems.some(item => item.typeID === id)
                );
                processingIDs.length = 0;
                processingIDs.push(...stillProcessing);
            }
        } catch (error) {
            console.warn(`Polling attempt ${attempts} failed:`, error);
        }
    }

    if (processingIDs.length > 0) {
        console.warn(`${processingIDs.length} items still processing after ${maxAttempts} attempts`);
    }
}

export default pollForProcessingItems;
