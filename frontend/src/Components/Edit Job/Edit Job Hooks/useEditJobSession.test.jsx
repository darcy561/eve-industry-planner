import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderOverEditJob, storedJob } from "../../../tests/editJobHarness";
import { stepForward } from "./jobCommands";

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

// The job the page reads is frozen. A control that changes it in place is not
// saying what the reader did, and the change would be lost at the next read — so
// it throws where it is written rather than looking like it worked.
describe("the job the page reads", () => {
  it("refuses to be changed in place", () => {
    const { editJob } = renderOverEditJob(jobWithChild(), ({ actions }) => (
      <button onClick={() => actions.run(stepForward())}>next step</button>
    ));

    fireEvent.click(screen.getByRole("button", { name: "next step" }));

    expect(() =>
      editJob.current.activeJob.removeChildJob(34, "child-1"),
    ).toThrow(TypeError);
  });

  // The first render of a job nobody has edited yet is where this is easiest to
  // get wrong: nothing has been through Immer, so the guarantee has to come from
  // the base being frozen as it is seeded rather than from a change having been
  // made.
  it("refuses to be changed in place before anything has been edited", () => {
    const { editJob } = renderOverEditJob(jobWithChild(), () => null);

    expect(() =>
      editJob.current.activeJob.removeChildJob(34, "child-1"),
    ).toThrow(TypeError);
  });

  // The document is frozen and so is the job built around it: a field set
  // straight on the job is the same mistake as changing one of its rows, and
  // answers the same way.
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
