import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import MaterialCards from "./materialCards";
import { MATERIAL_PLAN } from "../../../../../../Functions/MarketData/materialSourcingRow";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  });
});

const row = (overrides = {}) => ({
  typeID: 34,
  name: "Tritanium",
  quantity: 10_000_000,
  buyPrice: 5.4,
  buildPrice: 4.95,
  delta: -0.083,
  plan: MATERIAL_PLAN.BUILD,
  isBuildable: true,
  isLinked: true,
  volume: 10,
  mark: { kind: "buildable", label: "Buildable", jobType: 1 },
  marketSelect: "jita",
  listingSelect: "buyP95",
  ...overrides,
});

const renderCards = (rows = [row()], props = {}) =>
  render(
    <MaterialCards
      rows={rows}
      formatIsk={(v) => v.toFixed(2)}
      formatQuantity={(v) => String(v)}
      {...props}
    />,
  );

// A seven-column table cannot survive a 360px stack; the figures can.
describe("the material cards", () => {
  it("carries every figure the table does", () => {
    renderCards();

    for (const label of ["Qty", "Buy", "Δ"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // "Build" is both a figure label and the plan chip on this row.
    expect(screen.getAllByText("Build").length).toBe(2);
  });

  // The verdict chip is the one element that must survive every breakpoint —
  // it is the answer, and nothing competes with it for the card's right edge.
  it("keeps the plan chip on the card's first line", () => {
    renderCards();
    // The chip is the one in a MuiChip; the other "Build" is a figure label.
    const chip = screen
      .getAllByText("Build")
      .find((el) => el.closest(".MuiChip-root"));

    expect(chip).toBeDefined();
    expect(chip.closest(".MuiChip-root")).toBeInTheDocument();
  });

  it("shortens a figure rather than letting it wrap", () => {
    renderCards();

    // The suffix's case comes from the platform's locale data — a browser gives
    // "10M" where Node's ICU gives "10m" — so the shortening is what is asserted.
    expect(screen.getByText(/^10m$/i)).toBeInTheDocument();
  });

  // Shortening costs a reader nothing they cannot get back; truncating a label
  // costs them the label.
  it("keeps the full figure available on tap", () => {
    renderCards();

    expect(screen.getByLabelText("10000000")).toBeInTheDocument();
  });

  it("names where the row's price came from", () => {
    renderCards();

    expect(screen.getByText(/Jita/)).toBeInTheDocument();
  });

  it("opens a row's drawer beneath its own card", () => {
    renderCards([row()], {
      openTypeIDs: [34],
      renderDrawer: (r, isOpen) =>
        isOpen ? <div>drawer for {r.name}</div> : null,
    });

    expect(screen.getByText(/drawer for Tritanium/)).toBeInTheDocument();
  });
});

// The cards are the whole stage below `sm`, so a shortfall invisible here is
// invisible on a phone. They read the same PlanCell the table does, which is
// what keeps the two from drifting — but only a test proves the wiring.
describe("a card whose child jobs no longer make enough", () => {
  const short = {
    required: 10_000_000,
    produced: 4_000_000,
    shortfall: 6_000_000,
    isShort: true,
    mode: "extrapolate",
  };

  it("carries the shortfall tag beside the plan chip", () => {
    renderCards([
      row({ coverage: short, matchedChildJobs: [{ name: "Trit job" }] }),
    ]);

    expect(screen.getByText("6,000,000 short")).toBeInTheDocument();
  });

  it("still shows it on a linked row whose job now makes nothing", () => {
    renderCards([
      row({
        plan: MATERIAL_PLAN.BUY,
        buildPrice: null,
        delta: null,
        coverage: { ...short, produced: 0, shortfall: 10_000_000 },
      }),
    ]);

    expect(screen.getByText("10,000,000 short")).toBeInTheDocument();
  });

  it("says nothing on a card its jobs still cover", () => {
    renderCards([
      row({
        coverage: {
          ...short,
          produced: 10_000_000,
          shortfall: 0,
          isShort: false,
        },
      }),
    ]);

    expect(screen.queryByText(/short/)).not.toBeInTheDocument();
  });
});
