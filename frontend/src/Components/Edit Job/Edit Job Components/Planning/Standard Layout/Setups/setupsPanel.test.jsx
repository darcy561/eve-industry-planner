import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  blueprintRawData,
  setupFixture,
  TRITANIUM,
} from "../../../../../../tests/editJobFixtures.js";
import seedPrices from "../../../../../../tests/seedPrices.js";
import { testQueryClient } from "../../../../../../tests/queryClients.js";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    account: {
      actions: {
        getMainCharacterHash: () => "me",
        findCharacterByHash: (hash) => ({
          CharacterHash: hash,
          CharacterName: "Vex Rollo",
          isOmega: true,
        }),
      },
    },
    applicationSettings: {
      actions: { findPredefinedSystemIndex: () => undefined },
    },
    worldData: {
      actions: { findSystemIndex: () => ({ manufacturing: 0.05 }) },
    },
  });
});

vi.mock("../../../../../../Hooks/useSolarSystems", () => ({
  useSolarSystems: () => ({}),
  useSolarSystemName: (systemID) => (systemID === 30002510 ? "Rens" : "Jita"),
}));

const { SetupsPanel } = await import("./setupsPanel.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const theme = createTheme();
const session = () => useUsersStore.getState().editSession;

const setup = (id, overrides = {}) => ({
  ...setupFixture(id),
  materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity: 1000 } },
  ...overrides,
});

const openJob = (setups = [setup("setup-1")]) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    jobType: 1,
    itemsProducedPerRun: 1,
    maxProductionLimit: 4000,
    rawData: blueprintRawData(),
    build: {
      setup: Object.fromEntries(setups.map((s) => [s.id, s])),
      materials: {},
    },
    layout: { setupToEdit: setups[0]?.id ?? null },
  });

const show = (Panel = SetupsPanel) =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <ThemeProvider theme={theme}>
        <Panel />
      </ThemeProvider>
    </QueryClientProvider>,
  );

const rows = () => screen.getAllByRole("button", { expanded: false });

beforeEach(() => {
  session().actions.closeSession();
  const { customStructures } = useUsersStore.getState().applicationSettings;
  customStructures.length = 0;
});

describe("the setups a job is built from", () => {
  it("leads each row with its runs and states its install cost beside it", () => {
    seedPrices({}, { adjusted: { [TRITANIUM]: 500 } });
    openJob();

    show();

    expect(screen.getByText("1 run × 1 slot")).toBeInTheDocument();
    expect(screen.getByText("46,250 install")).toBeInTheDocument();
    expect(screen.getByText(/Vex Rollo · ME/)).toBeInTheDocument();
  });

  it("totals what the setups make and cost to install", () => {
    openJob([setup("setup-1"), setup("setup-2", { runCount: 4 })]);

    show();

    expect(screen.getByText("2 setups")).toBeInTheDocument();
    expect(screen.getByText(/^5 items · /)).toBeInTheDocument();
  });

  it("states the facility every setup shares once", () => {
    openJob([setup("setup-1"), setup("setup-2")]);

    show();

    expect(screen.getByText(/All two build at/)).toBeInTheDocument();
    expect(screen.queryByText(/instead/)).not.toBeInTheDocument();
  });

  it("marks the setup that builds somewhere else, on its own row", () => {
    openJob([
      setup("setup-1"),
      setup("setup-2"),
      setup("setup-3", { systemID: 30002510 }),
    ]);

    show();

    expect(screen.getByText(/Two of three build at/)).toBeInTheDocument();
    expect(screen.getByText(/^Builds in Rens instead/)).toBeInTheDocument();
  });

  it("names only what a departing setup changes", () => {
    const medium = { structureID: 1, systemTypeID: 1 };
    openJob([
      setup("setup-1", medium),
      setup("setup-2", medium),
      setup("setup-3", { ...medium, taxValue: 1 }),
    ]);

    show();

    expect(
      screen.getByText(/^Builds at 1% facility tax instead/),
    ).toBeInTheDocument();
  });

  it("flags a departing setup whose saved structure is gone", () => {
    openJob([
      setup("setup-1"),
      setup("setup-2"),
      setup("setup-3", { customStructureID: "manStruct-gone" }),
    ]);

    show();

    expect(screen.getByTestId("WarningAmberIcon")).toBeInTheDocument();
  });

  it("follows a setup being added", async () => {
    openJob();
    show();

    await act(async () => {
      session().actions.run({
        name: "add a setup",
        recipe: (job) => {
          job.build.setup["setup-2"] = setup("setup-2", { runCount: 7 });
        },
      });
    });

    expect(screen.getByText("7 runs × 1 slot")).toBeInTheDocument();
  });

  it("is not re-rendered by a change to the rest of the job", async () => {
    openJob();
    const renders = renderCounts();
    show(renders.watch("setups", SetupsPanel));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("setups")).toBe(0);
  });
});

