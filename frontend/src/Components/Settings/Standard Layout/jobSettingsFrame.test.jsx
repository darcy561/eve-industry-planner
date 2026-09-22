import { describe, expect, it, vi } from "vitest";
import { render as renderBare, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../tests/queryClients.js";

const setDefaultMarketCharacter = vi.fn();

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    applicationSettings: {
      defaultPricing: {
        buying: { market: "jita", orderType: "sell" },
        selling: { market: "amarr", exit: "immediate" },
      },
      defaultStationIDForAssets: 0,
      hideCompleteMaterials: false,
      defaultCitadelBrokersFee: 1,
      defaultMarketCharacter: "trader",
      actions: {
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

// Everything naming a market — where each side is priced, the figure read there,
// and the rate for a citadel that is not a saved market — is chosen beside the
// markets it picks from, so none of it is offered twice.
describe("where a job is priced", () => {
  it("leaves the market defaults to the Market Locations tab", () => {
    render(<JobSettingsFrame />);

    for (const label of [
      "Materials market",
      "Output market",
      "Materials prices",
      "Output sold by",
      "Unsaved citadel broker fee",
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });
});
