import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ jobID: "job-1" }),
  useSearch: () => ({}),
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
      { id: 2, name: "Ready For Market" },
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
vi.mock("./closeJobButton", () => ({ CloseJobButton: nothing }));
vi.mock("./saveJobButton", () => ({ SaveJobButton: nothing }));
vi.mock("./deleteJobButton", () => ({ DeleteJobButton: nothing }));
vi.mock("./jobPurposeLine", () => ({ default: nothing }));
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

function open(jobStatus, rest = {}) {
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
    ...rest,
  });
  return render(
    <ThemeProvider theme={theme}>
      <EditJob />
    </ThemeProvider>,
  );
}

const tab = (name) => screen.getByRole("tab", { name: new RegExp(name) });

beforeEach(() => {
  session().actions.closeSession();
});

describe("the stages, as tabs", () => {
  it("labels each tab with the stage's own name and marks the one open", () => {
    open(1);

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Planning",
      "Building",
      "Ready For Market",
    ]);
    expect(tab("Building")).toHaveAttribute("aria-selected", "true");
  });

  it("moves the job to the stage a tab names", () => {
    open(0);

    fireEvent.click(tab("Ready For Market"));

    expect(jobDraftNow().jobStatus).toBe(2);
  });

  it("will not open a shut final stage, and says why for a job with parents", async () => {
    open(1, { includedInGroup: true, parentJobs: ["parent-1"] });

    fireEvent.click(tab("Ready For Market"));
    expect(jobDraftNow().jobStatus).toBe(1);

    fireEvent.mouseOver(screen.getByText("Ready For Market"));
    expect(
      await screen.findByText(/committed to its 1 parent job,/),
    ).toBeInTheDocument();
  });

  it("gives the shut tab its reason as a description a screen reader announces", () => {
    open(1, { includedInGroup: true, parentJobs: ["parent-1"] });

    expect(tab("Ready For Market")).toHaveAccessibleDescription(
      /committed to its 1 parent job,/,
    );
  });

  it("draws no lock on the final stage when it is the one open", () => {
    open(2, { includedInGroup: true });

    expect(screen.queryByTitle("Locked")).toBeNull();
  });

  it("names the stage that opens the final one for a grouped job without parents", async () => {
    open(0, { includedInGroup: true });

    fireEvent.mouseOver(screen.getByText("Ready For Market"));
    expect(
      await screen.findByText(/marked ready for sale on Building/),
    ).toBeInTheDocument();
  });
});

describe("moving on and back", () => {
  it("names where each control goes", () => {
    open(1);

    expect(
      screen.getByRole("button", { name: "Back to Planning" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to Ready For Market" }),
    ).toBeInTheDocument();
  });

  it("offers no way back from the first stage and no way on from the last", () => {
    const { unmount } = open(0);
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    unmount();

    open(2);
    expect(screen.queryByRole("button", { name: /^Continue to/ })).toBeNull();
  });

  it("moves the job on", () => {
    open(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue to Building" }),
    );

    expect(jobDraftNow().jobStatus).toBe(1);
  });

  it("will not continue into a shut final stage", () => {
    open(1, { includedInGroup: true });

    expect(
      screen.getByRole("button", { name: "Continue to Ready For Market" }),
    ).toBeDisabled();
  });
});