describe("opening a setup", () => {
  it("opens the editor under the row, grouped as how much, where and who", () => {
    openJob();
    show();

    fireEvent.click(rows()[0]);

    expect(screen.getByText("How much")).toBeInTheDocument();
    expect(screen.getByText("Where")).toBeInTheDocument();
    expect(
      screen.getByText("Changes save as you make them."),
    ).toBeInTheDocument();
  });

  it("makes another row the one the stage reads when it is opened", () => {
    openJob([setup("setup-1"), setup("setup-2", { runCount: 3 })]);
    show();

    fireEvent.click(screen.getByText("3 runs × 1 slot"));

    expect(session().draft.log.map((entry) => entry.command)).toEqual([
      "change the view",
    ]);
  });

  it("folds the editor away when its row is pressed again", async () => {
    openJob();
    show();

    fireEvent.click(rows()[0]);
    fireEvent.click(screen.getByRole("button", { expanded: true }));

    await vi.waitFor(() =>
      expect(screen.queryByText("How much")).not.toBeInTheDocument(),
    );
  });
});

describe("what the setups list says", () => {
  it("keeps identical setups as separate rows", () => {
    openJob([setup("setup-1"), setup("setup-2")]);

    show();

    expect(screen.getAllByText("1 run × 1 slot")).toHaveLength(2);
  });

  it("opens the new setup's editor when one is added", () => {
    openJob();
    show();

    fireEvent.click(screen.getByRole("button", { name: "Add setup" }));

    expect(screen.getAllByText("1 run × 1 slot")).toHaveLength(2);
    expect(screen.getByText("How much")).toBeInTheDocument();
  });

  it("explains the run limit and where the system index comes from", () => {
    openJob();
    show();

    fireEvent.click(rows()[0]);

    expect(
      screen.getByText(
        "4,000 runs is the most this blueprint takes in one slot.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Off, the index for Jita is used/),
    ).toBeInTheDocument();
  });

  it("shows a saved structure's facility as facts rather than asking for it", () => {
    useUsersStore.getState().applicationSettings.customStructures.push(SAVED);
    openJob([setup("setup-1", { customStructureID: SAVED.id })]);
    show();

    fireEvent.click(rows()[0]);

    expect(
      screen.getByText(/A saved structure supplies the size/),
    ).toBeInTheDocument();
    expect(screen.getByText("Facility tax")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rig 1")).not.toBeInTheDocument();
  });
});

describe("deleting a setup", () => {
  it("folds the editor away rather than opening another when the open row is deleted", async () => {
    openJob([setup("setup-1"), setup("setup-2", { runCount: 3 })]);
    show();

    fireEvent.click(rows()[0]);
    fireEvent.click(
      screen.getAllByRole("button", { name: /^Delete the setup of/ })[0],
    );

    await vi.waitFor(() =>
      expect(screen.queryByText("How much")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("3 runs × 1 slot")).toBeInTheDocument();
  });
});

describe("on a phone", () => {
  it("opens the editor as a sheet titled by the setup, with Delete inside it", () => {
    window.matchMedia = (query) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });
    openJob([setup("setup-1"), setup("setup-2", { runCount: 3 })]);
    show();

    fireEvent.click(screen.getByText("3 runs × 1 slot"));

    const sheet = screen.getByRole("presentation");
    expect(sheet).toHaveTextContent("3 runs × 1 slot");
    expect(sheet).toHaveTextContent("How much");
    expect(
      screen.getByRole("button", { name: "Delete this setup" }),
    ).toBeInTheDocument();
    delete window.matchMedia;
  });
});

const SAVED = {
  id: "manStruct-saved",
  jobType: 1,
  name: "Sotiyo",
  structureType: 0,
  systemType: 0,
  rigSlot1: 0,
  rigSlot2: 0,
  tax: 0,
};

const notice = () => screen.queryByTestId("WarningAmberIcon");

describe("which structure the setups say they build in", () => {
  it("names the saved structure while it is still saved", () => {
    useUsersStore.getState().applicationSettings.customStructures.push(SAVED);
    openJob([setup("setup-1", { customStructureID: SAVED.id })]);

    show();

    expect(screen.getByText(SAVED.name)).toBeInTheDocument();
    expect(notice()).not.toBeInTheDocument();
  });

  it("shows what the job was built with, and flags it, once the structure is deleted", () => {
    openJob([setup("setup-1", { customStructureID: SAVED.id })]);

    show();

    expect(screen.queryByText(SAVED.name)).not.toBeInTheDocument();
    expect(screen.getByText("NPC Station")).toBeInTheDocument();
    expect(notice()).toBeInTheDocument();
  });

  it("flags nothing when the setup never named a structure", () => {
    openJob();

    show();

    expect(screen.getByText("NPC Station")).toBeInTheDocument();
    expect(notice()).not.toBeInTheDocument();
  });
});
