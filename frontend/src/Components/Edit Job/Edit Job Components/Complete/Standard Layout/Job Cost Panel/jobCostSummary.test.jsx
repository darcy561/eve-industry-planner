import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  });
});

const { JobCostSummaryPanel } = await import("./jobCostSummary.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

const TRITANIUM = 34;

/** 500 of materials, 200 of installs, 50 of extras, 250 of invention. */
const openJob = () =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    itemsProducedPerRun: 10,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity: 100 } },
        },
      },
      materials: {
        [TRITANIUM]: {
          typeID: TRITANIUM,
          name: "Tritanium",
          purchasing: { a: { id: "a", itemCount: 100, itemCost: 5 } },
        },
      },
      extrasCosts: { e: { id: "e", extraValue: 50 } },
      inventionEntries: { i: { id: "i", itemCost: 250 } },
      childJobs: {},
    },
    esi: {
      industryJobs: { 1: { job_id: 1, cost: 200 } },
      marketOrders: {},
      transactions: {},
    },
  });

const show = (Panel = JobCostSummaryPanel) => render(<Panel />);

beforeEach(() => {
  session().actions.closeSession();
  openJob();
});

describe("what the completed job cost", () => {
  // 500 + 200 + 50 + 250 is 1,000 for ten items, so 100 each.
  it("adds the four costs up and divides by what was made", () => {
    show();

    expect(screen.getByText("1,000.00")).toBeInTheDocument();
    expect(screen.getByText("100.00")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("follows an extra cost being added", async () => {
    show();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts.two = { id: "two", extraValue: 500 };
        },
      });
    });

    expect(screen.getByText("1,500.00")).toBeInTheDocument();
  });

  it("is not re-rendered by a change none of its figures are over", async () => {
    const renders = renderCounts();
    show(renders.watch("summary", JobCostSummaryPanel));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "link a child job",
        recipe: (job) => {
          job.build.childJobs = { [TRITANIUM]: ["job-2"] };
        },
      });
    });

    expect(renders.of("summary")).toBe(0);
  });
});
