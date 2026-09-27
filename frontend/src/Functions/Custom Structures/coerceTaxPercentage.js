import coerceFiniteNumber from "../Helper/coerceFiniteNumber";

/**
 * A tax percentage from what a caller passed.
 *
 * Tax is held as a **percentage, not a fraction**: `2.5` means 2.5%, and a
 * consumer divides by 100 where it costs something. A reader types a percentage
 * and every screen prints one, so a stored fraction would disagree with the
 * number the user entered.
 *
 * A negative figure is not a discount — a structure charges or it does not — so
 * it reads as no tax rather than as money back.
 *
 * @param {*} value - The value to read
 * @returns {number} A finite percentage, never below zero
 */
export default function coerceTaxPercentage(value) {
  return Math.max(coerceFiniteNumber(value, 0), 0);
}
