import { screen } from "@testing-library/react";

/**
 * The number shown against a label on the rendered page, read back out of the
 * locale-formatted text it sits in.
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
