import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updatePricingDefault = vi.fn();

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    applicationSettings: {
      defaultPricing: {
        buying: { market: "jita", basis: "sell" },
        // Deliberately different from the buying side: a fixture whose sides
        // agree cannot tell a control reading the wrong one.
        selling: { market: "amarr", exit: "immediate" },
      },
      defaultStationIDForAssets: 0,
      defaultCitadelBrokersFee: 1,
      enableCompactLayoutView: false,
      actions: {
        updatePricingDefault,
        updateDefaultAssetLocation: vi.fn(),
        updateCitadelBrokersFee: vi.fn(),
        setEnableCompactLayoutView: vi.fn(),
      },
    },
    account: { characters: [], mainCharacterHash: "main" },
  });
});

vi.mock("../../../Hooks/EveEsi/useAssetLocations", () => ({
  default: () => ({ locations: [], isLoading: false }),
}));
vi.mock("./FirstLoginCustomStructures", () => ({ default: () => null }));
vi.mock("./FirstLoginJobCardPreview", () => ({
  FirstLoginJobCardPreview: () => null,
}));
vi.mock("./FirstLoginPlannerLayoutChoice", () => ({
  FirstLoginPlannerLayoutChoice: () => null,
}));
vi.mock("../shared/FirstLoginAssetLocationSelect", () => ({
  FirstLoginAssetLocationSelect: () => null,
}));

const { FirstLoginPlannerSetupStep } =
  await import("./FirstLoginPlannerSetupStep");

// Setup shares PRICING_SIDES with Job Settings so the two screens cannot offer
// different things, but it wires its own controls and nothing else covers them.
describe("the pricing defaults on first login", () => {
  beforeEach(() => {
    updatePricingDefault.mockClear();
  });

  it("offers a market for each side, and the axis that side answers", () => {
    render(<FirstLoginPlannerSetupStep />);

    for (const label of [
      "Materials market",
      "Materials prices",
      "Output market",
      "Output sold by",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows each side its own choice rather than a blank", () => {
    render(<FirstLoginPlannerSetupStep />);

    expect(screen.getByText("Jita")).toBeInTheDocument();
    expect(screen.getByText("Amarr")).toBeInTheDocument();
    expect(screen.getByText("Sell Orders")).toBeInTheDocument();
    // The selling side states its route out, not a basis.
    expect(screen.getByText("Sell into buy orders")).toBeInTheDocument();
  });

  it("writes a change to the side and field that was changed", async () => {
    render(<FirstLoginPlannerSetupStep />);

    await userEvent.click(screen.getAllByRole("combobox")[3]);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("List on the market"),
    );

    expect(updatePricingDefault).toHaveBeenCalledWith(
      "selling",
      "exit",
      "listed",
    );
  });
});
