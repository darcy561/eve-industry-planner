import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../../../tests/routerHarness";

const { locked } = vi.hoisted(() => ({ locked: { current: false } }));

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      jobData: {
        multiSelect: [],
        actions: { addToMultiSelect: vi.fn(), removeFromMultiSelect: vi.fn() },
      },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  );
});

vi.mock("../../../../Hooks/DocumentLock/useDocumentLockState", () => ({
  useGroupLockReadOnly: () => locked.current,
}));

vi.mock("../../Hooks/useDnD", () => ({
  plannerDragPassThroughSx: () => ({}),
  usePlannerGroupCardDrag: () => ({
    setNodeRef: () => {},
    attributes: {},
    listeners: {},
    isDragging: false,
    style: {},
  }),
}));

const { ClassicGroupJobCard } = await import("./ClassicGroupJobCard.jsx");

const group = {
  groupID: "group-3",
  groupName: "Frigates",
  groupStatus: 0,
  includedJobIDs: [],
  includedTypeIDs: [],
  areComplete: new Set(),
};

beforeEach(() => {
  locked.current = false;
});

describe("a classic group card", () => {
  it("opens the group as a link a reader can take to another tab", async () => {
    await renderWithRouter(<ClassicGroupJobCard group={group} />);

    const link = screen.getByRole("link", { name: "View" });
    expect(link).toHaveAttribute("href", "/group/group-3");
    expect(link).toHaveAttribute("draggable", "false");
  });
});
