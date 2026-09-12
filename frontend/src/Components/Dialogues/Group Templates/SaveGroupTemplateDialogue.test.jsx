import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const {
  store,
  getActiveGroupObject,
  getGroupObject,
  postGroupTemplate,
  patchGroupTemplate,
  deleteGroupTemplate,
  fetchTemplateCatalogSummaries,
  serialiseGroupToTemplatePayload,
  showSnackbarError,
  showSnackbarSuccess,
} = vi.hoisted(() => ({
  store: { current: null },
  getActiveGroupObject: vi.fn(),
  getGroupObject: vi.fn(),
  postGroupTemplate: vi.fn(),
  patchGroupTemplate: vi.fn(),
  deleteGroupTemplate: vi.fn(),
  fetchTemplateCatalogSummaries: vi.fn(async () => []),
  serialiseGroupToTemplatePayload: vi.fn(() => ({
    name: "payload name",
    description: "",
    payload: {},
  })),
  showSnackbarError: vi.fn(),
  showSnackbarSuccess: vi.fn(),
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../../Functions/Endpoints/Private/groupTemplates", () => ({
  postGroupTemplate,
  patchGroupTemplate,
  deleteGroupTemplate,
  fetchTemplateCatalogSummaries,
}));

vi.mock(
  "../../../Functions/GroupTemplates/serialiseGroupToTemplatePayload",
  () => ({ serialiseGroupToTemplatePayload }),
);

vi.mock("../../../Events/snackbarEvents", () => ({
  showSnackbarError,
  showSnackbarSuccess,
}));

vi.mock("../../../analytics/trackAppEvent", () => ({ trackAppEvent: vi.fn() }));

const { default: SaveGroupTemplateDialogue } =
  await import("./SaveGroupTemplateDialogue.jsx");
const { openGroupTemplatesSaveDialogue } =
  await import("../../../Events/groupTemplatesDialogueEvents");

const theme = createTheme();

/** A group holding the jobs a template would be built from. */
function group(groupID, ...jobIDs) {
  return { groupID, groupName: groupID, includedJobIDs: new Set(jobIDs) };
}

function planner({ groups = [], jobs = [], active = null } = {}) {
  getActiveGroupObject.mockReturnValue(active);
  getGroupObject.mockImplementation(
    (id) => groups.find((g) => g.groupID === id) ?? null,
  );
  store.current = {
    jobData: {
      groupArray: groups,
      jobArray: jobs,
      actions: { getGroupObject, getActiveGroupObject },
    },
  };
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <SaveGroupTemplateDialogue />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function openIt(payload) {
  act(() => openGroupTemplatesSaveDialogue(payload));
}

function nameField() {
  return screen.getByLabelText("Name");
}

function press(name) {
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const jobs = [{ jobID: "job-1", name: "Rifter" }];
  planner({
    groups: [group("g-1", "job-1")],
    jobs,
    active: group("g-1", "job-1"),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saving a group as a template", () => {
  // The dialogue reads the whole planner to work out what it would save, so it
  // is not built until a reader asks for it.
  it("does not look at the group until it is opened", () => {
    const { container } = show();

    expect(container).toBeEmptyDOMElement();
    expect(getActiveGroupObject).not.toHaveBeenCalled();
  });

  it("opens on the event", () => {
    show();

    openIt();

    expect(screen.getByText("Save group as template")).toBeInTheDocument();
  });

  it("saves the group's jobs under the name that was typed", async () => {
    show();
    openIt();

    fireEvent.change(nameField(), { target: { value: "Frigate line" } });
    await act(async () => press("Save as new"));

    expect(serialiseGroupToTemplatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        groupID: "g-1",
        name: "Frigate line",
        jobs: [expect.objectContaining({ jobID: "job-1" })],
      }),
    );
    expect(postGroupTemplate).toHaveBeenCalled();
  });

  it("refuses to save a group with no jobs in it", async () => {
    planner({ groups: [group("g-2")], jobs: [], active: group("g-2") });
    show();
    openIt();

    await act(async () => press("Save as new"));

    expect(postGroupTemplate).not.toHaveBeenCalled();
    expect(showSnackbarError).toHaveBeenCalled();
  });

  it("saves the group the event names rather than the open one", async () => {
    planner({
      groups: [group("g-1", "job-1"), group("g-9", "job-1")],
      jobs: [{ jobID: "job-1", name: "Rifter" }],
      active: group("g-1", "job-1"),
    });
    show();

    openIt({ contextGroupId: "g-9" });
    await act(async () => press("Save as new"));

    expect(serialiseGroupToTemplatePayload).toHaveBeenCalledWith(
      expect.objectContaining({ groupID: "g-9" }),
    );
  });

  it("offers nothing to replace or delete until a template is chosen", () => {
    show();
    openIt();

    expect(
      screen.getByRole("button", { name: "Replace existing" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Delete existing" }),
    ).toBeDisabled();
  });

  it("forgets what was typed once it is closed", async () => {
    show();
    openIt();
    fireEvent.change(nameField(), { target: { value: "Frigate line" } });

    press("Cancel");
    openIt();

    expect(nameField()).toHaveValue("");
  });
});
