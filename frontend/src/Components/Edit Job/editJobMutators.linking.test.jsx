import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import Group from "../../Classes/group";
import {
  TRITANIUM,
  editJobStore,
  plannerJob,
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

vi.mock("../../Events/snackbarEvents", () => ({
  showSnackbarSuccess: vi.fn(),
  showSnackbarError: vi.fn(),
  showSnackbarWarning: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock("../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: vi.fn(),
}));

const { renderOverEditJob, storedJob } =
  await import("../../tests/editJobHarness.jsx");
const { ParentJobOptions } = await import("./parentJobOptions.jsx");
const { ChildJobLinks } =
  await import("./Edit Job Components/Purchasing/Standard Layout/Child Job Dialogue/childJobLinks.jsx");
const { LinkedJobBadge } = await import("./Linked Job Badge.jsx");

let group = null;
function onThePlanner(...jobs) {
  store.current = editJobStore({ group, plannerJobs: jobs });
}

beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
});

describe("linking jobs to each other, end to end", () => {
  it("marks a parent job for linking", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ itemID: TRITANIUM }),
      ({ state, actions }) => {
        onThePlanner(
          plannerJob("job-2", "Rifter", {
            itemID: 587,
            builtFrom: [TRITANIUM],
          }),
        );
        return (
          <ParentJobOptions
            state={state}
            actions={actions}
            onLinked={() => {}}
          />
        );
      },
    );

    fireEvent.click(screen.getByTestId("AddIcon").closest("button"));

    expect(editJob.current.parentChildToEdit.parentJobs.add).toContain("job-2");
    expect(editJob.current.parentChildToEdit.parentJobs.remove).toEqual([]);
  });

  it("marks a child job for linking against the material it makes", () => {
    const material = { typeID: TRITANIUM };
    const { editJob } = renderOverEditJob(
      storedJob({
        build: {
          setup: {},
          materials: [material],
          childJobs: { [TRITANIUM]: [] },
        },
      }),
      ({ state, actions }) => {
        onThePlanner(plannerJob("job-3", "Tritanium", { itemID: TRITANIUM }));
        return (
          <ChildJobLinks state={state} actions={actions} material={material} />
        );
      },
    );

    fireEvent.click(screen.getByTestId("AddIcon").closest("button"));

    expect(
      editJob.current.parentChildToEdit.childJobs[TRITANIUM].add,
    ).toContain("job-3");
    expect(editJob.current.temporaryChildJobs[TRITANIUM].jobID).toBe("job-3");
  });

  // Marking a link for removal and then for addition again must leave the job
  // linked once, not queued for both.
  it("takes a child job back off the removal list when it is linked again", () => {
    const material = { typeID: TRITANIUM };
    const child = plannerJob("job-3", "Tritanium", { itemID: TRITANIUM });
    const { editJob } = renderOverEditJob(
      storedJob({
        build: {
          setup: {},
          materials: [material],
          childJobs: { [TRITANIUM]: ["job-3"] },
        },
      }),
      ({ state, actions }) => {
        onThePlanner(child);
        return (
          <ChildJobLinks state={state} actions={actions} material={material} />
        );
      },
    );

    fireEvent.click(screen.getByTestId("ClearIcon").closest("button"));
    expect(
      editJob.current.parentChildToEdit.childJobs[TRITANIUM].remove,
    ).toContain("job-3");

    fireEvent.click(screen.getByTestId("AddIcon").closest("button"));

    expect(
      editJob.current.parentChildToEdit.childJobs[TRITANIUM].remove,
    ).not.toContain("job-3");
  });
});

describe("unlinking a parent job, end to end", () => {
  it("marks the parent for removal", () => {
    const parent = plannerJob("job-9", "Rifter", { itemID: 587 });
    const { editJob } = renderOverEditJob(
      storedJob({ parentJobs: ["job-9"] }),
      ({ state, actions }) => {
        onThePlanner(parent);
        return <LinkedJobBadge state={state} actions={actions} />;
      },
    );

    fireEvent.click(screen.getByTestId("ClearIcon"));

    expect(editJob.current.parentChildToEdit.parentJobs.remove).toContain(
      "job-9",
    );
  });
});
