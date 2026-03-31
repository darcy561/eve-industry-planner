

/**
 * Retrieves item recipes from the migration-backed API endpoints.
 * Supports both single-item and multi-item requests.
 *
 * GET  /api/migration/item/:itemID
 * POST /api/migration/item { idArray: number[] }
 *
 * @param {string|number|Array<string|number>} itemRequests - Item ID or array of item IDs
 * @returns {Promise<Object|Array|null>} Single item object, array of items, or null/[] on failure
 */
export default async function getItemRecipeFromMigration(itemRequests) {
  const isSingleItem =
    !Array.isArray(itemRequests) || itemRequests.length === 1;

  try {
    const itemID = Array.isArray(itemRequests) ? itemRequests[0] : itemRequests;
    const URL = isSingleItem
      ? `/api/migration/item/${itemID}`
      : "/api/migration/item";

    const response = await fetch(URL, {
      method: isSingleItem ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: !isSingleItem
        ? JSON.stringify({
            idArray: itemRequests.map((id) => Number(id)),
          })
        : undefined,
    });

    if (!response.ok) {
      throw new Error(`Error retrieving item recipe: ${response.statusText}`);
    }

    const result = await response.json();

    if (Array.isArray(itemRequests) && itemRequests.length === 1) {
      return [result];
    }

    return result;
  } catch (err) {
    console.error("Error getting item recipe from migration endpoint:", err);
    return isSingleItem ? null : [];
  }
}