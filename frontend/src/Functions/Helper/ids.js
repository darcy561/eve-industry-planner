/**
 * Reading ids from whatever a caller passed.
 *
 * Ids reach the SPA as one value, an array or a Set, and as numbers or the
 * strings a document or a text field held them in. Job ids are strings and EVE
 * type, order and run ids are numbers, so a value has to be read as one or the
 * other before it can be compared — a Set of `"587"` never matches a lookup for
 * `587`.
 *
 * Nothing here throws: the callers are mutations that would be left half done,
 * and a caller that must refuse an empty input checks for it before calling.
 */

/**
 * A list of ids from whatever a caller passed.
 *
 * @param {*} value - One id, or an iterable of them
 * @returns {Array<*>} The ids, in the order given; empty for nothing
 */
export function asIDList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return [...value];
  if (value instanceof Set) return [...value];
  return [value];
}

/**
 * An id as a string, for the ids the planner mints — job ids, group ids.
 *
 * @param {*} id
 * @returns {string|null} The id, or null when there was none
 */
export function asStringID(id) {
  return id != null ? String(id) : null;
}

/**
 * An id as a number, for the ids EVE issues — type ids, order ids, run ids.
 *
 * An id is a whole number, and documents have held them as doubles, so the
 * value is truncated rather than kept as it arrived.
 *
 * @param {*} id
 * @returns {number|null} The id, or null when it does not read as a number
 */
export function asNumberID(id) {
  if (id == null || id === "") return null;
  const numeric = Number(id);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

/**
 * A list of string ids, in the order given, with anything unreadable left out.
 *
 * @param {*} value - One id, or an iterable of them
 * @returns {Array<string>}
 */
export function asStringIDList(value) {
  return toIDList(value, asStringID);
}

/**
 * A list of number ids, in the order given, with anything unreadable left out.
 *
 * @param {*} value - One id, or an iterable of them
 * @returns {Array<number>}
 */
export function asNumberIDList(value) {
  return toIDList(value, asNumberID);
}

/**
 * A Set of string ids, with anything unreadable left out.
 *
 * @param {*} value - One id, or an iterable of them
 * @returns {Set<string>}
 */
export function asStringIDSet(value) {
  return toIDSet(value, asStringID);
}

/**
 * A Set of number ids, with anything unreadable left out.
 *
 * @param {*} value - One id, or an iterable of them
 * @returns {Set<number>}
 */
export function asNumberIDSet(value) {
  return toIDSet(value, asNumberID);
}

/**
 * Adds ids to a set, reading each one first.
 *
 * @param {Set} target - The set to add to
 * @param {*} value - One id, or an iterable of them
 * @param {Function} read - `asStringID` or `asNumberID`
 */
export function addIDsToSet(target, value, read) {
  for (const id of asIDList(value)) {
    const readID = read(id);
    if (readID !== null) target.add(readID);
  }
}

/**
 * Removes ids from a set, reading each one first.
 *
 * @param {Set} target - The set to remove from
 * @param {*} value - One id, or an iterable of them
 * @param {Function} read - `asStringID` or `asNumberID`
 */
export function removeIDsFromSet(target, value, read) {
  for (const id of asIDList(value)) {
    const readID = read(id);
    if (readID !== null) target.delete(readID);
  }
}

/** @param {*} value @param {Function} read @returns {Array} */
function toIDList(value, read) {
  const ids = [];
  for (const id of asIDList(value)) {
    const readID = read(id);
    if (readID !== null) ids.push(readID);
  }
  return ids;
}

/** @param {*} value @param {Function} read @returns {Set} */
function toIDSet(value, read) {
  return new Set(toIDList(value, read));
}
