import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";

import { testQueryClient } from "../../../../../tests/queryClients.js";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../../../../Functions/JobPlanner/applySetupChange", () => ({
  recalculateWatchListItemsFromSetup: () => {},
}));

const { WatchListSetupOptions_WatchlistDialogue } =
  await import("./watchlistOptions.jsx");
const { jobTypes, rigTypeMap } =
  await import("../../../../../Context/defaultValues");

const ITEM = 34;
const rigs = rigTypeMap[jobTypes.manufacturing];

function show({ rigSlot1 = 0, rigSlot2 = 0, structureID = 2 } = {}) {
  store.current = { applicationSettings: { customStructures: [] } };
  const setMaterialJobs = vi.fn();

  const materialJobs = {
    [ITEM]: {
      build: {
        setup: {
          "setup-1": {
            id: "setup-1",
            jobType: jobTypes.manufacturing,
            customStructureID: "",
            structureID,
            rigSlot1,
            rigSlot2,
            systemTypeID: 0,
            systemID: 30000142,
            taxValue: 0,
            runCount: 1,
            jobCount: 1,
          },
        },
      },
    },
  };

  render(
    <QueryClientProvider client={testQueryClient()}>
      <ThemeProvider theme={createTheme()}>
        <WatchListSetupOptions_WatchlistDialogue
          watchlistItemRequest={ITEM}
          materialJobs={materialJobs}
          setMaterialJobs={setMaterialJobs}
          itemToModify={ITEM}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );

  return { setMaterialJobs };
}

function rigPickers() {
  return screen
    .getAllByRole("combobox")
    .filter((box) => box.id?.startsWith("rig-type-select"));
}

describe("fitting a watched item's rigs by hand", () => {
  it("offers a picker for each of the two slots a structure carries", () => {
    show();

    expect(rigPickers()).toHaveLength(2);
  });

  it("gives each slot its own field, showing what it holds", () => {
    show({ rigSlot1: 1 });

    const [first, second] = rigPickers();

    expect(first).toHaveValue(rigs[1].label);
    expect(second).toHaveValue("None");
  });

  it("empties both slots at a place that allows no rig", () => {
    show({ structureID: 0, rigSlot1: 1, rigSlot2: 3 });

    const [first, second] = rigPickers();

    expect(first).toHaveValue("None");
    expect(second).toHaveValue("None");
  });
});
