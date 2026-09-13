import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SourcingFooter, SourcingOffer } from "./sourcingSummary";

const formatIsk = (value) => `${(value / 1_000_000).toFixed(1)}M ISK`;
const formatVolume = (value) => `${value.toLocaleString("en-GB")} m³`;

const summary = (overrides = {}) => ({
  materials: 16,
  buildable: 3,
  costed: 3,
  linked: 2,
  volume: 214_800,
  savingAvailable: 22_800_000,
  cheaperToBuild: 2,
  ...overrides,
});

describe("the offer to build", () => {
  it("says how many rows and what switching them saves", () => {
    render(
      <SourcingOffer
        summary={summary()}
        formatIsk={formatIsk}
        onApply={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Building 2 of 3 saves 22.8M ISK",
    );
  });

  it("is absent when there is nothing to gain", () => {
    // A strip saying a change would save nothing is an invitation to make it.
    render(
      <SourcingOffer
        summary={summary({ savingAvailable: 0, cheaperToBuild: 0 })}
        formatIsk={formatIsk}
        onApply={() => {}}
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("applies when asked", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <SourcingOffer
        summary={summary()}
        formatIsk={formatIsk}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(onApply).toHaveBeenCalledOnce();
  });

  it("cannot be applied while the job is read only", () => {
    render(
      <SourcingOffer
        summary={summary()}
        formatIsk={formatIsk}
        onApply={() => {}}
        disabled
      />,
    );

    expect(screen.getByRole("button", { name: /apply/i })).toBeDisabled();
  });
});

describe("the footer", () => {
  it("counts the list and states its volume", () => {
    render(<SourcingFooter summary={summary()} formatVolume={formatVolume} />);

    expect(
      screen.getByText("16 materials · 3 buildable · 2 linked"),
    ).toBeInTheDocument();
    expect(screen.getByText("214,800 m³")).toBeInTheDocument();
  });

  it("does not call a single material materials", () => {
    render(
      <SourcingFooter
        summary={summary({ materials: 1 })}
        formatVolume={formatVolume}
      />,
    );

    expect(screen.getByText(/^1 material ·/)).toBeInTheDocument();
  });
});
