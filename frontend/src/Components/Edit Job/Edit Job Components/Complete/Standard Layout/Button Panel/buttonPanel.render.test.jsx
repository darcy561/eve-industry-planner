import { buildCostPerItem } from "../../../../Edit Job Hooks/jobSelectors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

const { passedOver } = vi.hoisted(() => ({ passedOver: { current: null } }));

// The cost pass itself is proved where it lives; what is asked here is what the
// button hands it, which is the half a conversion can break.
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

// Enough of a group for what these buttons ask of one: which jobs in it are
// finished, and the two ways that set is written.
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
const { default: Job } = await import("../../../../../../Classes/job");

const session = () => useUsersStore.getState().editSession;
const group = () => useUsersStore.getState().jobData.groupArray[0];

/** A parent job on the planner that is built from what this one makes. */
const aParent = () =>
  new Job({
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

// Each reads the one or two fields it draws, so an edit to the rest of the job
// is not theirs to hear about.
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
          // The planner's own reads, as the cost pass makes them: the jobs it
          // was given, and the parents written back where they are held.
          getActiveGroupObject: () => aGroup(),
          // The real action rebuilds `groupArray` around the group it was
          // handed, which is what puts the change on screen.
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

  // The other direction, which a selector answering the same thing forever would
  // otherwise pass: a change to what the button draws reaches it.
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

  // What it sends is a cost per item, derived from the job rather than stored
  // on it: handed the job as the session stores it, the pass reads that figure
  // off nothing.
  it("hands over a job the cost per item can be read from", async () => {
    openJob(["job-2"], {
      extrasCosts: { "extra-1": { id: "extra-1", extraValue: 500 } },
    });
    render(<PassBuildCostsButton />);

    await userEvent.click(
      screen.getByRole("button", { name: "Send Build Costs & Complete" }),
    );

    expect(passedOver.current.jobID).toBe("job-1");
    // What the parent pays for this job's output is worked out from what it
    // holds, so the job handed over has to carry it rather than a figure.
    // 500 of extras over the ten the setup makes.
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
