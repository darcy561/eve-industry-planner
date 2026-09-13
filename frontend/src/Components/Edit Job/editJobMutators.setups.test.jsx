import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import Group from "../../Classes/group";
import {
  blueprintRawData,
  editJobStore,
  setupFixture,
} from "../../tests/editJobFixtures";

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

/* Adding a setup reads the blueprint index; an empty one is enough to build the
 * setup from the job it is based on. */
vi.mock("../../Hooks/EveEsi/useBlueprintIndex", () => ({
  BLUEPRINT_SCOPE: { ALL: "all" },
  getCachedBlueprintIndex: () => ({
    rows: [],
    byItemId: new Map(),
    byTypeId: new Map(),
  }),
}));

const { renderOverEditJob, storedJob } =
  await import("../../tests/editJobHarness.jsx");
const { JobSetupPanel } =
  await import("./Edit Job Components/Planning/Standard Layout/Setup Panel/jobSetups.jsx");
const { MarkAsCompleteButton } =
  await import("./Edit Job Components/Complete/Standard Layout/Button Panel/markAsComplete.jsx");

let group = null;
beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
  // Watched here rather than in the shared fixture, which stays clear of the
  // test framework.
  store.current.jobData.actions.updateModifiedGroups = vi.fn();
  store.current.jobData.actions.queueJobGroupWritesAndSchedule = vi.fn();
});

/** A job with the setups given, the first of them being edited. */
function withSetups(...ids) {
  const setup = {};
  for (const id of ids) {
    setup[id] = setupFixture(id);
  }
  return storedJob({
    layout: { setupToEdit: ids[0] },
    rawData: blueprintRawData(),
    build: { setup, materials: [], childJobs: {} },
  });
}

function setupIds(state) {
  return Object.keys(state.activeJob.build.setup);
}

function openTheMenu() {
  fireEvent.click(screen.getByTestId("MoreVertIcon").closest("button"));
}

/* `recalculateSelectedSetup` is not covered here: it is driven from the ME/TE and
 * system-index editors, which carry more surrounding state than a button, and it
 * is unit-tested directly on `Job` in `tests/recalculateJobSetupContext.test.js`. */
describe("the setups a job is built from, end to end", () => {
  it("deletes the setup being edited", () => {
    const { editJob } = renderOverEditJob(
      withSetups("setup-1", "setup-2"),
      ({ state, actions }) => <JobSetupPanel state={state} actions={actions} />,
    );

    openTheMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete Active Setup" }),
    );

    expect(setupIds(editJob.current)).toEqual(["setup-2"]);
  });

  // Something has to be built, so the last setup cannot be deleted.
  it("refuses to delete the only setup", () => {
    const { editJob } = renderOverEditJob(
      withSetups("setup-1"),
      ({ state, actions }) => <JobSetupPanel state={state} actions={actions} />,
    );

    openTheMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete Active Setup" }),
    );

    expect(setupIds(editJob.current)).toEqual(["setup-1"]);
  });

  it("adds a setup to build from", () => {
    const { editJob } = renderOverEditJob(
      withSetups("setup-1"),
      ({ state, actions }) => <JobSetupPanel state={state} actions={actions} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Setup" }));

    expect(setupIds(editJob.current)).toHaveLength(2);
    expect(editJob.current.jobModified).toBe(true);
  });

  it("moves the editing to a setup that is still there", () => {
    const { editJob } = renderOverEditJob(
      withSetups("setup-1", "setup-2"),
      ({ state, actions }) => <JobSetupPanel state={state} actions={actions} />,
    );

    openTheMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete Active Setup" }),
    );

    expect(editJob.current.activeJob.layout.setupToEdit).toBe("setup-2");
  });
});

describe("marking a job finished within its group, end to end", () => {
  it("records the job as finished and the job as changed", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 4 }),
      ({ state, actions }) => (
        <MarkAsCompleteButton state={state} actions={actions} />
      ),
    );
    expect(editJob.current.jobModified).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Mark As Complete" }));

    expect(group.areComplete.has("job-1")).toBe(true);
    expect(editJob.current.jobModified).toBe(true);
    // Finishing a job is a change to the group, and the group is written.
    const { updateModifiedGroups, queueJobGroupWritesAndSchedule } =
      store.current.jobData.actions;
    expect(updateModifiedGroups).toHaveBeenCalledWith(group);
    expect(queueJobGroupWritesAndSchedule).toHaveBeenCalledWith("group-1");
  });

  it("takes it back off finished", () => {
    group.areComplete.add("job-1");
    renderOverEditJob(storedJob({ jobStatus: 4 }), ({ state, actions }) => (
      <MarkAsCompleteButton state={state} actions={actions} />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Mark As Incomplete" }));

    expect(group.areComplete.has("job-1")).toBe(false);
  });
});
