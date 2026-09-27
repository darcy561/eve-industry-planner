import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderOverEditJob, storedJob } from "../../tests/editJobHarness";
import {
  applyCommands,
  removeChildJob,
  stepForward,
} from "./Edit Job Hooks/jobCommands";

const { store, restored, navigated, yielded, held } = vi.hoisted(() => ({
  store: { current: null },
  restored: [],
  navigated: [],
  yielded: [],
  held: { current: true },
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
vi.mock(
  "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js",
  () => ({
    yieldEditJobDocumentLocksOnLeave: async (args) => {
      yielded.push(args);
    },
  }),
);

const { CloseJobIcon } = await import("./closeIcon");
const { default: useUsersStore } = await import("../../Zustand/usersStore");

beforeEach(() => {
  restored.length = 0;
  navigated.length = 0;
  yielded.length = 0;
  held.current = true;
  store.current = {
    jobData: {
      actions: {
        findJobInJobArray: () => (held.current ? { jobID: "job-1" } : null),
        updateOrAddJobsToJobArray: (job) => restored.push(job),
      },
    },
  };
});

const close = () =>
  fireEvent.click(screen.getByRole("button", { name: /returns to the job/i }));

describe("closing a job without saving", () => {
  it("puts back the document the session holds, not the reader's changes", async () => {
    renderOverEditJob(storedJob({ jobStatus: 1 }), ({ state, actions }) => (
      <>
        <button onClick={() => actions.run(stepForward())}>next step</button>
        <CloseJobIcon />
        <span data-testid="stage">{state.activeJob.jobStatus}</span>
      </>
    ));

    fireEvent.click(screen.getByRole("button", { name: "next step" }));
    expect(screen.getByTestId("stage").textContent).toBe("2");

    close();

    await vi.waitFor(() => expect(restored).toHaveLength(1));
    expect(restored[0].jobStatus).toBe(1);
  });

  it("keeps a document that arrived while the editor was open", async () => {
    renderOverEditJob(storedJob({ jobStatus: 1 }), () => <CloseJobIcon />);

    useUsersStore.getState().editSession.actions.documentArrived("job-1", {
      ...storedJob({ jobStatus: 1 }),
      name: "Renamed by somebody else",
    });

    close();

    await vi.waitFor(() => expect(restored).toHaveLength(1));
    expect(restored[0].name).toBe("Renamed by somebody else");
  });

  it("puts back a job that can still be changed in place", async () => {
    renderOverEditJob(
      storedJob({
        jobStatus: 1,
        build: {
          setup: {},
          materials: { 34: { typeID: 34, name: "Tritanium" } },
          childJobs: { 34: ["child-1"] },
        },
      }),
      ({ actions }) => (
        <>
          <button onClick={() => actions.run(stepForward())}>next step</button>
          <CloseJobIcon />
        </>
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "next step" }));
    close();

    await vi.waitFor(() => expect(restored).toHaveLength(1));
    expect(() =>
      applyCommands(restored[0], removeChildJob(34, "child-1")),
    ).not.toThrow();
  });

  it("does not put back a job that has since been deleted", async () => {
    held.current = false;
    renderOverEditJob(storedJob(), () => <CloseJobIcon />);

    close();

    await vi.waitFor(() =>
      expect(navigated).toContainEqual({ to: "/jobplanner" }),
    );
    expect(restored).toEqual([]);
  });

  it("empties the session and gives up its locks", async () => {
    renderOverEditJob(storedJob(), () => <CloseJobIcon />);

    close();

    await vi.waitFor(() =>
      expect(yielded).toContainEqual({ jobID: "job-1", groupID: undefined }),
    );
    expect(
      useUsersStore.getState().editSession.draft.base["job-1"],
    ).toBeUndefined();
  });
});
