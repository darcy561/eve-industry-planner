import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import {
  renderOverEditJob,
  storedJob,
} from "../../../../../tests/editJobHarness";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});
vi.mock("../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => false,
  useSiblingLinkLock: () => ({ readOnly: false, reason: "" }),
}));

const { Purchasing_StandardLayout_EditJob } = await import("./standardLayout");

const material = (typeID, name, overrides = {}) => ({
  typeID,
  name,
  quantity: 100,
  quantityPurchased: 0,
  purchasing: {},
  jobType: 0,
  ...overrides,
});

const jobWith = (materials) =>
  storedJob({
    build: {
      setup: {},
      childJobs: {},
      materials: Object.fromEntries(
        materials.map((row) => [String(row.typeID), row]),
      ),
    },
  });

beforeEach(() => {
  store.current = { applicationSettings: { hideCompleteMaterials: false } };
});

// The job keys its materials by type id. A panel reading them as an array threw
// where a reader opened the stage, which is why this mounts the layout over a
// real job rather than testing the sort in isolation.
describe("the purchasing stage's material list", () => {
  it("draws a card for every material the job needs", () => {
    renderOverEditJob(
      jobWith([material(34, "Tritanium"), material(35, "Pyerite")]),
      ({ state, actions }) => (
        <Purchasing_StandardLayout_EditJob state={state} actions={actions} />
      ),
    );

    expect(screen.getByText("Tritanium")).toBeInTheDocument();
    expect(screen.getByText("Pyerite")).toBeInTheDocument();
  });

  // Keyed by type id, which says nothing about the order to read them in, so
  // the stage puts them in name order.
  it("reads them in name order rather than key order", () => {
    renderOverEditJob(
      jobWith([
        material(34, "Tritanium"),
        material(35, "Pyerite"),
        material(36, "Mexallon"),
      ]),
      ({ state, actions }) => (
        <Purchasing_StandardLayout_EditJob state={state} actions={actions} />
      ),
    );

    const shown = ["Mexallon", "Pyerite", "Tritanium"].map((name) =>
      screen.getByText(name),
    );
    const order = shown.map((node) => shown[0].compareDocumentPosition(node));
    expect(order[0]).toBe(0);
    expect(order[1] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[2] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
