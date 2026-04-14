import fetchSystemIndexes from "../Endpoints/Public/systemIndexes";

/*
* Splits a large array of system IDs into smaller chunks for efficient API requests.
* Creates Firebase performance traces and returns an array of promises for parallel processing.
* 
* @param {Array<number>} requestArray - Array of system IDs to request system indexes for
* @returns {Array<Promise>} Array of promises for system indexes requests
* 
* @example
* const systemIndexes = await splitSystemIndexesRequestIntoChuncks([30000142, 30002187]);
* console.log(systemIndexes); // Array of system indexes
*/  

export default function splitSystemIndexesRequestIntoChuncks(requestArray) {
    const MAX_CHUNK_SIZE = 500;
    const promises = [];

    if (!requestArray || requestArray.length === 0) return promises;

    for (let x = 0; x < requestArray.length; x += MAX_CHUNK_SIZE) {
        const chunk = requestArray.slice(x, x + MAX_CHUNK_SIZE);
        promises.push(fetchSystemIndexes(chunk));
    }
    return promises;
}