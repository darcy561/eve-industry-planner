/**
 * A finite number from what a caller passed, or the fallback.
 *
 * Structure settings come from text fields and from stored documents, so a
 * value arrives as a number, as the string a user typed, or as nothing at all.
 *
 * @param {*} value - The value to read
 * @param {number} [fallback=0] - What to use when it is not a number
 * @returns {number}
 */
export default function coerceFiniteNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : fallback;
}
