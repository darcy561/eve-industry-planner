/**
 * Whether a figure read for a type is a price: a market holding no orders reads 0, and a real order is
 * never 0, so 0 — like a missing or unreadable figure — is no price.
 *
 * @param {number|undefined|null} value
 * @returns {boolean}
 */
export function isPriced(value) {
  return Number.isFinite(value) && value > 0;
}
