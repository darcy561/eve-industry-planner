import { buildCostPerItem } from "../../../../Edit Job Hooks/jobSelectors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

const { passedOver } = vi.hoisted(() => ({ passedOver: { current: null } }));

vi.mock("../../../../../../Functions/Shared/passBuildCosts", () => ({
  passBuildCostsToParentJobs: (job) => {
    passedOver.current = job;
    return { messageText: "" };
  },
}));

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    jobData: { activeGroupID: "group-1", groupArray: [] },
  });
});

const aGroup = () => {
  const areComplete = new Set();
  return {
    groupID: "group-1",
    areComplete,
    addAreComplete: (jobID) => areComplete.add(jobID),
    removeAreComplete: (jobID) => areComplete.delete(jobID),
  };
};

const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { MarkAsCompleteButton } = await import("./markAsComplete");
const { PassBuildCostsButton } = await import("./passBuildCosts");
const { SellGroupJobButton } = await import("./sellGroupJob");
const { jobFromDocument } =
  await import("../../../../../../Functions/Job/jobDocument.js");

const session = () => useUsersStore.getState().editSession;
const group = () => useUsersStore.getState().jobData.groupArray[0];

const aParent = () =>
  jobFromDocument({
    jobID: "job-2",
    itemID: 999,
    jobType: 1,
    build: {
      materials: [
        { typeID: 587, name: "Rifter", quantity: 10, purchasing: {} },
      ],
      childJobs: { 587: ["job-1"] },
    },
  });

const openJob = (parentJobs = [], build = {}) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    name: "Rifter",
    itemID: 587,
    jobType: 1,
    itemsProducedPerRun: 10,
    parentJobs,
    isReadyToSell: false,
    build: {
      setup: { "setup-1": { id: "setup-1", runCount: 1, jobCount: 1 } },
      materials: {},
      products: { totalQuantity: 10 },
      ...build,
    },
  });

describe("the Complete stage's buttons", () => {
  beforeEach(() => {
    session().actions.closeSession();
    useUsersStore.setState({
      jobData: {
        ...useUsersStore.getState().jobData,
        jobArray: [aParent()],
        groupArray: [aGroup()],
        actions: {
          ...useUsersStore.getState().jobData.actions,
          getActiveGroupObject: () => aGroup(),
          updateModifiedGroups: (changed) =>
            useUsersStore.setState({
              jobData: {
                ...useUsersStore.getState().jobData,
                groupArray: [{ ...changed }],
              },
            }),
          queueJobGroupWritesAndSchedule: () => {},
        },
      },
    });
  });

  const heldStillBy = async (name, Button, parentJobs) => {
    const renders = renderCounts();
    const Counted = renders.watch(name, Button);
    openJob(parentJobs);
    render(<Counted />);
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    return renders.of(name);
  };

  it("leaves mark-as-complete alone", async () => {
    expect(await heldStillBy("complete", MarkAsCompleteButton)).toBe(0);
  });

  it("leaves pass-build-costs alone", async () => {
    expect(
      await heldStillBy("passCosts", PassBuildCostsButton, ["job-2"]),
    ).toBe(0);
  });

  it("leaves ready-for-sale alone", async () => {
    expect(await heldStillBy("sell", SellGroupJobButton)).toBe(0);
  });

  it("follows the field it does read", async () => {
    openJob();
    render(<SellGroupJobButton />);
    expect(
      screen.getByRole("button", { name: "Ready For Sale" }),
    ).toBeInTheDocument();

    await act(async () => {
      session().actions.run({
        name: "mark ready for sale",
        recipe: (job) => {
          job.isReadyToSell = true;
        },
      });
    });

    expect(
      screen.getByRole("button", { name: "Not Ready For Sale" }),
    ).toBeInTheDocument();
  });

  it("marks the job complete within its group, and back again", async () => {
    openJob();
    render(<MarkAsCompleteButton />);

    await userEvent.click(
      screen.getByRole("button", { name: "Mark As Complete" }),
    );
    expect(group().areComplete.has("job-1")).toBe(true);

    await userEvent.click(
      screen.getByRole("button", { name: "Mark As Incomplete" }),
    );
    expect(group().areComplete.has("job-1")).toBe(false);
  });

  it("hands over a job the cost per item can be read from", async () => {
    openJob(["job-2"], {
      extrasCosts: { "extra-1": { id: "extra-1", extraValue: 500 } },
    });
    render(<PassBuildCostsButton />);

    await userEvent.click(
      screen.getByRole("button", { name: "Send Build Costs & Complete" }),
    );

    expect(passedOver.current.jobID).toBe("job-1");
    expect(buildCostPerItem(passedOver.current)).toBe(50);
  });

  it("draws nothing for a group the planner no longer holds", () => {
    openJob();
    useUsersStore.setState({
      jobData: { ...useUsersStore.getState().jobData, groupArray: [] },
    });

    const { container } = render(<MarkAsCompleteButton />);

    expect(container).toBeEmptyDOMElement();
  });
});
