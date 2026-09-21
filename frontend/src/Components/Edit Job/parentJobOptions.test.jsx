import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { TRITANIUM } from "../../tests/editJobFixtures.js";
import { snackbarSpies } from "../../tests/snackbarHarness.js";
import { renderCounts } from "../../tests/renderCounts.jsx";

const { showSnackbarSuccess } = snackbarSpies;

const { readOnly } = vi.hoisted(() => ({ readOnly: { current: false } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("./Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
}));

const { ParentJobOptions } = await import("./parentJobOptions.jsx");
const { default: useUsersStore } = await import("../../Zustand/usersStore");
const { usersStoreState } = await import("../../tests/usersStoreHarness.js");

const theme = createTheme();

const session = () => useUsersStore.getState().editSession;
const linkEdits = () => session().parentChildToEdit.parentJobs;

/** A job on the planner, with whatever materials it is built from. */
function job(jobID, name, { builtFrom = [], groupID = null } = {}) {
  return {
    jobID,
    name,
    itemID: 587,
    groupID,
    setupCount: 1,
    totalQuantityProduced: 10,
    build: {
      materials: Object.fromEntries(
        builtFrom.map((typeID) => [String(typeID), { typeID }]),
      ),
    },
  };
}

function planner(...jobs) {
  useUsersStore.setState(usersStoreState({ jobData: { jobArray: jobs } }));
}

/** The job being edited, whose output the listed jobs would consume. */
function editing({
  parentJobs = [],
  includedInGroup = false,
  groupID = null,
  add = [],
  remove = [],
} = {}) {
  session().actions.openJob("job-1", {
    jobID: "job-1",
    itemID: TRITANIUM,
    parentJobs,
    includedInGroup,
    groupID,
    build: {},
  });
  add.forEach(session().actions.markParentJobForAddition);
  remove.forEach(session().actions.markParentJobForRemoval);
}

const onLinked = vi.fn();

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <ParentJobOptions onLinked={onLinked} />
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
  session().actions.closeSession();
  planner();
});

describe("choosing a parent job to link the job being edited to", () => {
  it("offers a job built from what this one makes", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));
    editing();

    show();

    expect(offered("Rifter Build")).toBeInTheDocument();
  });

  it("leaves out a job that does not use what this one makes", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [35] }));
    editing();

    show();

    expect(offered("Rifter Build")).toBeNull();
    expect(screen.getByText("No Jobs Available")).toBeInTheDocument();
  });

  it("leaves out a job this one is already linked to", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));
    editing({ parentJobs: ["job-a"] });

    show();

    expect(offered("Rifter Build")).toBeNull();
  });

  it("leaves out a job already waiting to be linked", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));
    editing({ add: ["job-a"] });

    show();

    expect(offered("Rifter Build")).toBeNull();
  });

  // A link the reader has just taken off is offered again so they can put it
  // back without leaving the job.
  it("offers a job whose link is waiting to be taken off", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [] }));
    editing({ remove: ["job-a"] });

    show();

    expect(offered("Rifter Build")).toBeInTheDocument();
  });

  it("keeps a grouped job to jobs in its own group", () => {
    planner(
      job("job-a", "Same Group", { builtFrom: [TRITANIUM], groupID: "g-1" }),
      job("job-b", "Other Group", { builtFrom: [TRITANIUM], groupID: "g-2" }),
    );
    editing({ includedInGroup: true, groupID: "g-1" });

    show();

    expect(offered("Same Group")).toBeInTheDocument();
    expect(offered("Other Group")).toBeNull();
  });

  it("lets an ungrouped job link to a grouped one", () => {
    planner(
      job("job-b", "Other Group", { builtFrom: [TRITANIUM], groupID: "g-2" }),
    );
    editing();

    show();

    expect(offered("Other Group")).toBeInTheDocument();
  });

  it("links the job that was chosen", () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));
    editing();
    show();

    fireEvent.click(linkButton());

    expect(linkEdits().add).toContain("job-a");
    expect(showSnackbarSuccess).toHaveBeenCalledWith("Rifter Build Linked");
    expect(onLinked).toHaveBeenCalled();
  });

  // The dialogue body reads the parent links and the four fields it filters on,
  // so neither an edit to the job nor a child link being taken on is its
  // business. The session holds parent and child links in one object, which is
  // why the second of those is worth counting.
  it("is not re-rendered by a change it reads nothing of", async () => {
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));
    editing();
    const renders = renderCounts();
    const Counted = renders.watch("options", ParentJobOptions);
    render(
      <ThemeProvider theme={theme}>
        <Counted onLinked={onLinked} />
      </ThemeProvider>,
    );
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (held) => {
          held.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
      session().actions.markChildJobsForAddition([
        { jobID: "job-c", itemID: TRITANIUM },
      ]);
    });

    expect(renders.of("options")).toBe(0);
  });

  it("will not link while the job is locked", () => {
    readOnly.current = true;
    planner(job("job-a", "Rifter Build", { builtFrom: [TRITANIUM] }));
    editing();

    show();

    expect(linkButton()).toBeDisabled();
  });
});
