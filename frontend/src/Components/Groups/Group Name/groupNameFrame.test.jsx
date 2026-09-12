import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { state, flushPendingGroupSave, updateModifiedGroups, canEdit } =
  vi.hoisted(() => ({
    state: { current: null },
    flushPendingGroupSave: vi.fn(),
    updateModifiedGroups: vi.fn(),
    canEdit: { current: true },
  }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(state.current));
});

vi.mock("../../../Functions/Debounce/jobGroupsPersistSchedule.js", () => ({
  flushPendingGroupSave,
}));

vi.mock("../../../Hooks/DocumentLock/useDocumentLockState", () => ({
  useActiveGroupCanEdit: () => canEdit.current,
}));

const { default: GroupNameFrame } = await import("./groupNameFrame.jsx");

const theme = createTheme();

/** The store hands the panel a group object, rebuilt whenever it is written. */
function holding(groupID, groupName) {
  const group = {
    groupID,
    groupName,
    setGroupName: vi.fn(function (name) {
      this.groupName = name;
    }),
  };
  state.current = {
    jobData: {
      actions: {
        updateModifiedGroups,
        getActiveGroupObject: () => group,
      },
    },
  };
  return group;
}

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <GroupNameFrame />
    </ThemeProvider>,
  );
}

function again() {
  return (
    <ThemeProvider theme={theme}>
      <GroupNameFrame />
    </ThemeProvider>
  );
}

/** The edit control is a disabled-capable IconButton, so its tooltip label
 * sits on the wrapping span rather than on the button itself. */
function editButton() {
  return screen.getByLabelText("Edit Group Name").querySelector("button");
}

function openEditor() {
  fireEvent.click(editButton());
}

function field() {
  return screen.getByRole("textbox");
}

function editorIsOpen() {
  return screen.queryByRole("textbox") !== null;
}

beforeEach(() => {
  vi.clearAllMocks();
  canEdit.current = true;
  holding("group-1", "Rifter Run");
});

describe("the group name panel", () => {
  it("shows the group's name", () => {
    show();

    expect(screen.getByText("Rifter Run")).toBeInTheDocument();
  });

  it("draws nothing when no group is open", () => {
    state.current = {
      jobData: {
        actions: { updateModifiedGroups, getActiveGroupObject: () => null },
      },
    };

    const { container } = show();

    expect(container).toBeEmptyDOMElement();
  });

  it("will not open the editor for a reader who cannot edit", () => {
    canEdit.current = false;
    show();

    expect(editButton()).toBeDisabled();
  });

  it("opens the editor holding the current name", () => {
    show();

    openEditor();

    expect(field()).toHaveValue("Rifter Run");
  });

  it("saves what was typed and closes", async () => {
    const group = holding("group-1", "Rifter Run");
    show();
    openEditor();

    fireEvent.change(field(), { target: { value: "Thrasher Run" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(group.setGroupName).toHaveBeenCalledWith("Thrasher Run");
    expect(updateModifiedGroups).toHaveBeenCalledWith(group);
    expect(flushPendingGroupSave).toHaveBeenCalled();
    expect(editorIsOpen()).toBe(false);
  });

  it("throws away what was typed when the edit is reverted", () => {
    const group = holding("group-1", "Rifter Run");
    show();
    openEditor();

    fireEvent.change(field(), { target: { value: "Thrasher Run" } });
    fireEvent.click(screen.getByRole("button", { name: /revert changes/i }));

    expect(group.setGroupName).not.toHaveBeenCalled();
    expect(editorIsOpen()).toBe(false);
    expect(screen.getByText("Rifter Run")).toBeInTheDocument();
  });

  it("closes the editor if the reader loses the right to edit", () => {
    const { rerender } = show();
    openEditor();
    expect(editorIsOpen()).toBe(true);

    canEdit.current = false;
    rerender(again());

    expect(editorIsOpen()).toBe(false);
  });

  it("does not reopen the editor when the right to edit returns", () => {
    const { rerender } = show();
    openEditor();

    canEdit.current = false;
    rerender(again());
    canEdit.current = true;
    rerender(again());

    expect(editorIsOpen()).toBe(false);
  });

  it("follows the name when another group is opened", () => {
    const { rerender } = show();

    holding("group-2", "Hurricane Run");
    rerender(again());

    expect(screen.getByText("Hurricane Run")).toBeInTheDocument();
    openEditor();
    expect(field()).toHaveValue("Hurricane Run");
  });

  // Someone else on a shared planner can rename the group while this reader is
  // looking at it, so the editor has to open on the name shown, not on the one
  // that was there when the panel first drew.
  it("opens on the name a rename elsewhere left behind", () => {
    const { rerender } = show();

    holding("group-1", "Renamed Elsewhere");
    rerender(again());

    openEditor();

    expect(field()).toHaveValue("Renamed Elsewhere");
  });

  // The same rename arriving mid-edit must not take the keyboard off the
  // reader: what they have typed is theirs until they save or revert.
  it("keeps what the reader is typing when the group is written again", () => {
    const { rerender } = show();
    openEditor();
    fireEvent.change(field(), { target: { value: "Half typed" } });

    holding("group-1", "Renamed Elsewhere");
    rerender(again());

    expect(field()).toHaveValue("Half typed");
  });
});
