import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function show({ rigSlot1 = 0, rigSlot2 = 0 } = {}) {
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
            structureID: 0,
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

async function fit(picker, rigLabel) {
  await userEvent.click(picker);
  await userEvent.click(screen.getByRole("option", { name: rigLabel }));
}

function storedSetup(setMaterialJobs) {
  const [changed] = setMaterialJobs.mock.calls.at(-1);
  return changed[ITEM].build.setup["setup-1"];
}

describe("fitting a watched item's rigs by hand", () => {
  it("offers a picker for each of the two slots a structure carries", () => {
    show();

    expect(rigPickers()).toHaveLength(2);
  });

  it("fits a rig chosen for the second slot to the second slot", async () => {
    const { setMaterialJobs } = show();

    await fit(rigPickers()[1], rigs[2].label);

    expect(storedSetup(setMaterialJobs).rigSlot2).toBe(2);
    expect(storedSetup(setMaterialJobs).rigSlot1).toBe(0);
  });

  it("refuses a rig in the second slot that competes with the first", async () => {
    const competing = rigs[2].relatedTo[0];
    const { setMaterialJobs } = show({ rigSlot1: competing });

    await fit(rigPickers()[1], rigs[2].label);

    expect(storedSetup(setMaterialJobs).rigSlot2).toBe(0);
    expect(storedSetup(setMaterialJobs).rigSlot1).toBe(competing);
  });
});
