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

  // AvatarGroup rings each of its children, and this card has always drawn its stack without one.
  // The rule is a two-class selector, so an `sx` override loses to it and only the inline style
  // wins — a distinction nothing but a rendered card would catch.
  it("stacks the group's items without the ring AvatarGroup would draw", async () => {
    await renderWithRouter(
      <ClassicGroupJobCard
        group={{ ...group, includedTypeIDs: new Set([34, 35]) }}
      />,
    );

    const avatars = document.querySelectorAll(
      ".MuiAvatarGroup-root .MuiAvatar-root",
    );
    expect(avatars).toHaveLength(2);
    for (const avatar of avatars) {
      expect(getComputedStyle(avatar).borderStyle).toBe("none");
    }
  });
});
