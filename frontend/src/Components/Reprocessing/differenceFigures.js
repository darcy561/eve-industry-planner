import { FIGURE_TONE } from "../../Styled Components/Typography/figures";
import { formatIsk } from "../../Functions/Helper/numberParser";

/**
 * ISK with its sign written, so a difference reads as a gain or a loss.
 *
 * @param {number} value
 * @returns {string}
 */
export function signedIsk(value) {
  return `${value > 0 ? "+" : ""}${formatIsk(value)}`;
}

/**
 * The tone a difference reads in: a gain good, a loss bad, nothing plain.
 *
 * @param {number} value
 * @returns {string} One of FIGURE_TONE
 */
export function differenceTone(value) {
  if (value > 0) return FIGURE_TONE.GOOD;
  if (value < 0) return FIGURE_TONE.BAD;
  return FIGURE_TONE.PLAIN;
}
