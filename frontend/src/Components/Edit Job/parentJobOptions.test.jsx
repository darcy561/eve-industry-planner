import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { TRITANIUM } from "../../tests/editJobFixtures.js";

const { store, readOnly, showSnackbarSuccess } = vi.hoisted(() => ({
  store: { current: null },
  readOnly: { current: false },
  showSnackbarSuccess: vi.fn(),
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../Events/snackbarEvents", () => ({ showSnackbarSuccess }));

vi.mock("./Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
}));

const { ParentJobOptions } = await import("./parentJobOptions.jsx");

const theme = createTheme();

/** A job on the planner, with whatever materials it is built from. */
function job(jobID, name, { builtFrom = [], groupID = null } = {}) {
  return {
    jobID,
    name,
    itemID: 587,
    groupID,
    setupCount: 1,
    totalQuantityProduced: 10,
    build: { materials: builtFrom.map((typeID) => ({ typeID })) },
  };
}

function planner(...jobs) {
  store.current = { jobData: { jobArray: jobs } };
}

/** The job being edited, whose output the listed jobs would consume. */
function editing({
  parentJobs = [],
  includedInGroup = false,
  groupID = null,
  add = [],
  remove = [],
} = {}) {
  return {
    activeJob: { itemID: TRITANIUM, parentJobs, includedInGroup, groupID },
    parentChildToEdit: { parentJobs: { add, remove } },
  };
}

const actions = { markParentJobForAddition: vi.fn() };

const onLinked = vi.fn();

function show(state) {
  return render(
    <ThemeProvider theme={theme}>
      <ParentJobOptions state={state} actions={actions} onLinked={onLinked} />
    </ThemeProvider>,
  );
}

function offered(name) {
  return screen.queryByText(name);
}

/** The link control carries an icon and no name of its own. */
function linkButton() {
  return screen.getByTestId("AddIcon").closest("button");
}

beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
});

describe("choosing a parent job to link the job being edited to", () => {
  it("offers a job built from what this one makes", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));

    show(editing());

    expect(offered("Rifter Build")).toBeInTheDocument();
  });

  it("leaves out a job that does not use what this one makes", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [35] }));

    show(editing());

    expect(offered("Rifter Build")).toBeNull();
    expect(screen.getByText("No Jobs Available")).toBeInTheDocument();
  });

  it("leaves out a job this one is already linked to", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));

    show(editing({ parentJobs: ["job-a"] }));

    expect(offered("Rifter Build")).toBeNull();
  });

  it("leaves out a job already waiting to be linked", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));

    show(editing({ add: ["job-a"] }));

    expect(offered("Rifter Build")).toBeNull();
  });

  // A link the reader has just taken off is offered again so they can put it
  // back without leaving the job.
  it("offers a job whose link is waiting to be taken off", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [] }));

    show(editing({ remove: ["job-a"] }));

    expect(offered("Rifter Build")).toBeInTheDocument();
  });

  it("keeps a grouped job to jobs in its own group", () => {
    planner(
      job("job-a", "Same Group", { builtFrom: [TRITANIUM], groupID: "g-1" }),
      job("job-b", "Other Group", { builtFrom: [TRITANIUM], groupID: "g-2" }),
    );

    show(editing({ includedInGroup: true, groupID: "g-1" }));

    expect(offered("Same Group")).toBeInTheDocument();
    expect(offered("Other Group")).toBeNull();
  });

  it("lets an ungrouped job link to a grouped one", () => {
    planner(
      job("job-b", "Other Group", { builtFrom: [TRITANIUM], groupID: "g-2" }),
    );

    show(editing());

    expect(offered("Other Group")).toBeInTheDocument();
  });

  it("links the job that was chosen", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));
    show(editing());

    fireEvent.click(linkButton());

    expect(actions.markParentJobForAddition).toHaveBeenCalledWith("job-a");
    expect(showSnackbarSuccess).toHaveBeenCalledWith("Rifter Build Linked");
    expect(onLinked).toHaveBeenCalled();
  });

  it("will not link while the job is locked", () => {
    readOnly.current = true;
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));

    show(editing());

    expect(linkButton()).toBeDisabled();
  });
});
