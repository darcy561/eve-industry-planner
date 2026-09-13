import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store, readOnly, dialogueRenders } = vi.hoisted(() => ({
  store: { current: null },
  readOnly: { current: false },
  dialogueRenders: { count: 0 },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});
vi.mock("../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: vi.fn(),
}));
vi.mock("./Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
}));

/** Counts renders, so a body that is merely hidden is not mistaken for one that
 * was never built. */
vi.mock("./parentJobOptions", () => ({
  ParentJobOptions: ({ onLinked }) => {
    dialogueRenders.count += 1;
    return <button onClick={onLinked}>Link Parent Job</button>;
  },
}));

const { LinkedJobBadge } = await import("./Linked Job Badge.jsx");

const theme = createTheme();

const actions = {
  getCurrentParentJobs: () => [],
  markParentJobForRemoval: vi.fn(),
};

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <LinkedJobBadge state={{ activeJob: {} }} actions={actions} />
    </ThemeProvider>,
  );
}

function openDialogue() {
  fireEvent.click(screen.getByTestId("AddIcon").closest("button"));
}

function dialogue() {
  return screen.queryByRole("button", { name: "Link Parent Job" });
}

beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  dialogueRenders.count = 0;
  store.current = { jobData: { actions: { findJobInJobArray: () => null } } };
});

describe("linking a parent job from the job being edited", () => {
  // The body reads every job on the planner to work out what it can offer, so
  // the shell does not build it until someone asks for the dialogue.
  it("does not build the dialogue until it is asked for", () => {
    show();

    expect(dialogue()).toBeNull();
    expect(dialogueRenders.count).toBe(0);
  });

  it("opens the dialogue when a parent job is asked for", () => {
    show();

    openDialogue();

    expect(dialogue()).toBeInTheDocument();
  });

  it("takes the dialogue away again when it is closed", () => {
    show();
    openDialogue();

    fireEvent.click(dialogue());

    expect(dialogue()).toBeNull();
  });
});
