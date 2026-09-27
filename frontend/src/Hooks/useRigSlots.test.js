import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import useRigSlots from "./useRigSlots";
import { jobTypes, rigTypeMap } from "../Context/defaultValues";

function fitted(rigSlot1 = 0, rigSlot2 = 0) {
  return { rigSlot1, rigSlot2 };
}

function entry(id) {
  return rigTypeMap[jobTypes.manufacturing][id];
}

function open(slots) {
  const onChoose = vi.fn();
  const { result } = renderHook(() => useRigSlots(slots, onChoose));
  return { result, onChoose };
}

describe("fitting two rigs to a structure", () => {
  it("takes a rig into the slot it was chosen for", () => {
    const { result, onChoose } = open(fitted());

    act(() => {
      result.current.slot1.onChange(entry(2));
    });

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0]).toEqual(["rigSlot1", 2, expect.anything()]);
    expect(result.current.slot1.error.isError).toBe(false);
  });

  it("refuses the same rig in both slots, and says so on the slot refused", () => {
    const { result, onChoose } = open(fitted(0, 2));

    act(() => {
      result.current.slot1.onChange(entry(2));
    });

    expect(onChoose.mock.calls[0]).toEqual(["rigSlot1", 0, expect.anything()]);
    expect(result.current.slot1.error.isError).toBe(true);
    expect(result.current.slot2.error.isError).toBe(false);
  });

  it("refuses a rig competing with the one already fitted", () => {
    const competing = entry(2).relatedTo?.[0];
    expect(competing).toBeDefined();

    const { result, onChoose } = open(fitted(0, competing));

    act(() => {
      result.current.slot1.onChange(entry(2));
    });

    expect(onChoose.mock.calls[0]).toEqual(["rigSlot1", 0, expect.anything()]);
    expect(result.current.slot1.error.isError).toBe(true);
  });

  it("clears a slot without refusing it", () => {
    const { result, onChoose } = open(fitted(2, 0));

    act(() => {
      result.current.slot1.onChange(entry(0));
    });

    expect(onChoose.mock.calls[0]).toEqual(["rigSlot1", 0, expect.anything()]);
    expect(result.current.slot1.error.isError).toBe(false);
  });

  it("names the slot it was asked about, not the one already fitted", () => {
    const { result, onChoose } = open(fitted(2, 0));

    act(() => {
      result.current.slot2.onChange(entry(4));
    });

    expect(onChoose.mock.calls[0]).toEqual(["rigSlot2", 4, expect.anything()]);
  });
});
