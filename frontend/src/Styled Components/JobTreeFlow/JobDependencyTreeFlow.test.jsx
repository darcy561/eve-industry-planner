import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
const { fitView, getNode } = vi.hoisted(() => ({
  fitView: vi.fn(),
  getNode: vi.fn((id) => ({ id })),
}));

/** The viewport is xyflow's to move; what matters here is being asked. */
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal()),
  useReactFlow: () => ({ fitView, getNode }),
}));

const { default: JobDependencyTreeFlow } =
  await import("./JobDependencyTreeFlow");

const theme = createTheme();

/** A job as the tree reads it: its links, and the flags the node card shows. */
function job(jobID, name, { childJobIDs = [], parentJobIDs = [] } = {}) {
  return {
    jobID,
    name,
    itemID: 587,
    jobType: 1,
    parentJobs: parentJobIDs,
    build: { childJobs: childJobIDs.length ? { 34: [...childJobIDs] } : {} },
    esi: { industryJobs: {} },
    isReadyToStart: false,
  };
}

function show(props) {
  return render(
    <ThemeProvider theme={theme}>
      <JobDependencyTreeFlow completeJobIds={new Set()} {...props} />
    </ThemeProvider>,
  );
}

function again(props) {
  return (
    <ThemeProvider theme={theme}>
      <JobDependencyTreeFlow completeJobIds={new Set()} {...props} />
    </ThemeProvider>
  );
}

function nodeCard(name) {
  return screen.getByText(name).closest(".react-flow__node");
}

/** A chosen job is drawn standing out from the rest; its neighbours dim. */
function isEmphasised(name) {
  const card = nodeCard(name);
  return Number(window.getComputedStyle(card).opacity || "1") === 1;
}

const RIFTER = job("job-1", "Rifter", { childJobIDs: ["job-2"] });
const TRITANIUM = job("job-2", "Tritanium", { parentJobIDs: ["job-1"] });
const PYERITE = job("job-3", "Pyerite");

function settle() {
  act(() => vi.advanceTimersByTime(200));
}

function fittedJobs() {
  return fitView.mock.calls.map(([options]) => options.nodes[0].id);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the job dependency tree", () => {
  it("draws a node for every job", () => {
    show({ jobs: [RIFTER, TRITANIUM, PYERITE] });

    expect(screen.getByText("Rifter")).toBeInTheDocument();
    expect(screen.getByText("Tritanium")).toBeInTheDocument();
    expect(screen.getByText("Pyerite")).toBeInTheDocument();
  });

  it("dims the jobs unrelated to the one that was chosen", () => {
    show({ jobs: [RIFTER, TRITANIUM, PYERITE] });

    fireEvent.click(screen.getByText("Rifter"));

    expect(isEmphasised("Rifter")).toBe(true);
    expect(isEmphasised("Tritanium")).toBe(true);
    expect(isEmphasised("Pyerite")).toBe(false);
  });

  it("moves the emphasis when another job is chosen", () => {
    show({ jobs: [RIFTER, TRITANIUM, PYERITE] });
    fireEvent.click(screen.getByText("Rifter"));

    fireEvent.click(screen.getByText("Pyerite"));

    expect(isEmphasised("Pyerite")).toBe(true);
    expect(isEmphasised("Rifter")).toBe(false);
  });

  // A job can leave the tree while it is the chosen one — archived elsewhere, or
  // the tree narrowed — and a choice that is no longer there dims everything
  // else for no reason.
  it("forgets a chosen job that leaves the tree", () => {
    const { rerender } = show({ jobs: [RIFTER, TRITANIUM, PYERITE] });
    fireEvent.click(screen.getByText("Rifter"));
    expect(isEmphasised("Pyerite")).toBe(false);

    rerender(again({ jobs: [TRITANIUM, PYERITE] }));

    expect(isEmphasised("Pyerite")).toBe(true);
    expect(isEmphasised("Tritanium")).toBe(true);
  });

  it("brings the job it is asked to focus forward", () => {
    show({
      jobs: [RIFTER, TRITANIUM, PYERITE],
      focusRequest: { jobID: "job-1", at: 1 },
    });

    expect(isEmphasised("Pyerite")).toBe(false);
    expect(isEmphasised("Rifter")).toBe(true);
  });

  it("moves the view to the job it is asked to focus", () => {
    show({
      jobs: [RIFTER, TRITANIUM, PYERITE],
      focusRequest: { jobID: "job-1", at: 1 },
    });

    settle();

    expect(fittedJobs()).toEqual(["job-1"]);
  });

  // Asking for the same job twice is two requests: a reader who has panned away
  // and asks again expects to be taken back.
  it("moves the view again when the same job is asked for again", () => {
    const { rerender } = show({
      jobs: [RIFTER, TRITANIUM, PYERITE],
      focusRequest: { jobID: "job-1", at: 1 },
    });
    settle();

    rerender(
      again({
        jobs: [RIFTER, TRITANIUM, PYERITE],
        focusRequest: { jobID: "job-1", at: 2 },
      }),
    );
    settle();

    expect(fittedJobs()).toEqual(["job-1", "job-1"]);
  });

  it("ignores a request to focus a job it is not drawing", () => {
    show({
      jobs: [TRITANIUM, PYERITE],
      focusRequest: { jobID: "job-1", at: 1 },
    });

    settle();

    expect(fittedJobs()).toEqual([]);
    expect(isEmphasised("Pyerite")).toBe(true);
  });

  it("says so when there are no jobs to draw", () => {
    show({ jobs: [], emptyLabel: "Nothing linked." });

    expect(screen.getByText("Nothing linked.")).toBeInTheDocument();
  });
});
