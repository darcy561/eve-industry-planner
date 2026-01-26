/**
 * Fetches paginated data with parallel page fetching.
 * 
 * This function optimizes paginated API calls by:
 * 1. Fetching the first page to determine total pages (totalPages is used internally only)
 * 2. Fetching all remaining pages in parallel
 * 3. Combining all results into a single array
 * 
 * @param {Function} fetchPage - Function that fetches a single page
 *   Must accept a page number and return a Promise that resolves to a result object with:
 *   { data: Array, totalPages: number } - totalPages is only used internally, not returned
 * @param {number} [startPage=1] - Starting page number (default: 1)
 * @returns {Promise<Array>} Promise that resolves to combined data from all pages (data only, no totalPages)
 * 
 * @example
 * const allData = await fetchPaginatedDataParallel(async (page) => {
 *   const result = await getCharacterAssets({
 *     character: userObject,
 *     page: page,
 *     config: { characterHash, group: 'assets' }
 *   });
 *   return result; // Return full result object - totalPages is extracted internally
 * });
 */
async function fetchPaginatedDataParallel(fetchPage, startPage = 1) {
  // Fetch first page to get total pages
  const firstPageResult = await fetchPage(startPage);
  const totalPages = firstPageResult.totalPages ?? 1;
  const allData = [...(firstPageResult.data || [])];

  // If there's only one page, return early
  if (totalPages <= 1) {
    return allData;
  }

  // Fetch remaining pages in parallel
  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, i) => startPage + i + 1
  );

  const remainingPagePromises = remainingPages.map((page) => fetchPage(page));
  const remainingPageResults = await Promise.all(remainingPagePromises);

  // Combine all results
  remainingPageResults.forEach((result) => {
    if (result?.data) {
      allData.push(...result.data);
    }
  });

  return allData;
}

export default fetchPaginatedDataParallel;
