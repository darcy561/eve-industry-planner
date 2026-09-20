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

/* Changing a setup asks the server what the system's index is; the change does
 * not wait on the answer to be worth making. */
vi.mock("../../Functions/System Indexes/findSystemIndex", () => ({
  default: async () => ({}),
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
const { EditJobSetup } =
  await import("./Edit Job Components/Planning/Standard Layout/Edit Setup Panel/editJobSetup.jsx");
const { committedFor } = await import("./Edit Job Hooks/jobDraftStore.js");
const { default: useUsersStore } = await import("../../Zustand/usersStore");

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
    build: { setup, materials: {}, childJobs: {} },
  });
}

function setupIds(state) {
  return Object.keys(state.activeJob.build.setup);
}

function openTheMenu() {
  fireEvent.click(screen.getByTestId("MoreVertIcon").closest("button"));
}

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
  it("records the job as finished, on the group rather than the job", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 4 }),
      ({ state, actions }) => (
        <MarkAsCompleteButton state={state} actions={actions} />
      ),
    );
    expect(editJob.current.jobModified).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Mark As Complete" }));

    expect(group.areComplete.has("job-1")).toBe(true);
    // Finishing a job is a change to the group, and the group is written. The
    // job itself is untouched, so it has nothing of its own to save.
    expect(editJob.current.jobModified).toBe(false);
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

// The panel changes a setup by saying what the reader did. Changing the setup on
// screen instead reaches nothing, because the job the page reads is rebuilt from
// what the session holds — which is how these controls came to look like they
// worked while changing nothing.
describe("changing the setup a job is built from, end to end", () => {
  const openSetup = (job) =>
    renderOverEditJob(job, ({ state, actions }) => (
      <EditJobSetup state={state} actions={actions} />
    ));

  /**
   * The setup as the session holds it, not as the job on screen shows it: a
   * control that changed the job in place would still be visible through the
   * copy this render is reading, which is the defect itself.
   */
  const storedSetup = () =>
    committedFor(useUsersStore.getState().editSession.draft, "job-1").build
      .setup["setup-1"];

  /** The fields report what was typed when the reader leaves them. */
  const type = (label, value) => {
    const input = screen.getByLabelText(label).querySelector("input");
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  };

  it("keeps a new run count", async () => {
    openSetup(withSetups("setup-1"));

    type("blueprint-runs-textfield", "25");

    await vi.waitFor(() => expect(storedSetup().runCount).toBe(25));
  });

  it("keeps a new job slot count", async () => {
    openSetup(withSetups("setup-1"));

    type("job-slots-textfield", "3");

    await vi.waitFor(() => expect(storedSetup().jobCount).toBe(3));
  });
});
