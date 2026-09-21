import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { TRITANIUM } from "../../../../../../tests/editJobFixtures.js";
import { snackbarSpies } from "../../../../../../tests/snackbarHarness.js";

const { showSnackbarSuccess } = snackbarSpies;

const { store, lock } = vi.hoisted(() => ({
  store: { current: null },
  lock: { current: { readOnly: false, reason: "" } },
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useSiblingLinkLock: () => lock.current,
}));

const { ChildJobLinks } = await import("./childJobLinks.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { usersStoreState } =
  await import("../../../../../../tests/usersStoreHarness.js");

const session = () => useUsersStore.getState().editSession;

const theme = createTheme();

const material = { typeID: TRITANIUM };

/** A job that produces the material this card is for. */
function job(jobID, name, { itemID = TRITANIUM, groupID = null } = {}) {
  return {
    jobID,
    name,
    itemID,
    groupID,
    totalSetupCount: 1,
    build: { setup: { one: {} } },
  };
}

function planner(...jobs) {
  store.current = {
    jobData: {
      jobArray: jobs,
      actions: {
        findJobInJobArray: (id) => jobs.find((j) => j.jobID === id) ?? null,
      },
    },
  };
  useUsersStore.setState(usersStoreState(store.current));
}

/**
 * The card's job, with whatever child links are already in place or pending.
 *
 * The job is kept across calls because that is what the session does: marking a
 * link records an intent beside the job rather than changing it, so the document
 * the card reads is the same one until something actually edits it.
 */
function editing({
  linked = [],
  add = [],
  remove = [],
  includedInGroup = false,
  groupID = null,
} = {}) {
  activeJob = activeJob ?? {
    jobID: "job-1",
    includedInGroup,
    groupID,
    build: { childJobs: { [TRITANIUM]: linked } },
  };
  // The card reads the job and the links it is waiting on from the session; its
  // two lists are still handed the state they have always taken.
  session().actions.openJob("job-1", activeJob);
  add.forEach((jobID) =>
    session().actions.markChildJobsForAddition([{ jobID, itemID: TRITANIUM }]),
  );
  remove.forEach((jobID) =>
    session().actions.markChildJobsForRemoval([{ jobID, itemID: TRITANIUM }]),
  );
  return {
    activeJob,
    temporaryChildJobs: {},
    parentChildToEdit: { childJobs: { [TRITANIUM]: { add, remove } } },
  };
}

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <ChildJobLinks material={material} />
    </ThemeProvider>,
  );
}

function again() {
  return (
    <ThemeProvider theme={theme}>
      <ChildJobLinks material={material} />
    </ThemeProvider>
  );
}

/** The two lists are told apart by the buttons their rows carry. */
function availableRows() {
  return screen.queryAllByTestId("AddIcon").map((icon) => icon.closest("div"));
}

function linkedRows() {
  return screen.queryAllByTestId("ClearIcon");
}

function offered(name) {
  const heading = screen.queryAllByText(name);
  return heading.length > 0;
}

let activeJob = null;

beforeEach(() => {
  vi.clearAllMocks();
  activeJob = null;
  lock.current = { readOnly: false, reason: "" };
  planner(job("job-a", "Tritanium Run"));
});

describe("choosing child jobs for a material", () => {
  it("offers a job that makes the material", () => {
    show(editing());

    expect(offered("Tritanium Run")).toBe(true);
    expect(availableRows()).toHaveLength(1);
  });

  it("says when there is nothing to offer", () => {
    planner(job("job-a", "Pyerite Run", { itemID: 35 }));

    show(editing());

    expect(screen.getByText("None Available")).toBeInTheDocument();
  });

  it("says when nothing is linked yet", () => {
    show(editing());

    expect(screen.getByText("None Linked")).toBeInTheDocument();
  });

  it("lists a job that is already linked, and stops offering it", () => {
    show(editing({ linked: ["job-a"] }));

    expect(linkedRows()).toHaveLength(1);
    expect(availableRows()).toHaveLength(0);
  });

  it("keeps a grouped job to jobs in its own group", () => {
    planner(
      job("job-a", "Same Group", { groupID: "g-1" }),
      job("job-b", "Other Group", { groupID: "g-2" }),
    );

    show(editing({ includedInGroup: true, groupID: "g-1" }));

    expect(offered("Same Group")).toBe(true);
    expect(offered("Other Group")).toBe(false);
  });

  it("links the job that was chosen", () => {
    show(editing());

    fireEvent.click(screen.getByTestId("AddIcon").closest("button"));

    expect(session().parentChildToEdit.childJobs[TRITANIUM].add).toContain(
      "job-a",
    );
    expect(showSnackbarSuccess).toHaveBeenCalledWith("Tritanium Run Linked");
  });

  // The other half of the same control: a row already linked carries the way to
  // sever it, and marking the removal is what the dialogue is for.
  it("unlinks the job that was already linked", () => {
    show(editing({ linked: ["job-a"] }));

    fireEvent.click(screen.getByTestId("ClearIcon").closest("button"));

    expect(session().parentChildToEdit.childJobs[TRITANIUM].remove).toContain(
      "job-a",
    );
  });

  it("will not link while a sibling holds the lock", () => {
    lock.current = { readOnly: true, reason: "someone else is editing" };
    show(editing());

    expect(screen.getByTestId("AddIcon").closest("button")).toBeDisabled();
  });

  // The link is not written to the job until it is saved — it waits in the
  // pending changes — so the lists have to follow that, not just the job.
  it("moves a job across once it is waiting to be linked", () => {
    const { rerender } = show(editing());

    rerender(again(editing({ add: ["job-a"] })));

    expect(availableRows()).toHaveLength(0);
    expect(linkedRows()).toHaveLength(1);
  });

  it("offers a job back once its unlink is waiting", () => {
    const { rerender } = show(editing({ linked: ["job-a"] }));

    rerender(again(editing({ linked: ["job-a"], remove: ["job-a"] })));

    expect(availableRows()).toHaveLength(1);
    expect(linkedRows()).toHaveLength(0);
  });
});
