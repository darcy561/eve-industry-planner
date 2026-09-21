import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  recordIntersectionObservers,
  observerWatching,
} from "../../tests/intersectionObservers.js";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ jobID: "job-1" }),
}));
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});
vi.mock("../../Hooks/useJobStatuses", () => ({
  useJobStatuses: () => ({
    jobStatuses: [
      { id: 0, name: "Planning" },
      { id: 1, name: "Building" },
      { id: 2, name: "Selling" },
    ],
  }),
}));
vi.mock("../../Hooks/GeneralHooks/useWarnBeforeUnload", () => ({
  default: () => {},
}));
vi.mock(
  "../../Hooks/Planner/useStripRedundantJobMarketHubOverrides.js",
  () => ({
    useStripRedundantJobMarketHubOverrides: () => {},
  }),
);
vi.mock("./Hooks/useRefreshLinkedESIData", () => ({
  useRefreshLinkedESIData: () => {},
}));
vi.mock("./Edit Job Hooks/useEditJobDocumentLocks", () => ({
  useEditJobDocumentLocks: () => {},
}));
vi.mock("./Edit Job Hooks/useEditJobInitialState", () => ({
  useEditJobInitialState: () => {},
}));
vi.mock("./Edit Job Hooks/useEditJobLeaveConfirm", () => ({
  useEditJobLeaveConfirm: () => ({ leaveConfirmDialogueProps: {} }),
}));

const nothing = () => null;
vi.mock("./closeIcon", () => ({ CloseJobIcon: nothing }));
vi.mock("./saveIcon", () => ({ SaveJobIcon: nothing }));
vi.mock("./deleteIcon", () => ({ DeleteJobIcon: nothing }));
vi.mock("./Linked Job Badge", () => ({ LinkedJobBadge: nothing }));
vi.mock("./StepErrorBoundary", () => ({ default: ({ children }) => children }));
vi.mock("./EditJobStepContentSelector", () => ({ default: nothing }));
vi.mock("./EditJobLeaveConfirmDialogue", () => ({ default: nothing }));
vi.mock("../Dialogues/Shopping List/ShoppingList", () => ({
  ShoppingListDialogue: nothing,
}));
vi.mock("../Dialogues/Price History/dialogueFrame", () => ({
  default: nothing,
}));
vi.mock("../Dialogues/Market Data/dialogueFrame", () => ({ default: nothing }));
vi.mock("../Dialogues/Assets/dialogueFrame", () => ({ default: nothing }));

const { default: EditJob } = await import("./editJob.jsx");
const { default: useUsersStore } = await import("../../Zustand/usersStore");
const { jobDraftNow } = await import("./Edit Job Hooks/useJobDraft");

const theme = createTheme();
const session = () => useUsersStore.getState().editSession;
let observers = [];

/** Opens a job sitting on one of the three steps. */
function onStep(jobStatus) {
  session().actions.closeSession();
  session().actions.openJob("job-1", {
    jobID: "job-1",
    name: "Rifter",
    itemID: 587,
    jobStatus,
    parentJobs: [],
    layout: { setupToEdit: null },
    build: { materials: {}, childJobs: {}, setup: {} },
    esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  });
}

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <EditJob />
    </ThemeProvider>,
  );
}

function again() {
  return (
    <ThemeProvider theme={theme}>
      <EditJob />
    </ThemeProvider>
  );
}

/** The step's own buttons sit inside the stepper; the floating stand-ins do not. */
function inlineButton(name) {
  return screen
    .getAllByLabelText(name)
    .find((element) => element.closest(".MuiStepper-root"));
}

function floatingButton(name) {
  const standIn = screen
    .queryAllByLabelText(name)
    .find((element) => !element.closest(".MuiStepper-root"));
  return standIn?.querySelector("button") ?? standIn ?? null;
}

function anchorOf(name) {
  return inlineButton(name).closest(".MuiGrid-root");
}

function scrollOutOfView(name) {
  observerWatching(observers, anchorOf(name)).report(false);
}

function scrollIntoView(name) {
  observerWatching(observers, anchorOf(name)).report(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  observers = recordIntersectionObservers();
  onStep(1);
});

describe("the edit job page's floating step buttons", () => {
  it("shows neither while the step's own buttons are on screen", () => {
    show();

    expect(floatingButton(/move to previous step/i)).toBeNull();
    expect(floatingButton(/move to next step/i)).toBeNull();
  });

  it("floats a previous-step button once the step's own scrolls away", () => {
    show();

    scrollOutOfView(/move to previous step/i);

    expect(floatingButton(/move to previous step/i)).toBeInTheDocument();
  });

  it("floats a next-step button once the step's own scrolls away", () => {
    show();

    scrollOutOfView(/move to next step/i);

    expect(floatingButton(/move to next step/i)).toBeInTheDocument();
  });

  it("takes the floating button away when the step's own comes back", () => {
    show();
    scrollOutOfView(/move to next step/i);

    scrollIntoView(/move to next step/i);

    expect(floatingButton(/move to next step/i)).toBeNull();
  });

  it("moves the job on when the floating button is used", () => {
    show();
    scrollOutOfView(/move to next step/i);

    fireEvent.click(floatingButton(/move to next step/i));

    // The step moved on the draft, and the job as the server last stated it is
    // left where it was until the reader saves.
    expect(jobDraftNow().jobStatus).toBe(2);
  });

  it("offers no way back from the first step", () => {
    onStep(0);
    show();

    expect(screen.queryAllByLabelText(/move to previous step/i)).toHaveLength(
      0,
    );
  });

  it("offers no way on from the last step", () => {
    onStep(2);
    show();

    expect(screen.queryAllByLabelText(/move to next step/i)).toHaveLength(0);
  });

  // Both floating buttons hang on their step button still being a thing to
  // scroll to: a job that moves to the first step has nothing to go back to,
  // so the floating way back must go with it.
  it("drops the floating way back when the job moves to the first step", () => {
    const { rerender } = show();
    scrollOutOfView(/move to previous step/i);

    onStep(0);
    rerender(again());

    expect(screen.queryAllByLabelText(/move to previous step/i)).toHaveLength(
      0,
    );
  });
});
