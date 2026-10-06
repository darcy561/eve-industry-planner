import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../tests/queryClients.js";
import { seedItemRecords } from "../../tests/seedItems.js";
import {
  CLEAR_ICICLE,
  VELDSPAR,
  reprocessingFile,
} from "../../tests/reprocessingFixtures.js";

const { store, SKILL_RECORDS } = vi.hoisted(() => ({
  store: { current: null },
  SKILL_RECORDS: {
    3385: { type_id: 3385, name: "Reprocessing" },
    3389: { type_id: 3389, name: "Reprocessing Efficiency" },
    60377: { type_id: 60377, name: "Simple Ore Processing" },
    18025: { type_id: 18025, name: "Ice Processing" },
  },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: async () =>
      reprocessingFile([VELDSPAR, CLEAR_ICICLE], {}),
    getFullItemList: async () => SKILL_RECORDS,
  });
});

const { primeReprocessing } =
  await import("../../Functions/Static/reprocessing.js");
const { reprocessingSetupFrom } =
  await import("../../Functions/Reprocessing/engine/reprocessingSetup");
const { structureFromDocument } =
  await import("../../Functions/Custom Structures/customStructure");
const { jobTypes, structureTypeMap } =
  await import("../../Context/defaultValues");
const { reprocessingDirections } = await import("./Hooks/reprocessingReducer");
const { default: ReprocessingSetupPanel } =
  await import("./reprocessingSetupPanel.jsx");

const structures = structureTypeMap[jobTypes.reprocessing];
const SKILLS = { 3385: 5, 3389: 4, 60377: 3, 18025: 2 };

function show({
  direction = reprocessingDirections.toMinerals,
  structure = structureFromDocument(undefined, jobTypes.reprocessing),
  signedIn = false,
  pasted = [VELDSPAR],
  skillsStatus = { isLoading: false, isError: false },
} = {}) {
  store.current = {
    account: { isLoggedIn: signedIn, characters: [] },
    applicationSettings: { customStructures: [] },
  };
  const queryClient = testQueryClient();
  seedItemRecords(queryClient, SKILL_RECORDS);
  const pageActions = {
    setCurrentStructure: vi.fn(),
    setSkillLevel: vi.fn(),
    setSelectedUser: vi.fn(),
  };
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={createTheme()}>
        <ReprocessingSetupPanel
          pageState={{
            direction,
            currentStructure: structure,
            selectedUser: null,
            skillOverrides: {},
            pastes: {
              [direction]: {
                committed: pasted.map((entry) => entry.name).join("\n"),
              },
            },
          }}
          pageActions={pageActions}
          skills={SKILLS}
          trainedSkills={SKILLS}
          skillsStatus={skillsStatus}
          answers={{
            itemTypeIDs: pasted.map((entry) => entry.id),
            setup: reprocessingSetupFrom(structure, SKILLS),
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { pageActions, structure };
}

async function pick(picker, optionName) {
  await userEvent.click(picker);
  await userEvent.click(screen.getByRole("option", { name: optionName }));
}

beforeEach(async () => {
  await primeReprocessing();
});

describe("the reprocessing setup", () => {
  it("offers a field for each rig slot, each showing what it holds", () => {
    show({
      structure: structureFromDocument({
        jobType: jobTypes.reprocessing,
        rigSlot1: 1,
      }),
    });

    const [first, second] = screen
      .getAllByRole("combobox")
      .filter((box) => box.id?.startsWith("rig-type-select"));
    expect(first).toHaveValue("T1 - Ore");
    expect(second).toHaveValue("None");
  });

  it("changes the structure type on a new copy, leaving the one it was handed alone", async () => {
    const { pageActions, structure } = show();

    await pick(screen.getAllByRole("combobox")[0], structures[1].label);

    const changed = pageActions.setCurrentStructure.mock.calls[0][0];
    expect(changed.structureType).toBe(1);
    expect(changed).not.toBe(structure);
    expect(structure.structureType).toBe(0);
  });

  it("offers the saved structures only to a reader who is signed in", () => {
    show();
    expect(screen.queryByText("Saved structure")).toBeNull();
  });

  it("sets the tax the structure charges once the field is left", async () => {
    const { pageActions } = show({
      structure: structureFromDocument({
        jobType: jobTypes.reprocessing,
        structureType: 1,
      }),
    });
    const tax = screen.getByRole("spinbutton", { name: "Tax %" });

    await userEvent.clear(tax);
    await userEvent.type(tax, "2.5");
    await userEvent.tab();

    expect(pageActions.setCurrentStructure.mock.calls.at(-1)[0].tax).toBe(2.5);
  });

  it("gives a yield row for each processing skill the input uses, named for its kind", () => {
    show({ pasted: [VELDSPAR, CLEAR_ICICLE] });

    expect(screen.getByText("Ore")).toBeInTheDocument();
    expect(screen.getByText("Simple Ore Processing at 3")).toBeInTheDocument();
    expect(screen.getByText("Ice")).toBeInTheDocument();
    expect(screen.getByText("Ice Processing at 2")).toBeInTheDocument();
  });

  it("states the yield of each kind the file holds, and the tax, before anything is read", () => {
    show({ pasted: [] });

    expect(screen.getByText("Ore")).toBeInTheDocument();
    expect(screen.getByText("Ice")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
  });

  it("lays out the structure's fields compactly, with no field descriptions", () => {
    show();

    expect(screen.getByText("Structure")).toBeInTheDocument();
    expect(screen.getByText("System security")).toBeInTheDocument();
    expect(screen.getByText("Reprocessing tax")).toBeInTheDocument();
    expect(
      screen.queryByText(/determines the bonuses and available rigs/),
    ).toBeNull();
  });

  it("shows the skills the input uses without being asked, once something is read", () => {
    show();

    expect(
      screen.getByRole("button", { name: /^Hide Skills these items use/ }),
    ).toBeInTheDocument();
  });

  it("keeps the skills folded before anything is read", () => {
    show({ pasted: [] });

    expect(
      screen.getByRole("button", { name: /^Show Skills/ }),
    ).toBeInTheDocument();
  });

  it("says when the character's skills could not be read", async () => {
    show({ skillsStatus: { isLoading: false, isError: true } });

    expect(screen.getByText(/Could not read/)).toBeInTheDocument();
  });

  it("opens on a summary in From minerals, with its controls folded away", () => {
    show({ direction: reprocessingDirections.fromMinerals });

    expect(screen.getByText("tax 0.0%")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Tax %" })).toBeNull();
  });

  it("tries a skill level over the trained one from its pips", async () => {
    const { pageActions } = show();

    await userEvent.click(
      screen.getByRole("button", { name: "Simple Ore Processing at level 5" }),
    );

    expect(pageActions.setSkillLevel).toHaveBeenCalledWith(60377, 5);
  });

  it("applies what an NPC station fixes when the reader moves the setup into one", async () => {
    const { pageActions } = show({
      structure: structureFromDocument({
        jobType: jobTypes.reprocessing,
        structureType: 1,
        rigSlot1: 1,
        tax: 3,
      }),
    });

    await pick(screen.getAllByRole("combobox")[0], structures[0].label);

    expect(pageActions.setCurrentStructure.mock.calls.at(-1)[0]).toMatchObject({
      structureType: 0,
      rigSlot1: 0,
      tax: 0.25,
    });
  });
});
