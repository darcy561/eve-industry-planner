import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as renderBare, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../tests/queryClients.js";

const setDefaultMarketCharacter = vi.fn();
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
      hideCompleteMaterials: false,
      defaultCitadelBrokersFee: 1,
      defaultMarketCharacter: "trader",
      actions: {
        updatePricingDefault,
        updateDefaultAssetLocation: vi.fn(),
        toggleHideCompleteMaterials: vi.fn(),
        updateCitadelBrokersFee: vi.fn(),
        setDefaultMarketCharacter,
      },
    },
    account: { characters: [], mainCharacterHash: "main" },
  });
});

vi.mock("../../../Hooks/EveEsi/useAssetLocations", () => ({
  default: () => ({ locations: [], isLoading: false }),
}));

vi.mock("./Job Settings/customSystemIndexes", () => ({ default: () => null }));
vi.mock("./Job Settings/customExtrasFrame", () => ({ default: () => null }));

const { default: JobSettingsFrame } = await import("./jobSettingsFrame");

// The frame carries a panel that reads the market group tree through the query
// cache, so every case needs a client even when it is asserting a select.
function render(ui) {
  return renderBare(
    <QueryClientProvider client={testQueryClient()}>{ui}</QueryClientProvider>,
  );
}

// The seller is a separate choice from the builder, and it belongs with the
// other market defaults rather than in a tab of its own.
describe("the default market character", () => {
  it("sits with the market defaults on Job Settings", () => {
    render(<JobSettingsFrame />);

    expect(screen.getByText("Default Market Character")).toBeInTheDocument();
  });
});

// One account default answered both questions before, so a player who bought in
// one place and listed in another could not say so.
describe("the pricing defaults", () => {
  beforeEach(() => {
    updatePricingDefault.mockClear();
  });

  it("offers a market for each side, and the axis that side answers", () => {
    render(<JobSettingsFrame />);

    for (const label of [
      "Materials market",
      "Materials prices",
      "Output market",
      "Output sold by",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows each side its own stored choice", () => {
    render(<JobSettingsFrame />);

    expect(screen.getByText("Jita")).toBeInTheDocument();
    expect(screen.getByText("Amarr")).toBeInTheDocument();
    expect(screen.getByText("Sell Orders")).toBeInTheDocument();
    // The selling side states its route out, not a basis.
    expect(screen.getByText("Sell into buy orders")).toBeInTheDocument();
  });

  it("writes a change to the side that was changed", async () => {
    render(<JobSettingsFrame />);

    const [materialsMarket] = screen.getAllByRole("combobox");
    await userEvent.click(materialsMarket);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText(/Hek/i),
    );

    expect(updatePricingDefault).toHaveBeenCalledWith(
      "buying",
      "market",
      "hek",
    );
  });

  // The other three corners of the 2x2: a control wired to the wrong side, or
  // writing the wrong field of the right side, still renders and still saves.
  it("writes the buying side's basis", async () => {
    render(<JobSettingsFrame />);

    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("Buy Orders"),
    );

    expect(updatePricingDefault).toHaveBeenCalledWith("buying", "basis", "buy");
  });

  it("writes the selling side's market", async () => {
    render(<JobSettingsFrame />);

    await userEvent.click(screen.getAllByRole("combobox")[2]);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText(/Dodixie/i),
    );

    expect(updatePricingDefault).toHaveBeenCalledWith(
      "selling",
      "market",
      "dodixie",
    );
  });

  it("writes the selling side's route out", async () => {
    render(<JobSettingsFrame />);

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
