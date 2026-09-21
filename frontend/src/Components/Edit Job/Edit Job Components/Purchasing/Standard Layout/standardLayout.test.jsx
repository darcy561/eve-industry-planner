import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";

import {
  renderOverEditJob,
  storedJob,
} from "../../../../../tests/editJobHarness";

// Built once rather than rebuilt per read: the panel memoises its list on the
// parts it is made of, and a store that handed out a new `jobData` every read
// would recompute that memo on every render and hide a missing dependency.
vi.mock("../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});
vi.mock("../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => false,
  useSiblingLinkLock: () => ({ readOnly: false, reason: "" }),
}));

const { Purchasing_StandardLayout_EditJob } = await import("./standardLayout");
const { default: useUsersStore } =
  await import("../../../../../Zustand/usersStore");

/**
 * A material row as the job stores one: what was bought against it, and nothing
 * about how many are needed — that belongs to the setups, which is why the job
 * below carries one calling for each material.
 */
const material = (typeID, name, overrides = {}) => ({
  typeID,
  name,
  purchasing: {},
  jobType: 0,
  ...overrides,
});

const jobWith = (materials) =>
  storedJob({
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: Object.fromEntries(
            materials.map((row) => [
              String(row.typeID),
              { typeID: row.typeID, quantity: 100 },
            ]),
          ),
        },
      },
      childJobs: {},
      materials: Object.fromEntries(
        materials.map((row) => [String(row.typeID), row]),
      ),
    },
  });

/** The account's choice about whether bought-in-full rows stay on the stage. */
const hidingCompleteRows = (hideCompleteMaterials) =>
  useUsersStore.setState((store) => ({
    applicationSettings: {
      ...store.applicationSettings,
      hideCompleteMaterials,
    },
  }));

beforeEach(() => {
  hidingCompleteRows(false);
});

// The job keys its materials by type id. A panel reading them as an array threw
// where a reader opened the stage, which is why this mounts the layout over a
// real job rather than testing the sort in isolation.
describe("the purchasing stage's material list", () => {
  it("draws a card for every material the job needs", () => {
    renderOverEditJob(
      jobWith([material(34, "Tritanium"), material(35, "Pyerite")]),
      () => <Purchasing_StandardLayout_EditJob />,
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
      () => <Purchasing_StandardLayout_EditJob />,
    );

    const shown = ["Mexallon", "Pyerite", "Tritanium"].map((name) =>
      screen.getByText(name),
    );
    const order = shown.map((node) => shown[0].compareDocumentPosition(node));
    expect(order[0]).toBe(0);
    expect(order[1] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[2] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // What the list shows and how it is ordered are both answers about how many
  // of each material the job takes, which its setups state. A list that did not
  // follow them would keep showing a material as bought in full after the run
  // count that emptied it moved.
  it("follows the setups being resized", async () => {
    hidingCompleteRows(true);
    renderOverEditJob(
      jobWith([
        material(34, "Tritanium", {
          purchasing: { a: { id: "a", itemCount: 100, itemCost: 5 } },
        }),
      ]),
      () => <Purchasing_StandardLayout_EditJob />,
    );

    // Bought in full at 100, so the stage hides it.
    expect(screen.queryByText("Tritanium")).toBeNull();

    await act(async () => {
      useUsersStore.getState().editSession.actions.run({
        name: "double the runs",
        recipe: (job) => {
          job.build.setup["setup-1"].materialCount[34].quantity = 200;
        },
      });
    });

    expect(screen.getByText("Tritanium")).toBeInTheDocument();
  });
});
