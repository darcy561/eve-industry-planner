import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store, trackAppEvent } = vi.hoisted(() => ({
  store: { current: null },
  trackAppEvent: vi.fn(),
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

vi.mock("../../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: vi.fn(),
}));

vi.mock("../../../analytics/trackAppEvent", () => ({ trackAppEvent }));

/** The tree itself is tested beside itself; here it only has to name its jobs. */
vi.mock("../../../Styled Components/JobTreeFlow/JobDependencyTreeFlow", () => ({
  default: ({ jobs }) => <p>tree of {jobs.map((j) => j.name).join(", ")}</p>,
}));

const { default: JobDependencyTreeDialogue } =
  await import("./JobDependencyTreeDialogue.jsx");
const { openJobDependencyTreeDialogue, closeJobDependencyTreeDialogue } =
  await import("../../../Events/jobDependencyTreeDialogueEvents");
const { AppEvent } = await import("../../../analytics/appEventNames");

const theme = createTheme();

function job(jobID, name) {
  return {
    jobID,
    name,
    itemID: 587,
    jobType: 1,
    childJobIDs: [],
    parentJobIDs: [],
  };
}

function planner(...jobs) {
  store.current = {
    jobData: { jobArray: jobs, actions: { getGroupObject: () => null } },
  };
}

function again() {
  return (
    <ThemeProvider theme={theme}>
      <JobDependencyTreeDialogue />
    </ThemeProvider>
  );
}

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <JobDependencyTreeDialogue />
    </ThemeProvider>,
  );
}

function openIt(payload) {
  act(() => openJobDependencyTreeDialogue(payload));
}

function viewsRecorded() {
  return trackAppEvent.mock.calls.filter(
    ([event]) => event === AppEvent.VIEW_JOB_TREE_DIALOGUE,
  ).length;
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  planner(job("job-1", "Rifter"), job("job-2", "Tritanium"));
});

describe("the job dependency tree dialogue", () => {
  it("draws nothing until it is opened", () => {
    const { container } = show();

    expect(container).toBeEmptyDOMElement();
    expect(viewsRecorded()).toBe(0);
  });

  it("shows the jobs it was opened for", () => {
    show();

    openIt({ jobIds: ["job-1", "job-2"] });

    expect(screen.getByText(/tree of Rifter, Tritanium/)).toBeInTheDocument();
  });

  // The opening is recorded once, however many times the dialogue redraws
  // while it is up.
  it("records the view once for an opening", () => {
    const { rerender } = show();
    openIt({ jobIds: ["job-1"] });

    planner(job("job-1", "Rifter"), job("job-3", "Pyerite"));
    rerender(again());
    rerender(again());

    expect(viewsRecorded()).toBe(1);
  });

  // An opening is identified by the moment it happened, so two that land in the
  // same millisecond are one opening as far as the report is concerned.
  it("does not record the same opening twice", () => {
    vi.useFakeTimers();
    show();

    openIt({ jobIds: ["job-1"] });
    openIt({ jobIds: ["job-2"] });

    expect(viewsRecorded()).toBe(1);
  });

  // Closing leaves the opening's id behind, and a caller can name the id it
  // opens with, so the same one can arrive twice. It is still one view.
  it("does not record a reopening on the same opening id", () => {
    show();
    openIt({ jobIds: ["job-1"], interactionResetKey: 42 });
    act(() => closeJobDependencyTreeDialogue());

    openIt({ jobIds: ["job-1"], interactionResetKey: 42 });

    expect(viewsRecorded()).toBe(1);
  });

  it("records the view again the next time it is opened", () => {
    vi.useFakeTimers();
    show();
    openIt({ jobIds: ["job-1"] });

    // The opening is identified by its timestamp, so the second has to land in
    // a different millisecond from the first.
    vi.advanceTimersByTime(5);
    openIt({ jobIds: ["job-2"] });

    expect(viewsRecorded()).toBe(2);
  });
});
