import { beforeEach, describe, expect, it } from "vitest";

const { default: useUsersStore } = await import("../usersStore.js");

function actions() {
  return useUsersStore.getState().jobData.actions;
}

function selected() {
  return useUsersStore.getState().jobData.multiSelect;
}

describe("multi-selection", () => {
  beforeEach(() => {
    actions().resetJobDataStore();
  });

  it.each([
    ["one id", "job-1", ["job-1"]],
    ["an array", ["job-1", "job-2"], ["job-1", "job-2"]],
    ["a set", new Set(["job-1", "job-2"]), ["job-1", "job-2"]],
  ])("takes %s", (_label, input, expected) => {
    actions().addToMultiSelect(input);
    expect(selected()).toEqual(expected);
  });

  it("does not select the same job twice", () => {
    actions().addToMultiSelect(["job-1", "job-2"]);
    actions().addToMultiSelect(["job-2", "job-3"]);
    expect(selected()).toEqual(["job-1", "job-2", "job-3"]);
  });

  it("deselects named jobs and leaves the rest", () => {
    actions().addToMultiSelect(["job-1", "job-2", "job-3"]);
    actions().removeFromMultiSelect(["job-1", "job-3"]);
    expect(selected()).toEqual(["job-2"]);
  });

  it("clears the whole selection", () => {
    actions().addToMultiSelect(["job-1", "job-2"]);
    actions().clearMultiSelect();
    expect(selected()).toEqual([]);
  });

  it.each([[null], [undefined], [""]])("ignores %p", (input) => {
    actions().addToMultiSelect(["job-1"]);
    actions().addToMultiSelect(input);
    actions().removeFromMultiSelect(input);
    expect(selected()).toEqual(["job-1"]);
  });
});
