import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import Group from "../../Classes/group";
import { stepBackward, stepForward } from "./Edit Job Hooks/jobCommands";
import { editJobStore } from "../../tests/editJobFixtures";

const { store, readOnly } = vi.hoisted(() => ({
  store: { current: null },
  readOnly: { current: false },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("./Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
  useSiblingLinkLock: () => ({ readOnly: readOnly.current, reason: "" }),
}));

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock("../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: vi.fn(),
}));

const { renderOverEditJob, storedJob } =
  await import("../../tests/editJobHarness.jsx");
const { TabPanel_Building } =
  await import("./Edit Job Components/Building/StandardLayout/Tab Panel/tabPanel.jsx");
const { SellGroupJobButton } =
  await import("./Edit Job Components/Complete/Standard Layout/Button Panel/sellGroupJob.jsx");

let group = null;
beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
});

describe("what the reader changes on a job, end to end", () => {
  it("remembers which tab of the building step was open", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 2 }),
      ({ state, actions }) => (
        <TabPanel_Building state={state} actions={actions} jobMatches={[]} />
      ),
    );

    fireEvent.click(screen.getByRole("tab", { name: /Available ESI Job/i }));

    expect(editJob.current.activeJob.layout.esiJobTab).toBe("0");
    expect(editJob.current.jobModified).toBe(true);
  });

  it("hands back the whole job after a layout change, not the part that moved", () => {
    const stored = storedJob({ jobStatus: 2 });
    const { editJob } = renderOverEditJob(stored, ({ state, actions }) => (
      <TabPanel_Building state={state} actions={actions} jobMatches={[]} />
    ));

    fireEvent.click(screen.getByRole("tab", { name: /Available ESI Job/i }));

    const job = editJob.current.activeJob;
    expect(job.layout.esiJobTab).toBe("0");
    expect(job.jobID).toBe(stored.jobID);
    expect(job.build.setup).toEqual(stored.build.setup);
  });

  it("marks a grouped job ready for sale and moves it on a step", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 3, parentJobs: [] }),
      () => <SellGroupJobButton />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ready For Sale" }));

    expect(editJob.current.activeJob.isReadyToSell).toBe(true);
    expect(editJob.current.activeJob.jobStatus).toBe(4);
  });

  it("stops offering the sale once the job is on sale", () => {
    renderOverEditJob(storedJob({ jobStatus: 3, parentJobs: [] }), () => (
      <SellGroupJobButton />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Ready For Sale" }));

    expect(
      screen.getByRole("button", { name: "Not Ready For Sale" }),
    ).toBeDisabled();
  });

  it("changes nothing while the job is locked by another session", () => {
    readOnly.current = true;
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 3, parentJobs: [] }),
      () => <SellGroupJobButton />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ready For Sale" }));

    expect(editJob.current.activeJob.isReadyToSell).toBe(false);
    expect(editJob.current.jobModified).toBe(false);
  });
});

describe("stepping a job through the planner, end to end", () => {
  it("moves the job on a step", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 1 }),
      ({ actions }) => (
        <button onClick={() => actions.run(stepForward())}>next step</button>
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "next step" }));

    expect(editJob.current.activeJob.jobStatus).toBe(2);
    expect(editJob.current.jobModified).toBe(true);
  });

  it("moves the job back a step", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 2 }),
      ({ actions }) => (
        <button onClick={() => actions.run(stepBackward())}>
          previous step
        </button>
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "previous step" }));

    expect(editJob.current.activeJob.jobStatus).toBe(1);
  });

  it("hands back the whole job when a stage moves, not the part that moved", () => {
    const stored = storedJob({ jobStatus: 1 });
    const { editJob } = renderOverEditJob(stored, ({ actions }) => (
      <button onClick={() => actions.run(stepForward())}>next step</button>
    ));

    fireEvent.click(screen.getByRole("button", { name: "next step" }));

    const job = editJob.current.activeJob;
    expect(job.jobStatus).toBe(2);
    expect(job.jobID).toBe(stored.jobID);
    expect(job.build.setup).toEqual(stored.build.setup);
  });
});
