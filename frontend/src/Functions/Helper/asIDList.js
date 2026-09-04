/**
 * A list of ids from whatever a caller passed: one id, an array, or a Set.
 *
 * It never throws and never rejects a value, because the call sites are
 * mutations that would be left half-done — a caller that must refuse an empty
 * or missing input checks for it before calling.
 *
 * @param {*} value - One id, or an iterable of them
 * @returns {Array<*>} The ids, in the order given; empty for nothing
 */
export default function asIDList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return [...value];
  if (value instanceof Set) return [...value];
  return [value];
}
