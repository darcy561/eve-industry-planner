import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import useRigSlots from "./useRigSlots";
import { structureFromDocument } from "../Functions/Custom Structures/customStructure";
import { jobTypes, rigTypeMap } from "../Context/defaultValues";

function fitted(rigSlot1 = 0, rigSlot2 = 0) {
  return structureFromDocument({
    jobType: jobTypes.manufacturing,
    rigSlot1,
    rigSlot2,
  });
}

function entry(id) {
  return rigTypeMap[jobTypes.manufacturing][id];
}

function open(structure) {
  const onChange = vi.fn();
  const { result } = renderHook(() => useRigSlots(structure, onChange));
  return { result, onChange };
}

describe("fitting two rigs to a structure", () => {
  it("takes a rig into the slot it was chosen for", () => {
    const { result, onChange } = open(fitted());

    act(() => {
      result.current.slot1.onChange(entry(2));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].rigSlot1).toBe(2);
    expect(result.current.slot1.error.isError).toBe(false);
  });

  it("refuses the same rig in both slots, and says so on the slot refused", () => {
    const { result, onChange } = open(fitted(0, 2));

    act(() => {
      result.current.slot1.onChange(entry(2));
    });

    expect(onChange.mock.calls[0][0].rigSlot1).toBe(0);
    expect(result.current.slot1.error.isError).toBe(true);
    expect(result.current.slot2.error.isError).toBe(false);
  });

  it("refuses a rig competing with the one already fitted", () => {
    const competing = entry(2).relatedTo?.[0];
    expect(competing).toBeDefined();

    const { result, onChange } = open(fitted(0, competing));

    act(() => {
      result.current.slot1.onChange(entry(2));
    });

    expect(onChange.mock.calls[0][0].rigSlot1).toBe(0);
    expect(result.current.slot1.error.isError).toBe(true);
  });

  it("clears a slot without refusing it", () => {
    const { result, onChange } = open(fitted(2, 0));

    act(() => {
      result.current.slot1.onChange(entry(0));
    });

    expect(onChange.mock.calls[0][0].rigSlot1).toBe(0);
    expect(result.current.slot1.error.isError).toBe(false);
  });

  it("leaves the structure it was given unchanged", () => {
    const structure = fitted(2, 0);
    const { result } = open(structure);

    act(() => {
      result.current.slot2.onChange(entry(4));
    });

    expect(structure.rigSlot2).toBe(0);
  });
});
