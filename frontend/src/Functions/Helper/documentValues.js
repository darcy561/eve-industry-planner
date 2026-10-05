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

/**
 * A copy of a document with a value set at a path of keys, creating the documents along the way.
 *
 * @param {*} document
 * @param {Array<string|number>} path
 * @param {*} value
 * @returns {object}
 */
export function withValueAtPath(document, path, value) {
  const [step, ...rest] = path;
  const next = isPlainDocument(document) ? { ...document } : {};
  next[step] =
    rest.length === 0 ? value : withValueAtPath(next[step], rest, value);
  return next;
}

/**
 * A copy of a document without the value at a path of keys, or the document itself where the path
 * leads nowhere.
 *
 * @param {*} document
 * @param {Array<string|number>} path
 * @returns {*}
 */
export function withoutValueAtPath(document, path) {
  if (!isPlainDocument(document)) return document;
  const [step, ...rest] = path;
  if (!(step in document)) return document;
  const next = { ...document };
  if (rest.length === 0) {
    delete next[step];
    return next;
  }
  next[step] = withoutValueAtPath(document[step], rest);
  return next;
}

/**
 * Whether a value is a plain document rather than a list or a leaf.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isPlainDocument(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
