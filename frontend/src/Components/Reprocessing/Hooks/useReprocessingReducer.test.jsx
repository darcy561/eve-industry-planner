import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../tests/queryClients.js";

const {
  store,
  characterSkills,
  writePlannerReprocessingSettings,
  scheduleSave,
} = vi.hoisted(() => ({
  store: { current: null },
  characterSkills: { current: undefined },
  writePlannerReprocessingSettings: vi.fn(),
  scheduleSave: vi.fn(),
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/cachedDataMock.js");
  const { reprocessingFile, VELDSPAR } =
    await import("../../../tests/reprocessingFixtures.js");
  return cachedDataMock({
    getReprocessingData: async () => reprocessingFile([VELDSPAR], {}),
  });
});

vi.mock("../../../Hooks/EveEsi/Character/useGetCharacterSkills", () => ({
  useGetCharacterSkills: () => ({ data: characterSkills.current }),
}));

vi.mock(
  "../../../Functions/Debounce/plannerSettingsPersistSchedule.js",
  () => ({
    scheduleDebouncedPlannerSettingsSave: (owner) => scheduleSave(owner),
  }),
);

const { primeReprocessing, resetReprocessing } =
  await import("../../../Functions/Static/reprocessing.js");
const { structureFromDocument } =
  await import("../../../Functions/Custom Structures/customStructure");
const { jobTypes, defaultPlannerReprocessingSettings, compressedOreChoices } =
  await import("../../../Context/defaultValues");
const { default: useReprocessingReducer } =
  await import("./useReprocessingReducer.js");

function savedStructure() {
  return structureFromDocument({
    id: "reprocessingStruct-saved",
    jobType: jobTypes.reprocessing,
    name: "Athanor",
    structureType: 35835,
    systemType: 0,
    rigSlot1: 0,
    rigSlot2: 0,
    implant: 0,
    tax: 2.5,
    default: true,
  });
}

const OWNER = "account:acc-1";

function open(saved, byOwner = {}) {
  store.current = {
    account: { isLoggedIn: true },
    applicationSettings: {
      customStructures: saved ? [saved] : [],
      actions: { getDefaultReprocessingCharacter: () => null },
    },
    plannerSettings: {
      byOwner,
      actions: {
        loadPlannerSettings: vi.fn(async () => null),
        writePlannerReprocessingSettings,
      },
    },
  };
  const client = testQueryClient();
  return renderHook(() => useReprocessingReducer(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  characterSkills.current = undefined;
  await primeReprocessing();
});

function plannerReprocessing() {
  return {
    ...defaultPlannerReprocessingSettings(),
    compressedOre: compressedOreChoices.avoid,
    countLeftoversAsSold: true,
    neverChoose: [1230],
  };
}

describe("the structure the reprocessing page opens with", () => {
  it("is a copy of the reader's saved default, not the saved row itself", () => {
    const saved = savedStructure();
    const { result } = open(saved);

    expect(result.current.state.currentStructure).not.toBe(saved);
    expect(result.current.state.currentStructure.id).toBe(saved.id);
    expect(result.current.state.currentStructure.structureType).toBe(
      saved.structureType,
    );
    expect(result.current.state.currentStructure.tax).toBe(saved.tax);
  });

  it("leaves the saved structure alone when the page's copy is changed", () => {
    const saved = savedStructure();
    const { result } = open(saved);

    result.current.state.currentStructure.structureType = 35836;
    result.current.state.currentStructure.rigSlot1 = 37156;
    result.current.state.currentStructure.implant = 27174;

    expect(saved.structureType).toBe(35835);
    expect(saved.rigSlot1).toBe(0);
    expect(saved.implant).toBe(0);
    expect(store.current.applicationSettings.customStructures[0]).toBe(saved);
  });

  it("is a blank reprocessing structure when the reader has saved none", () => {
    const { result } = open(null);

    expect(result.current.state.currentStructure.jobType).toBe(
      jobTypes.reprocessing,
    );
    expect(result.current.state.currentStructure.name).toBe("");
  });
});

describe("the reprocessing settings the page uses", () => {
  it("are the active planner's once its settings are held", () => {
    const { result } = open(null, {
      [OWNER]: { reprocessingSettings: plannerReprocessing() },
    });

    expect(result.current.settings).toEqual(plannerReprocessing());
    expect(result.current.isPlannerHeld).toBe(true);
  });

  it("are written to the planner and saved when a planner is held", () => {
    const { result } = open(null, {
      [OWNER]: { reprocessingSettings: plannerReprocessing() },
    });

    act(() => result.current.actions.allowAgain(1230));

    expect(writePlannerReprocessingSettings).toHaveBeenCalledWith(OWNER, {
      ...plannerReprocessing(),
      neverChoose: [],
    });
    expect(scheduleSave).toHaveBeenCalledWith(OWNER);
  });

  it("are the page's own with no planner, and change there", () => {
    const { result } = open(null);

    act(() => result.current.actions.neverChoose("1230"));
    act(() =>
      result.current.actions.changeSettings({
        compressedOre: compressedOreChoices.avoid,
      }),
    );

    expect(result.current.isPlannerHeld).toBe(false);
    expect(result.current.settings).toMatchObject({
      compressedOre: compressedOreChoices.avoid,
      neverChoose: [1230],
    });
    expect(writePlannerReprocessingSettings).not.toHaveBeenCalled();
  });
});

describe("the skills the page reprocesses with", () => {
  it("are the character's trained levels with the reader's changes over them", () => {
    characterSkills.current = {
      3385: { activeLevel: 5 },
      60377: { activeLevel: 3 },
    };
    const { result } = open(null);

    act(() => result.current.actions.setSkillLevel(60377, 5));

    expect(result.current.skills).toMatchObject({
      3385: 5,
      60377: 5,
    });
  });

  it("are read whether or not the reprocessing file has arrived", () => {
    resetReprocessing();
    characterSkills.current = {
      3385: { activeLevel: 5 },
      60377: { activeLevel: 4 },
      18025: { activeLevel: 3 },
    };
    const { result } = open(null);

    expect(result.current.trainedSkills).toMatchObject({
      3385: 5,
      60377: 4,
      18025: 3,
    });
  });

  it("drop the reader's changes when another character is chosen", () => {
    characterSkills.current = { 60377: { activeLevel: 3 } };
    const { result } = open(null);

    act(() => result.current.actions.setSkillLevel(60377, 5));
    act(() => result.current.actions.setSelectedUser("other-hash"));

    expect(result.current.skills[60377]).toBe(3);
  });
});
