/**
 * The envelope a refused write is answered with.
 *
 * Two refusals share it — a document lock held elsewhere and a revision
 * conflict — and they are told apart on `error` alone. The rows beneath differ
 * because they carry different facts, so each caller maps its own; what is
 * shared, and stated here once, is the envelope and the rule that a body whose
 * `error` does not match is not this refusal whatever else it carries.
 */

/**
 * Reads a refusal body, or null when it is not the refusal `errorCode` names.
 *
 * Null rather than an empty result for a body naming no usable row: a caller
 * clears a queue from what it is told, and "refused nothing" would be read as
 * "refused everything" by the code that answers an empty list.
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
    // How many of the batch still landed. A refusal does not mean nothing
    // happened, and a caller that treats it that way re-sends what was written.
    saved: typeof body.saved === "number" ? body.saved : 0,
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
