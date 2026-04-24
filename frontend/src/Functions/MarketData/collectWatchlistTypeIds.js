/**
 * Collects all typeIDs referenced by watchlist items (item + nested materials), matching
 * the walk previously done in the Firebase listener.
 * @param {Array<{ typeID?: number, materials?: Array<unknown> }>} items
 * @returns {Set<number>}
 */
export function collectWatchlistTypeIds(items) {
  const ids = new Set();
  if (!Array.isArray(items)) {
    return ids;
  }
  for (const item of items) {
    if (item == null || typeof item !== "object") continue;
    if (typeof item.typeID === "number" && Number.isFinite(item.typeID)) {
      ids.add(item.typeID);
    }
    const mats = item.materials;
    if (!Array.isArray(mats)) continue;
    for (const mat of mats) {
      if (mat == null || typeof mat !== "object") continue;
      if (typeof mat.typeID === "number" && Number.isFinite(mat.typeID)) {
        ids.add(mat.typeID);
      }
      const cMats = mat.materials;
      if (!Array.isArray(cMats)) continue;
      for (const c of cMats) {
        if (c == null || typeof c !== "object") continue;
        if (typeof c.typeID === "number" && Number.isFinite(c.typeID)) {
          ids.add(c.typeID);
        }
      }
    }
  }
  return ids;
}
