import { screen } from "@testing-library/react";

/**
 * The number shown against a label on the rendered page.
 *
 * A panel writes its figures through the locale formatter, so what is on screen
 * carries separators and sits beside its label in one line of text. A test
 * asserting on the figure wants the number, and reading it back this way is
 * what lets the assertion state a figure rather than a formatted string.
 *
 * @param {string} label - The text the figure is shown against
 * @returns {number}
 */
export function figureFor(label) {
  const line = screen.getByText(new RegExp(label)).textContent;
  return Number(
    line.replace(new RegExp(`^.*${label}[:\\s]*`), "").replace(/,/g, ""),
  );
}
