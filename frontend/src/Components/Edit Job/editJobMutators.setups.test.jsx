import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("../../Functions/System Indexes/findSystemIndex", () => ({
  default: async () => ({}),
}));

vi.mock("../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getSolarSystems: async () => ({
      30000142: { name: "Jita", security: "hiSec" },
      30002053: { name: "Tama", security: "lowSec" },
    }),
  });
});

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
const { SetupsPanel } =
  await import("./Edit Job Components/Planning/Standard Layout/Setups/setupsPanel.jsx");
const { MarkAsCompleteButton } =
  await import("./Edit Job Components/Complete/Standard Layout/Button Panel/markAsComplete.jsx");
const { committedFor } = await import("./Edit Job Hooks/jobDraftStore.js");
const { stubElementHeights } = await import("../../tests/elementHeights.js");
const { ZARZAKH_SYSTEM_ID } = await import("../../Context/defaultValues.jsx");
const { fieldsReleasedBy } =
  await import("../../Functions/Industry Facilities/placeConstraints.js");
const { default: useUsersStore } = await import("../../Zustand/usersStore");

let group = null;
beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
  store.current.jobData.actions.updateModifiedGroups = vi.fn();
  store.current.jobData.actions.queueJobGroupWritesAndSchedule = vi.fn();
});

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

function openTheEditor(job, options) {
  const result = renderOverEditJob(job, () => <SetupsPanel />, options);
  fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
  return result;
}

const deleteButtons = () =>
  screen.queryAllByRole("button", { name: /^Delete the setup of/ });

