export const NOTHING_AT_PATH = Symbol("nothing at that path");

/**
 * The value a document holds at a path of keys, or `NOTHING_AT_PATH` where the path leads nowhere.
 *
 * @param {*} document
 * @param {Array<string|number>} path
 * @returns {*}
 */
export function valueAtPath(document, path) {
  let held = document;
  for (const step of path) {
    if (held === null || typeof held !== "object" || !(step in held)) {
      return NOTHING_AT_PATH;
    }
    held = held[step];
  }
  return held;
}

/**
 * Whether two plain values hold the same thing, comparing objects and arrays by their contents.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]),
  );
}
