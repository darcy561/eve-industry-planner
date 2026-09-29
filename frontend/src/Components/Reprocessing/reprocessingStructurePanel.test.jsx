import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";

import { testQueryClient } from "../../tests/queryClients.js";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../Hooks/EveEsi/Character/useGetCharacterSkills", () => ({
  useGetCharacterSkills: () => ({ isLoading: false, isError: false }),
  getCachedCharacterSkills: () => ({ data: null }),
}));

const { default: ReprocessingStructurePanel } =
  await import("./reprocessingStructurePanel.jsx");
const { structureFromDocument } =
  await import("../../Functions/Custom Structures/customStructure");
const { jobTypes, rigTypeMap, structureTypeMap } =
  await import("../../Context/defaultValues");

const rigs = rigTypeMap[jobTypes.reprocessing];
const structures = structureTypeMap[jobTypes.reprocessing];

const SAVED = structureFromDocument({
  id: "reprocessingStruct-saved",
  jobType: jobTypes.reprocessing,
  name: "Athanor",
  structureType: Number(Object.keys(structures)[1]),
  rigSlot1: 1,
  implant: 0,
  tax: 1.5,
  default: true,
});

function show({ current, saved = [], signedIn = false } = {}) {
  store.current = {
    account: { isLoggedIn: signedIn },
    applicationSettings: { customStructures: saved },
  };
  const setCurrentStructure = vi.fn();

  render(
    <QueryClientProvider client={testQueryClient()}>
      <ThemeProvider theme={createTheme()}>
        <ReprocessingStructurePanel
          pageState={{
            currentStructure:
              current ??
              structureFromDocument(undefined, jobTypes.reprocessing),
            selectedUser: null,
            activeSkills: {},
            skillsManuallyModified: true,
          }}
          pageActions={{
            setCurrentStructure,
            loadCharacterSkills: vi.fn(),
            setSingleSkill: vi.fn(),
            setSelectedUser: vi.fn(),
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );

  return { setCurrentStructure };
}

const rigPickers = () =>
  screen
    .getAllByRole("combobox")
    .filter((box) => box.id?.startsWith("rig-type-select"));

async function pick(picker, optionName) {
  await userEvent.click(picker);
  await userEvent.click(screen.getByRole("option", { name: optionName }));
}

describe("fitting the refinery a reprocessing job is run in", () => {
  it("offers a picker for each of the two rig slots", () => {
    show();

    expect(rigPickers()).toHaveLength(2);
  });

  it("gives each slot its own field, showing what it holds", () => {
    show({
      current: structureFromDocument({
        jobType: jobTypes.reprocessing,
        rigSlot1: 1,
      }),
    });

    const [first, second] = rigPickers();

    expect(first).toHaveValue(rigs[1].label);
    expect(second).toHaveValue("None");
  });

  it("changes the structure type on the copy the page holds", async () => {
    const current = structureFromDocument({
      jobType: jobTypes.reprocessing,
    });
    const { setCurrentStructure } = show({ current });
    const chosen = Number(Object.keys(structures)[1]);

    await pick(screen.getAllByRole("combobox")[0], structures[chosen].label);

    expect(setCurrentStructure.mock.calls[0][0].structureType).toBe(chosen);
    expect(current.structureType).toBe(0);
  });
});

const savedPicker = () =>
  screen
    .queryAllByRole("combobox")
    .find((box) => box.id === "custom-structure-select");

describe("choosing a saved refinery to reprocess in", () => {
  it("is offered only when the reader is signed in", () => {
    show({ saved: [SAVED] });

    expect(savedPicker()).toBeUndefined();
  });

  it("hands the page a copy of the saved structure, not the saved row", async () => {
    const { setCurrentStructure } = show({ saved: [SAVED], signedIn: true });

    await pick(savedPicker(), SAVED.name);

    const handed = setCurrentStructure.mock.calls[0][0];
    expect(handed.id).toBe(SAVED.id);
    expect(handed.structureType).toBe(SAVED.structureType);
    expect(handed).not.toBe(SAVED);
  });

  it("leaves the saved row alone when the page's copy is then edited", async () => {
    const { setCurrentStructure } = show({ saved: [SAVED], signedIn: true });

    await pick(savedPicker(), SAVED.name);
    const handed = setCurrentStructure.mock.calls[0][0];
    handed.rigSlot1 = 0;

    expect(SAVED.rigSlot1).toBe(1);
  });
});