describe("the setups a job is built from, end to end", () => {
  it("deletes the setup whose row it is on", () => {
    const { editJob } = renderOverEditJob(
      withSetups("setup-1", "setup-2"),
      () => <SetupsPanel />,
    );

    fireEvent.click(deleteButtons()[1]);

    expect(setupIds(editJob.current)).toEqual(["setup-1"]);
    expect(editJob.current.activeJob.layout.setupToEdit).toBe("setup-1");
  });

  it("offers no delete on the only setup", () => {
    renderOverEditJob(withSetups("setup-1"), () => <SetupsPanel />);

    expect(deleteButtons()).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    expect(
      screen.queryByRole("button", { name: "Delete this setup" }),
    ).toBeNull();
  });

  it("adds a setup to build from", () => {
    const { editJob } = renderOverEditJob(withSetups("setup-1"), () => (
      <SetupsPanel />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Add setup" }));

    expect(setupIds(editJob.current)).toHaveLength(2);
    expect(editJob.current.jobModified).toBe(true);
  });

  it("moves the editing to a setup that is still there", () => {
    const { editJob } = openTheEditor(withSetups("setup-1", "setup-2"));

    fireEvent.click(screen.getByRole("button", { name: "Delete this setup" }));

    expect(setupIds(editJob.current)).toEqual(["setup-2"]);
    expect(editJob.current.activeJob.layout.setupToEdit).toBe("setup-2");
  });
});

describe("marking a job finished within its group, end to end", () => {
  it("records the job as finished, on the group rather than the job", () => {
    const { editJob } = renderOverEditJob(storedJob({ jobStatus: 4 }), () => (
      <MarkAsCompleteButton />
    ));
    expect(editJob.current.jobModified).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Mark As Complete" }));

    expect(group.areComplete.has("job-1")).toBe(true);
    expect(editJob.current.jobModified).toBe(false);
    const { updateModifiedGroups, queueJobGroupWritesAndSchedule } =
      store.current.jobData.actions;
    expect(updateModifiedGroups).toHaveBeenCalledWith(group);
    expect(queueJobGroupWritesAndSchedule).toHaveBeenCalledWith("group-1");
  });

  it("takes it back off finished", () => {
    group.areComplete.add("job-1");
    renderOverEditJob(storedJob({ jobStatus: 4 }), () => (
      <MarkAsCompleteButton />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Mark As Incomplete" }));

    expect(group.areComplete.has("job-1")).toBe(false);
  });
});

describe("changing the setup a job is built from, end to end", () => {
  const openSetup = (job) => openTheEditor(job);

  const storedSetup = () =>
    committedFor(useUsersStore.getState().editSession.draft, "job-1").build
      .setup["setup-1"];

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

describe("costing a setup against a militia, end to end", () => {
  const HELD_SYSTEM = 30045352;
  const CALDARI = 500001;

  const openSetup = (job) =>
    openTheEditor(job, {
      locationNames: { [CALDARI]: "Caldari State" },
    });

  const storedSetup = () =>
    committedFor(useUsersStore.getState().editSession.draft, "job-1").build
      .setup["setup-1"];

  function inASystemHeldBy(militiaFactionID) {
    store.current.worldData.systemIndexes = {
      [HELD_SYSTEM]: { manufacturing: 0.01, militiaFactionID },
    };
  }

  function jobInTheHeldSystem() {
    const job = withSetups("setup-1");
    job.build.setup["setup-1"].systemID = HELD_SYSTEM;
    return job;
  }

  const choose = (label, value) => {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
    fireEvent.click(screen.getByRole("option", { name: value }));
  };

  it("offers neither control where no militia holds the system", () => {
    openSetup(withSetups("setup-1"));

    expect(screen.queryByText("Enlisted Militia")).toBeNull();
    expect(screen.queryByText("System Upgrade Level")).toBeNull();
  });

  it("offers both where a militia holds the system", () => {
    inASystemHeldBy(CALDARI);
    openSetup(jobInTheHeldSystem());

    expect(screen.getByText("Enlisted Militia")).toBeInTheDocument();
    expect(screen.getByText("System Upgrade Level")).toBeInTheDocument();
  });

  it("keeps the militia the reader chose", async () => {
    inASystemHeldBy(CALDARI);
    openSetup(jobInTheHeldSystem());

    choose("Enlisted Militia", "Caldari State");

    await vi.waitFor(() => expect(storedSetup().enlistedFaction).toBe(CALDARI));
  });

  it("keeps the upgrade level the reader stated", async () => {
    inASystemHeldBy(CALDARI);
    openSetup(jobInTheHeldSystem());

    choose("System Upgrade Level", "Level 4");

    await vi.waitFor(() => expect(storedSetup().militiaUpgradeLevel).toBe(4));
  });
});

describe("fitting both rig slots, end to end", () => {
  const openSetup = (job) => openTheEditor(job);

  it("offers a field for each of a structure's two rig slots", () => {
    openSetup(withSetups("setup-1"));

    expect(screen.getByLabelText("Rig 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Rig 2")).toBeInTheDocument();
  });
});

describe("choosing a place that settles a setup's other choices, end to end", () => {
  const openSetup = (job) => openTheEditor(job);

  const storedSetup = () =>
    committedFor(useUsersStore.getState().editSession.draft, "job-1").build
      .setup["setup-1"];

  function selectWithID(id) {
    return screen
      .getAllByRole("combobox")
      .find((box) => box.id?.startsWith(id));
  }

  function jobInNullSec() {
    const job = withSetups("setup-1");
    Object.assign(job.build.setup["setup-1"], {
      structureID: 2,
      systemTypeID: 2,
      systemID: 30000142,
      taxValue: 5,
      rigSlot1: 1,
    });
    return job;
  }

  function chooseTheFulcrum() {
    fireEvent.mouseDown(selectWithID("structure-type-select"));
    fireEvent.click(screen.getByRole("option", { name: "The Fulcrum" }));
  }

  it("shows the security band the place settles on, not the one left behind", async () => {
    const job = withSetups("setup-1");
    Object.assign(job.build.setup["setup-1"], {
      structureID: 2,
      systemTypeID: 0,
      systemID: 30000142,
    });
    openSetup(job);

    chooseTheFulcrum();

    await vi.waitFor(() =>
      expect(selectWithID("system-type-select")).toHaveTextContent(
        "Null Sec / WH",
      ),
    );
  });

  it("shows the tax the place charges, not the one the reader typed elsewhere", async () => {
    openSetup(jobInNullSec());

    chooseTheFulcrum();

    await vi.waitFor(() =>
      expect(
        screen
          .getByLabelText("job-percentage-textfield")
          .querySelector("input"),
      ).toHaveValue(0.25),
    );
  });

  it("offers every structure again, so the place can be left", () => {
    openSetup(jobInNullSec());

    chooseTheFulcrum();

    fireEvent.mouseDown(selectWithID("structure-type-select"));

    expect(screen.getAllByRole("option").length).toBeGreaterThan(1);
  });

  it("lets go of the system when the reader picks another structure", async () => {
    openSetup(jobInNullSec());
    chooseTheFulcrum();
    await vi.waitFor(() => expect(storedSetup().structureID).toBe(4));

    fireEvent.mouseDown(selectWithID("structure-type-select"));
    fireEvent.click(screen.getByRole("option", { name: "Large" }));

    await vi.waitFor(() => {
      expect(storedSetup().structureID).toBe(2);
      expect(storedSetup().systemID).not.toBe(ZARZAKH_SYSTEM_ID);
    });
  });

  it("lets go of the structure when the reader picks another system", async () => {
    openSetup(jobInNullSec());
    chooseTheFulcrum();
    await vi.waitFor(() => expect(storedSetup().structureID).toBe(4));

    const released = fieldsReleasedBy(storedSetup(), "systemID", 30000142);

    expect(released).toContain("structureID");
    expect(released).toContain("rigSlot1");
  });

  it("empties the rig slots the place allows nothing in", async () => {
    openSetup(jobInNullSec());

    chooseTheFulcrum();

    await vi.waitFor(() =>
      expect(screen.getByLabelText("Rig 1")).toHaveValue("None"),
    );
  });
});

describe("choosing a system from the picker, end to end", () => {
  const openSetup = (job) => openTheEditor(job);

  const storedSetup = () =>
    committedFor(useUsersStore.getState().editSession.draft, "job-1").build
      .setup["setup-1"];

  let restoreHeights;
  beforeEach(() => {
    restoreHeights = stubElementHeights();
  });
  afterEach(() => restoreHeights?.());

  async function chooseSystem(name) {
    await vi.waitFor(() =>
      expect(
        screen
          .getAllByRole("combobox")
          .find((box) => box.id === "System Search"),
      ).toBeDefined(),
    );
    const search = screen
      .getAllByRole("combobox")
      .find((box) => box.id === "System Search");

    const user = userEvent.setup();
    await user.type(search, name);
    await user.click(await screen.findByText(name));
  }

  it("moves the setup onto the band the chosen system is in", async () => {
    const job = withSetups("setup-1");
    Object.assign(job.build.setup["setup-1"], {
      structureID: 2,
      systemTypeID: 0,
      systemID: 30000142,
    });
    openSetup(job);

    await chooseSystem("Tama");

    await vi.waitFor(() => {
      expect(storedSetup().systemID).toBe(30002053);
      expect(storedSetup().systemTypeID).toBe(1);
    });
  });
});
