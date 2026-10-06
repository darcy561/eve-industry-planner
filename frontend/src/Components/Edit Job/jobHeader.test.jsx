import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderOverEditJob, storedJob } from "../../tests/editJobHarness";
import { stepForward } from "./Edit Job Hooks/jobCommands";

const { treeOpened } = vi.hoisted(() => ({ treeOpened: [] }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({}));
});
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({ activeGroup: "group-1", pageView: "jobTree" }),
}));
vi.mock("../../Events/jobDependencyTreeDialogueEvents", () => ({
  openJobLinkTreeFromEditPage: (args) => treeOpened.push(args),
}));

const nothing = () => null;
vi.mock("./deleteJobButton", () => ({ DeleteJobButton: nothing }));
vi.mock("./closeJobButton", () => ({ CloseJobButton: nothing }));
vi.mock("./saveJobButton", () => ({ SaveJobButton: nothing }));
vi.mock("./jobPurposeLine", () => ({ default: nothing }));

const { default: JobHeader } = await import("./jobHeader");

describe("the Edit Job header", () => {
  it("says the job is saved until something changes, then that it has unsaved changes", () => {
    renderOverEditJob(storedJob({ jobStatus: 1 }), ({ actions }) => (
      <>
        <button onClick={() => actions.run(stepForward())}>next step</button>
        <JobHeader />
      </>
    ));

    expect(screen.getByText("Saved")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "next step" }));

    expect(screen.getByText("● Unsaved changes")).toBeInTheDocument();
  });

  it("opens the item tree carrying the group and view the job came from", () => {
    renderOverEditJob(storedJob(), () => <JobHeader />);

    fireEvent.click(screen.getByRole("button", { name: "Item tree" }));

    expect(treeOpened).toEqual([
      { jobId: "job-1", activeGroup: "group-1", pageView: "jobTree" },
    ]);
  });
});
