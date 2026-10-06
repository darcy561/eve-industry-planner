import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import StatusChip, { STATUS_TONE } from "./statusChip";

const chipFor = (label) => screen.getByText(label).closest(".MuiChip-root");

describe("StatusChip", () => {
  it("states the status it was given", () => {
    render(<StatusChip label="Build" />);

    expect(screen.getByText("Build")).toBeInTheDocument();
  });

  it("colours each tone distinctly, so a panel names a state rather than a colour", () => {
    const tones = [
      [STATUS_TONE.GOOD, /colorSuccess/],
      [STATUS_TONE.WARN, /colorWarning/],
      [STATUS_TONE.BAD, /colorError/],
      [STATUS_TONE.FACT, /colorPrimary/],
    ];

    for (const [tone, expected] of tones) {
      const { unmount } = render(<StatusChip label="x" tone={tone} />);
      expect(chipFor("x").className).toMatch(expected);
      unmount();
    }
  });

  it("carries no weight when no tone is given", () => {
    render(<StatusChip label="Buy" />);

    expect(chipFor("Buy").className).toMatch(/colorDefault/);
  });
});
