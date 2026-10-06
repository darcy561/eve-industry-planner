import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { opened, commitment, parentIDs } = vi.hoisted(() => ({
  opened: [],
  commitment: { current: null },
  parentIDs: { current: [] },
}));

vi.mock("../../Hooks/Planner/useJobCommitment", () => ({
  useJobCommitment: () => commitment.current,
}));
vi.mock("./Edit Job Hooks/useJobDraft", () => ({
  useParentJobIDs: () => parentIDs.current,
  useJobDraft: (select) => select({ build: { setup: { a: {}, b: {} } } }),
}));
vi.mock("./Edit Job Hooks/useOpenJob", () => ({
  useOpenJob: () => (jobID) => opened.push(jobID),
}));

const { default: JobPurposeLine, jobCoverage } =
  await import("./jobPurposeLine");

const parent = (jobID, name) => ({ jobID, name, needs: 1, short: 0 });
const owing = (overrides) => ({
  hasParents: true,
  outstanding: 1430,
  committed: 1429,
  surplus: 0,
  shortfall: 1,
  parents: [parent("p1", "Purifier")],
  ...overrides,
});

beforeEach(() => {
  opened.length = 0;
});

describe("whether the job covers its parents", () => {
  it("says how short it falls", () => {
    expect(jobCoverage(owing(), 1)).toBe("1 short");
  });

  it("says when the parents are met exactly, or what is spare", () => {
    expect(jobCoverage(owing({ shortfall: 0 }), 1)).toBe("covered exactly");
    expect(jobCoverage(owing({ shortfall: 0, surplus: 70 }), 1)).toBe(
      "covered, 70 spare",
    );
  });

  it("says what there is to sell when nothing is owed", () => {
    expect(jobCoverage(owing({ surplus: 2640 }), 0)).toBe("2,640 to sell");
  });

  it("says so when some parents are not loaded here, rather than calling them covered", () => {
    expect(jobCoverage(owing({ shortfall: 0 }), 3)).toBe(
      "2 parents not loaded here",
    );
  });
});

describe("the line under the job's name", () => {
  it("counts the parents and names each, opening it when pressed", () => {
    commitment.current = owing({
      parents: [parent("p1", "Golem"), parent("p2", "Widow")],
      shortfall: 0,
      committed: 55125,
    });
    parentIDs.current = ["p1", "p2"];

    render(<JobPurposeLine />);

    expect(screen.getByText(/55,125 for 2 parents/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Widow" }));
    expect(opened).toEqual(["p2"]);
  });

  it("names three parents and counts the rest", () => {
    commitment.current = owing({
      parents: ["a", "b", "c", "d", "e"].map((id) => parent(id, `Job ${id}`)),
    });
    parentIDs.current = ["a", "b", "c", "d", "e"];

    render(<JobPurposeLine />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText(/\+2 more/)).toBeInTheDocument();
  });

  it("states what is for sale and the setups when there are no parents", () => {
    commitment.current = owing({
      hasParents: false,
      surplus: 2640,
      parents: [],
    });
    parentIDs.current = [];

    render(<JobPurposeLine />);

    expect(screen.getByText("2,640 to sell · 2 setups")).toBeInTheDocument();
  });
});
