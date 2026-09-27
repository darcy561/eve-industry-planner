import coerceFiniteNumber from "./coerceFiniteNumber";

/**
 * A tax percentage from what a caller passed, never negative — `2.5` means 2.5%,
 * and a consumer divides by 100 where it costs something.
 *
 * @param {*} value - The value to read
 * @returns {number} A finite percentage, never below zero
 */
export default function coerceTaxPercentage(value) {
  return Math.max(coerceFiniteNumber(value, 0), 0);
}
