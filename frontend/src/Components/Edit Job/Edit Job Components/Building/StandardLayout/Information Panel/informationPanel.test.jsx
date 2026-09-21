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

const { InformationPanel } = await import("./informationPanel.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

const TRITANIUM = 34;

/** A job with a material bought, a run linked, and two setups making ten each. */
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
      extrasCosts: {},
      inventionEntries: {},
      childJobs: {},
    },
    esi: {
      industryJobs: { 1: { job_id: 1, cost: 200 } },
      marketOrders: {},
      transactions: {},
    },
  });

const show = (Panel = InformationPanel) => render(<Panel />);

beforeEach(() => {
  session().actions.closeSession();
  openJob();
});

describe("what the building stage says the job has cost", () => {
  // 100 at 5 is 500 of materials, the linked run was charged 200, and ten items
  // came of it — so 70 each.
  it("totals the materials, the installs and the cost of one item", () => {
    show();

    expect(screen.getByText(/Total Material Cost: 500.00/)).toBeInTheDocument();
    expect(screen.getByText(/Total Install Costs: 200.00/)).toBeInTheDocument();
    expect(
      screen.getByText(/Estimated Cost Per Item: 70.00/),
    ).toBeInTheDocument();
  });

  it("follows a run being linked", async () => {
    show();

    await act(async () => {
      session().actions.run({
        name: "link a run",
        recipe: (job) => {
          job.esi.industryJobs[2] = { job_id: 2, cost: 300 };
        },
      });
    });

    expect(screen.getByText(/Total Install Costs: 500.00/)).toBeInTheDocument();
  });

  // None of its figures are over the links between jobs, so a child linked
  // under a material is not its business.
  it("is not re-rendered by a change none of its figures are over", async () => {
    const renders = renderCounts();
    show(renders.watch("information", InformationPanel));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "link a child job",
        recipe: (job) => {
          job.build.childJobs = { [TRITANIUM]: ["job-2"] };
        },
      });
    });

    expect(renders.of("information")).toBe(0);
  });
});
