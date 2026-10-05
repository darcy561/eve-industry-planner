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
