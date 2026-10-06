import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

const parents = {};
const { readOnly, opened } = vi.hoisted(() => ({
  readOnly: { current: false },
  opened: [],
}));

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
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));
vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
}));

vi.mock("../../../../Edit Job Hooks/useOpenJob", () => ({
  useOpenJob: () => (jobID) => opened.push(jobID),
}));

const { OutputPanel } = await import("./outputPanel.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

const setup = (id, runCount, jobCount, rawTime) => ({
  id,
  runCount,
  jobCount,
  rawTime,
  jobType: 1,
  TE: 0,
  structureID: 0,
  rigID: 0,
  materialCount: {},
});

/** Five runs of two items across three slots: thirty made in all. */
const jobDocument = (rest = {}) => ({
  jobID: "job-1",
  name: "Purifier Parts",
  itemID: 34,
  itemsProducedPerRun: 2,
  parentJobs: [],
  includedInGroup: false,
  skills: {},
  layout: { setupToEdit: "setup0" },
  build: {
    materials: {},
    childJobs: {},
    setup: { setup0: setup("setup0", 5, 3, 600) },
  },
  esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  ...rest,
});

const needing = (jobID, quantity) => {
  parents[jobID] = {
    jobID,
    name: `Parent ${jobID}`,
    itemID: 1,
    build: {
      materials: { 34: { typeID: 34, quantity } },
      childJobs: { 34: ["job-1"] },
    },
  };
  return jobID;
};

const show = (document = jobDocument(), Panel = OutputPanel) => {
  session().actions.openJob(document.jobID, document);
  return render(<Panel />);
};

beforeEach(() => {
  readOnly.current = false;
  opened.length = 0;
  for (const key of Object.keys(parents)) delete parents[key];
  session().actions.closeSession();
});

describe("what the job produces", () => {
  it("leads with the output and leaves all of it free to sell", () => {
    show();

    expect(screen.getByText("This job produces")).toBeInTheDocument();
    expect(screen.getByText("All 30")).toBeInTheDocument();
    expect(screen.getByText("nothing is committed")).toBeInTheDocument();
    expect(screen.queryByText(/Owed to/)).not.toBeInTheDocument();
  });

  it("states the arithmetic once, as one line", () => {
    show();

    expect(
      screen.getByText(/2 per run × 15 runs over 1 setup =/),
    ).toBeInTheDocument();
  });

  it("states the wait as the longest setup, not the one selected", () => {
    show(
      jobDocument({
        build: {
          materials: {},
          childJobs: {},
          setup: {
            setup0: setup("setup0", 5, 3, 600),
            setup1: setup("setup1", 20, 1, 600),
          },
        },
      }),
    );

    expect(screen.getByText("Longest setup")).toBeInTheDocument();
    expect(screen.getByText(/^4 slots side by side/)).toBeInTheDocument();
    expect(screen.getByText(/3H 20M/)).toBeInTheDocument();
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

    expect(screen.getByText("All 60")).toBeInTheDocument();
  });
});

describe("a job building for the jobs above it", () => {
  it("states what its parents need whether or not it is in a group", () => {
    show(jobDocument({ parentJobs: [needing("p1", 30)] }));

    expect(screen.getByText("Owed to 1 parent")).toBeInTheDocument();
    expect(screen.getByText("covered exactly")).toBeInTheDocument();
    expect(screen.getByText("Parent p1")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("warns that a job covering its parents exactly has nothing to spare", () => {
    show(jobDocument({ parentJobs: [needing("p1", 30)] }));

    expect(
      screen.getByText("Taking runs off leaves the parents short."),
    ).toBeInTheDocument();
  });

  it("states what is owed against what is spare", () => {
    show(jobDocument({ parentJobs: [needing("p1", 20)] }));

    expect(screen.getByText("20 owed, 10 spare.")).toBeInTheDocument();
  });

  it("says how short it falls and what covers it", () => {
    show(jobDocument({ parentJobs: [needing("p1", 33)] }));

    expect(screen.getAllByText("3 short").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/30 of the 33 asked for\. 2 more runs on any setup/),
    ).toBeInTheDocument();
  });

  it("opens a parent's job from its row", () => {
    show(jobDocument({ parentJobs: [needing("p1", 30)] }));

    fireEvent.click(screen.getByRole("button", { name: "Parent p1" }));

    expect(opened).toEqual(["p1"]);
  });

  it("keeps a linked parent that does not use the item as a row, so it can be unlinked", () => {
    parents.p9 = {
      jobID: "p9",
      name: "Unrelated",
      itemID: 1,
      build: { materials: {}, childJobs: {} },
    };
    show(jobDocument({ parentJobs: ["p9"] }));

    expect(screen.getByText("uses none")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unlink Unrelated" }),
    ).toBeInTheDocument();
  });

  it("says a parent is not loaded here rather than calling it covered", () => {
    show(jobDocument({ parentJobs: [needing("p1", 30), "p-missing"] }));

    expect(screen.getByText("1 parent not loaded here")).toBeInTheDocument();
  });

  it("will not link or unlink while another session holds the job", () => {
    readOnly.current = true;
    show(jobDocument({ parentJobs: [needing("p1", 30)] }));

    expect(
      screen.getByRole("button", { name: "Link a parent" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Unlink Parent p1" }),
    ).toBeDisabled();
  });

  it("shows seven parents without folding any away", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7].map((n) => needing(`p${n}`, 1));
    show(jobDocument({ parentJobs: ids }));

    expect(screen.getAllByRole("button", { name: /^Unlink/ })).toHaveLength(7);
    expect(screen.queryByText(/Show the other/)).not.toBeInTheDocument();
  });

  it("folds past six, largest first, and counts what it folds", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => needing(`p${n}`, n));
    show(jobDocument({ parentJobs: ids }));

    const rows = screen.getAllByRole("button", { name: /^Unlink/ });
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveAccessibleName("Unlink Parent p8");

    const fold = screen.getByText(/Show the other 2 · 3 between them/);
    fireEvent.click(fold);

    expect(screen.getAllByRole("button", { name: /^Unlink/ })).toHaveLength(8);
  });
});

it("is not re-rendered by a change none of its figures are over", async () => {
  const renders = renderCounts();
  show(jobDocument(), renders.watch("output", OutputPanel));
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

  expect(renders.of("output")).toBe(0);
});
