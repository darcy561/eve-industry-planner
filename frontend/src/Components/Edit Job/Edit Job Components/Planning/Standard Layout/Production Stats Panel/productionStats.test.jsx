import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

const parents = {};

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    jobData: {
      jobArray: [],
      actions: { findJobInJobArray: (id) => parents[id] },
    },
  });
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ getQueryState: () => undefined }),
  QueryClient: class {},
}));

const { ProductionStats } = await import("./productionStats.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

/** Five runs of two items across three slots: thirty made in all. */
const jobDocument = ({ setup = {}, ...rest } = {}) => ({
  jobID: "job-1",
  itemID: 34,
  itemsProducedPerRun: 2,
  parentJobs: [],
  includedInGroup: false,
  skills: {},
  layout: { setupToEdit: "setup0" },
  build: {
    materials: {},
    childJobs: {},
    setup: {
      setup0: {
        id: "setup0",
        runCount: 5,
        jobCount: 3,
        rawTime: 600,
        jobType: 1,
        TE: 0,
        structureID: 0,
        rigID: 0,
        materialCount: {},
        ...setup,
      },
    },
  },
  esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  ...rest,
});

const show = (document = jobDocument(), Panel = ProductionStats) => {
  session().actions.openJob(document.jobID, document);
  return render(<Panel />);
};

beforeEach(() => {
  for (const key of Object.keys(parents)) delete parents[key];
  session().actions.closeSession();
});

describe("what the job produces", () => {
  it("counts the output per run, per slot and for the job", () => {
    show();

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    // The setup's total and the job's, which are the same figure on a job with
    // one setup.
    expect(screen.getAllByText("30")).toHaveLength(2);
  });

  // The time is worked out from the setup as it is stored. Read through
  // anything that insists on the class, the line is blank on every job.
  it("states how long a slot takes", () => {
    show();

    expect(screen.getByText("Time Per Job Slot")).toBeInTheDocument();
    expect(screen.getByText(/50M/)).toBeInTheDocument();
  });

  it("draws nothing until a setup is selected", () => {
    const { container } = show(jobDocument({ layout: { setupToEdit: null } }));

    expect(container).toBeEmptyDOMElement();
  });

  it("follows the setup being changed", async () => {
    show();

    await act(async () => {
      session().actions.run({
        name: "double the runs",
        recipe: (job) => {
          job.build.setup.setup0.runCount = 10;
        },
      });
    });

    expect(screen.getAllByText("60")).toHaveLength(2);
  });
});

// A job in a group builds to order, and a plan that makes less than its parents
// need is the thing the panel exists to surface.
describe("a job building for the jobs above it", () => {
  const withParent = (needed) => {
    parents["parent-1"] = {
      build: {
        materials: { 34: { typeID: 34, quantity: needed } },
        childJobs: { 34: ["job-1"] },
      },
    };
    return jobDocument({ parentJobs: ["parent-1"], includedInGroup: true });
  };

  it("states what the parents require", () => {
    show(withParent(100));

    expect(screen.getByText("Parent Job(s) Require")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("says nothing about parents on a job that has none", () => {
    show();

    expect(screen.queryByText("Parent Job(s) Require")).not.toBeInTheDocument();
  });
});

// The panel reads the setups, the skills and the parent links. A material being
// bought is none of those.
it("is not re-rendered by a change none of its figures are over", async () => {
  const renders = renderCounts();
  show(jobDocument(), renders.watch("stats", ProductionStats));
  renders.reset();

  await act(async () => {
    session().actions.run({
      name: "record a purchase",
      recipe: (job) => {
        job.build.materials = {
          34: { typeID: 34, purchasing: { a: { id: "a", itemCount: 1 } } },
        };
      },
    });
  });

  expect(renders.of("stats")).toBe(0);
});
