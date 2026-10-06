import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import { coreActions, stateDefault } from "./core.js";
import { preferencesActions } from "./preferences.js";

let store;
const act = () => store.getState().applicationSettings.actions;
const exempt = () => [...store.getState().applicationSettings.exemptTypeIDs];

beforeEach(() => {
  store = create((set, get) => ({
    applicationSettings: {
      ...stateDefault(),
      actions: { ...coreActions(set, get), ...preferencesActions(set, get) },
    },
  }));
});

describe("the blueprints a reader exempts", () => {
  it("adds one type, or several at once, without repeating any", () => {
    act().addExemptTypeID(34);
    act().addExemptTypeID([35, 34]);

    expect(exempt()).toEqual([34, 35]);
    expect(act().checkTypeIDisExempt(35)).toBe(true);
    expect(act().checkTypeIDisExempt(36)).toBe(false);
  });

  it("removes one type, or several at once, and leaves the rest", () => {
    act().addExemptTypeID([34, 35, 36]);

    act().removeExemptTypeID(35);
    act().removeExemptTypeID(new Set([36]));

    expect(exempt()).toEqual([34]);
  });

  it("ignores an add or remove naming nothing", () => {
    act().addExemptTypeID(34);

    act().addExemptTypeID(null);
    act().removeExemptTypeID(undefined);

    expect(exempt()).toEqual([34]);
  });

  it("are saved as a list on the account's settings document", () => {
    act().addExemptTypeID([34, 35]);

    expect(act().toPersistPayload().exemptTypeIDs).toEqual([34, 35]);
  });
});
