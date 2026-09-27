import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

const { structureFromDocument } =
  await import("../../../Functions/Custom Structures/customStructure");
const { jobTypes } = await import("../../../Context/defaultValues");
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

function open(saved) {
  store.current = {
    applicationSettings: {
      customStructures: saved ? [saved] : [],
      actions: { getDefaultReprocessingCharacter: () => null },
    },
  };
  return renderHook(() => useReprocessingReducer());
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
