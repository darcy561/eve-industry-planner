import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  setupFixture,
  TRITANIUM,
} from "../../../../../../tests/editJobFixtures.js";
import seedPrices from "../../../../../../tests/seedPrices.js";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    account: {
      actions: {
        getMainCharacterHash: () => "me",
        findCharacterByHash: (hash) => ({ CharacterHash: hash, isOmega: true }),
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
  useSolarSystemName: () => "Jita",
}));

const { JobSetupCard } = await import("./jobSetupCard.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const theme = createTheme({ palette: { manufacturing: { main: "#123456" } } });
const session = () => useUsersStore.getState().editSession;

const storedSetup = () => ({
  ...setupFixture("setup-1"),
  materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity: 1000 } },
});

const openJob = (setupToEdit = null) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    build: { setup: { "setup-1": storedSetup() } },
    layout: { setupToEdit },
  });

const show = (setupEntry = storedSetup()) =>
  render(
    <ThemeProvider theme={theme}>
      <JobSetupCard setupEntry={setupEntry} />
    </ThemeProvider>,
  );

beforeEach(() => {
  session().actions.closeSession();
  openJob();
});

describe("a card for one of the job's setups", () => {
  it("prices installing the setup from what it consumes", () => {
    seedPrices({}, { adjusted: { [TRITANIUM]: 500 } });

    show();

    expect(screen.getByText(/Est Total Install Costs:/).textContent).toBe(
      "Est Total Install Costs: 46,250.00",
    );
  });

  it("asks for the setup to be the one being edited when it is pressed", () => {
    show();

    fireEvent.click(screen.getByRole("button"));

    expect(session().draft.log.map((entry) => entry.command)).toEqual([
      "change the view",
    ]);
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

function savedStructures(rows) {
  const { customStructures } = useUsersStore.getState().applicationSettings;
  customStructures.length = 0;
  customStructures.push(...rows);
}

function notice() {
  return screen.queryByTestId("WarningAmberIcon");
}

describe("which structure a setup card says it was built in", () => {
  it("names the saved structure while it is still saved", () => {
    savedStructures([SAVED]);

    show({ ...storedSetup(), customStructureID: SAVED.id });

    expect(screen.getByText(SAVED.name)).toBeInTheDocument();
    expect(notice()).not.toBeInTheDocument();
  });

  it("shows what the job was built with, and flags it, once the structure is deleted", () => {
    savedStructures([]);

    show({ ...storedSetup(), customStructureID: SAVED.id });

    expect(screen.queryByText(SAVED.name)).not.toBeInTheDocument();
    expect(screen.getByText("NPC Station")).toBeInTheDocument();
    expect(notice()).toBeInTheDocument();
  });

  it("flags nothing when the setup never named a structure", () => {
    savedStructures([]);

    show({ ...storedSetup(), customStructureID: "" });

    expect(screen.getByText("NPC Station")).toBeInTheDocument();
    expect(notice()).not.toBeInTheDocument();
  });
});
