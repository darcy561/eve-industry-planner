import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";

import { testQueryClient } from "../../../../tests/queryClients.js";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("./useWatchlistPricing.js", () => ({
  useWatchlistPricing: () => ({ buyingPrice: () => 0, sellWorth: () => 0 }),
}));

vi.mock("./ItemRowExpanded", () => ({
  ExpandedWatchlistRow: () => null,
}));

vi.mock("../../../../Functions/Installation Costs/installCosts", () => ({
  calculateInstallCostfromSetup: () => 0,
}));

const { WatchListRow } = await import("./ItemRow.jsx");
const { jobTypes } = await import("../../../../Context/defaultValues");

const SAVED_STRUCTURE = {
  id: "manStruct-saved",
  jobType: jobTypes.manufacturing,
  name: "Sotiyo",
};

const WARNING =
  /custom structure used to calculate the install costs is missing/i;

function warningIcon() {
  return screen.queryByTestId("WarningAmberIcon");
}

function show(customStructureID, { saved = [] } = {}) {
  store.current = { applicationSettings: { customStructures: saved } };

  return render(
    <QueryClientProvider client={testQueryClient()}>
      <ThemeProvider theme={createTheme()}>
        <WatchListRow
          index={0}
          onEditWatchlistItem={() => {}}
          item={{
            id: 1,
            typeID: 34,
            name: "Tritanium",
            quantity: 1,
            materials: [],
            buildData: {
              jobType: jobTypes.manufacturing,
              customStructureID,
              structureID: 0,
              rigSlot1: 0,
              rigSlot2: 0,
              systemTypeID: 0,
              systemID: 30000142,
              taxValue: 0,
            },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("warning a reader their watched item's structure is gone", () => {
  it("says nothing when the item was never built against a saved structure", () => {
    show("");

    expect(warningIcon()).not.toBeInTheDocument();
  });

  it("says nothing when the structure it names is still saved", () => {
    show(SAVED_STRUCTURE.id, { saved: [SAVED_STRUCTURE] });

    expect(warningIcon()).not.toBeInTheDocument();
  });

  it("warns when the structure it names has been deleted", async () => {
    show(SAVED_STRUCTURE.id, { saved: [] });

    expect(warningIcon()).toBeInTheDocument();

    await userEvent.hover(warningIcon());
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
  });
});
