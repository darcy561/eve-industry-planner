import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store, navigated, job } = vi.hoisted(() => ({
  store: { current: null },
  navigated: [],
  job: { current: null },
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ jobID: "job-1" }),
  useNavigate: () => (to) => navigated.push(to),
  useSearch: () => ({}),
}));
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  QueryClient: class {},
}));
vi.mock("../../Hooks/useJobStatuses", () => ({
  useJobStatuses: () => ({
    jobStatuses: [
      { id: 0, name: "Planning" },
      { id: 1, name: "Building" },
      { id: 2, name: "Selling" },
    ],
  }),
}));
vi.mock("../../Functions/Helper/getAllRelatedJobs", () => ({
  loadAllRelatedJobs: async () => [],
}));
vi.mock("../../Functions/Shared/getMissingESIData", () => ({
  default: async () => ({ requestedSystemIndexes: [] }),
}));
vi.mock("../../Hooks/React Query/Backend/statisticsTotals", () => ({
  prefetchAccountTotalsQuery: async () => {},
}));
vi.mock("../../Hooks/GeneralHooks/useWarnBeforeUnload", () => ({
  default: () => {},
}));
vi.mock(
  "../../Hooks/Planner/useStripRedundantJobMarketHubOverrides.js",
  () => ({ useStripRedundantJobMarketHubOverrides: () => {} }),
);
vi.mock("./Hooks/useRefreshLinkedESIData", () => ({
  useRefreshLinkedESIData: () => {},
}));
vi.mock("./Edit Job Hooks/useEditJobDocumentLocks", () => ({
  useEditJobDocumentLocks: () => {},
}));
vi.mock("./Edit Job Hooks/useEditJobLeaveConfirm", () => ({
  useEditJobLeaveConfirm: () => ({ leaveConfirmDialogueProps: {} }),
}));

const nothing = () => null;
vi.mock("./saveIcon", () => ({ SaveJobIcon: nothing }));
vi.mock("./deleteIcon", () => ({ DeleteJobIcon: nothing }));
vi.mock("./closeIcon", () => ({ CloseJobIcon: nothing }));
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

const theme = createTheme();

beforeEach(() => {
  navigated.length = 0;
  job.current = {
    jobID: "job-1",
    name: "Rifter",
    itemID: 587,
    jobType: 1,
    jobStatus: 1,
    build: { setup: { "setup-1": { id: "setup-1" } }, materials: [] },
    layout: {},
  };
  store.current = {
    jobData: {
      actions: {
        setActiveJobID: () => {},
        findJobInJobArray: () => job.current,
      },
    },
    worldData: { actions: { addSystemIndex: () => {} } },
    applicationSettings: {
      actions: { getCustomStructureWithID: () => null },
    },
  };
  useUsersStore.getState().editSession.actions.closeSession();
});

const show = () =>
  render(
    <ThemeProvider theme={theme}>
      <EditJob />
    </ThemeProvider>,
  );

// The page, its loading gate, the hook that opens the job and the session it is
// opened into, all running together. Every other test of this page stands one of
// those in, so nothing else would notice the four disagreeing about what an open
// job looks like.
describe("opening the edit job page", () => {
  it("loads a job and draws it", async () => {
    show();

    expect(await screen.findByText("Rifter")).toBeInTheDocument();
    expect(screen.getByText("Building")).toBeInTheDocument();
  });

  it("moves the job on when the reader presses the step button", async () => {
    show();
    await screen.findByText("Rifter");

    fireEvent.click(screen.getAllByLabelText(/move to next step/i)[0]);

    await waitFor(() =>
      expect(
        useUsersStore.getState().editSession.draft.log.map((e) => e.command),
      ).toEqual(["move to the next stage"]),
    );
  });

  it("jumps to a stage the reader picks off the stepper", async () => {
    show();
    await screen.findByText("Rifter");

    fireEvent.click(screen.getByText("Planning"));

    await waitFor(() =>
      expect(
        useUsersStore.getState().editSession.draft.log.map((e) => e.command),
      ).toEqual(["move to another stage"]),
    );
  });
});
