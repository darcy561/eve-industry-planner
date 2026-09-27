/**
 * The envelope a refused write is answered with, shared by every refusal and told
 * apart on `error` alone.
 */

/**
 * Reads a refusal body, or null when it is not the refusal `errorCode` names or
 * names no usable row.
 *
 * @template T
 * @param {string} text - Raw response body, already read from the `Response`.
 * @param {string} errorCode - The `error` value this refusal is known by.
 * @param {(row: Record<string, unknown>) => T|null} mapRow - One `rejected[]` row, or null to drop it.
 * @returns {{collection: string, saved: number, rejected: T[]}|null}
 */
export function parseRefusalBody(text, errorCode, mapRow) {
  let body;
  try {
    body = JSON.parse(text.trim() || "{}");
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  if (body.error !== errorCode) return null;

  const rows = (Array.isArray(body.rejected) ? body.rejected : [])
    .map((row) => (row && typeof row === "object" ? mapRow(row) : null))
    .filter((row) => row !== null);
  if (rows.length === 0) return null;

  return {
    collection: typeof body.collection === "string" ? body.collection : "",
    saved: typeof body.saved === "number" ? body.saved : 0,
    savedDocIDs: Array.isArray(body.savedDocIDs)
      ? body.savedDocIDs.filter((id) => typeof id === "string" && id !== "")
      : [],
    rejected: rows,
  };
}

/**
 * A `rejected[]` row's document id, or "" when it names none.
 *
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function refusalRowDocID(row) {
  return typeof row.docID === "string" ? row.docID : "";
}
