import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderOverEditJob, storedJob } from "../../../tests/editJobHarness";
import { applyCommands, removeChildJob, stepForward } from "./jobCommands";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

beforeEach(() => {
  store.current = {};
});

const jobWithChild = () =>
  storedJob({
    jobStatus: 1,
    build: {
      setup: {},
      materials: { 34: { typeID: 34, name: "Tritanium" } },
      childJobs: { 34: ["child-1"] },
    },
  });

describe("the job the page reads", () => {
  it("refuses to be changed in place", () => {
    const { editJob } = renderOverEditJob(jobWithChild(), ({ actions }) => (
      <button onClick={() => actions.run(stepForward())}>next step</button>
    ));

    fireEvent.click(screen.getByRole("button", { name: "next step" }));

    expect(() =>
      applyCommands(editJob.current.activeJob, removeChildJob(34, "child-1")),
    ).toThrow(TypeError);
  });

  it("refuses to be changed in place before anything has been edited", () => {
    const { editJob } = renderOverEditJob(jobWithChild(), () => null);

    expect(() =>
      applyCommands(editJob.current.activeJob, removeChildJob(34, "child-1")),
    ).toThrow(TypeError);
  });

  it("refuses a field set straight on it", () => {
    const { editJob } = renderOverEditJob(jobWithChild(), () => null);

    expect(() => {
      editJob.current.activeJob.displayOnPlanner = true;
    }).toThrow(TypeError);
  });

  it("is rebuilt from the session when a command records a change", () => {
    const { editJob } = renderOverEditJob(jobWithChild(), ({ actions }) => (
      <button onClick={() => actions.run(stepForward())}>next step</button>
    ));
    const opened = editJob.current.activeJob;

    fireEvent.click(screen.getByRole("button", { name: "next step" }));

    expect(editJob.current.activeJob).not.toBe(opened);
    expect(editJob.current.activeJob.jobStatus).toBe(opened.jobStatus + 1);
  });
});
