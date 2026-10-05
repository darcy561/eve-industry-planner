import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderOverEditJob, storedJob } from "../../tests/editJobHarness";
import { stepForward } from "./Edit Job Hooks/jobCommands";

const { store, closed, navigated, yielded } = vi.hoisted(() => ({
  store: { current: null },
  closed: [],
  navigated: [],
  yielded: [],
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => (to) => navigated.push(to),
  useParams: () => ({ jobID: "job-1" }),
  useSearch: () => ({}),
}));
vi.mock("../../Functions/Job/editing/closeActiveJob", () => ({
  closeActiveJob: async (...args) => {
    closed.push(args);
  },
}));
vi.mock(
  "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js",
  () => ({
    yieldEditJobDocumentLocksOnLeave: async (args) => {
      yielded.push(args);
    },
  }),
);
vi.mock("./Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobPersistGate: () => ({ canPersist: true, readOnly: false }),
}));

const { SaveJobIcon } = await import("./saveIcon");

beforeEach(() => {
  store.current = {};
  closed.length = 0;
  navigated.length = 0;
  yielded.length = 0;
});

/** What a save was handed, named the way `closeActiveJob` takes it. */
function saved() {
  const [
    job,
    jobModified,
    temporaryChildJobs,
    esiDataToLink,
    parentChildToEdit,
  ] = closed[0] ?? [];
  return {
    job,
    jobModified,
    temporaryChildJobs,
    esiDataToLink,
    parentChildToEdit,
  };
}

// Saving is the other half of a session's life: what the save is handed has to
// be the job the reader has been changing, not the one the editor opened.
describe("saving an edited job", () => {
  it("hands over the job as the reader left it", () => {
    renderOverEditJob(storedJob({ jobStatus: 1 }), ({ state, actions }) => (
      <>
        <button onClick={() => actions.run(stepForward())}>next step</button>
        <SaveJobIcon state={state} />
      </>
    ));

    fireEvent.click(screen.getByRole("button", { name: "next step" }));
    fireEvent.click(screen.getByRole("button", { name: /save and return/i }));

    expect(saved().job.jobStatus).toBe(2);
    expect(saved().jobModified).toBe(true);
  });

  // Nothing changed means nothing to write, and `closeActiveJob` leaves on that
  // flag rather than comparing documents.
  it("says there is nothing to save when the reader changed nothing", () => {
    renderOverEditJob(storedJob({ jobStatus: 1 }), ({ state }) => (
      <SaveJobIcon state={state} />
    ));

    fireEvent.click(screen.getByRole("button", { name: /save and return/i }));

    expect(saved().jobModified).toBe(false);
  });

  it("carries the links the reader asked for", () => {
    renderOverEditJob(storedJob(), ({ state, actions }) => (
      <>
        <button onClick={() => actions.markParentJobForAddition("parent-9")}>
          link a parent
        </button>
        <SaveJobIcon state={state} />
      </>
    ));

    fireEvent.click(screen.getByRole("button", { name: "link a parent" }));
    fireEvent.click(screen.getByRole("button", { name: /save and return/i }));

    expect(saved().parentChildToEdit.parentJobs.add).toEqual(["parent-9"]);
  });

  it("gives up the locks it held on the way out", async () => {
    renderOverEditJob(storedJob(), ({ state }) => (
      <SaveJobIcon state={state} />
    ));

    fireEvent.click(screen.getByRole("button", { name: /save and return/i }));

    await vi.waitFor(() =>
      expect(yielded).toContainEqual({ jobID: "job-1", groupID: undefined }),
    );
    expect(navigated).toContainEqual({ to: "/jobplanner" });
  });
});
