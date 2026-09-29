/** A delta names the revision it produces and the one it applies onto. */
export const DELTA_APPLIES = "applies";

/** A delta at or below what is held has already been applied. */
export const DELTA_SEEN = "seen";

/** A delta naming a revision that was never held means a delivery was missed. */
export const DELTA_GAP = "gap";

/**
 * Reads a delivery's delta, answering null where it carries none this client can
 * use, so the whole document carries the change instead.
 *
 * @param {Record<string, unknown>} message
 * @returns {{changed: {path: string[], value: unknown}[], removed: string[][], revision: number, appliesTo: number}|null}
 */
export function deltaFromMessage(message) {
  const revision = Number(message?.revision);
  const appliesTo = Number(message?.appliesTo);
  if (!Number.isFinite(revision) || !Number.isFinite(appliesTo)) return null;

  const changed = message?.changed ?? [];
  const removed = message?.removed ?? [];
  if (!Array.isArray(changed) || !Array.isArray(removed)) return null;
  if (!changed.every((change) => isPath(change?.path))) return null;
  if (!removed.every(isPath)) return null;
  if (changed.length === 0 && removed.length === 0) return null;

  return { changed, removed, revision, appliesTo };
}

/**
 * Whether a delta lands on the document a client holds, repeats one it already
 * applied, or proves a delivery was missed.
 *
 * @param {number|null} held - The revision of the document this client holds
 * @param {{revision: number, appliesTo: number}} delta
 * @returns {string}
 */
export function deltaVerdict(held, delta) {
  if (!Number.isFinite(held)) return DELTA_GAP;
  if (delta.appliesTo === held) return DELTA_APPLIES;
  if (delta.revision <= held) return DELTA_SEEN;
  return DELTA_GAP;
}

/** The revision a stored job document holds, or null where it holds none. */
export function revisionOf(document) {
  const held = Number(document?._meta?.revision);
  return Number.isFinite(held) ? held : null;
}

/**
 * Applies what a delivery said changed onto the document a client holds, setting
 * each value whole at its path and answering a new document.
 *
 * @param {object} document
 * @param {{changed: {path: string[], value: unknown}[], removed: string[][], revision: number}} delta
 * @returns {object}
 */
export function applyJobDelta(document, delta) {
  let next = document;
  for (const { path, value } of delta.changed) {
    next = setAt(next, path, value);
  }
  for (const path of delta.removed) {
    next = removeAt(next, path);
  }
  return setAt(next, ["_meta", "revision"], delta.revision);
}

function isPath(path) {
  return (
    Array.isArray(path) &&
    path.length > 0 &&
    path.every((step) => typeof step === "string")
  );
}

function isDocument(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function setAt(held, path, value) {
  const [step, ...rest] = path;
  const next = isDocument(held) ? { ...held } : {};
  next[step] = rest.length === 0 ? value : setAt(next[step], rest, value);
  return next;
}

function removeAt(held, path) {
  if (!isDocument(held)) return held;
  const [step, ...rest] = path;
  if (!(step in held)) return held;

  const next = { ...held };
  if (rest.length === 0) {
    delete next[step];
    return next;
  }
  next[step] = removeAt(held[step], rest);
  return next;
}
