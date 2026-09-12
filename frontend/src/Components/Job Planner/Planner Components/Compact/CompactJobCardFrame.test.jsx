import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../../../tests/routerHarness";

const { locked } = vi.hoisted(() => ({
  locked: { current: { cardLocked: false, reason: "" } },
}));

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
  useJobCardLockState: () => locked.current,
}));

vi.mock("../../Hooks/useDnD", () => ({
  plannerDragPassThroughSx: () => ({}),
  usePlannerJobCardDrag: () => ({
    setNodeRef: () => {},
    attributes: {},
    listeners: {},
    isDragging: false,
    style: {},
  }),
}));

vi.mock("./tooltipContent", () => ({ default: () => "" }));

const { CompactJobCardFrame } = await import("./CompactJobCardFrame.jsx");

const job = {
  jobID: "job-7",
  itemID: 587,
  name: "Rifter",
  jobStatus: 0,
  jobType: 1,
};

beforeEach(() => {
  locked.current = { cardLocked: false, reason: "" };
});

describe("a compact job card", () => {
  it("opens the job as a link a reader can take to another tab", async () => {
    await renderWithRouter(<CompactJobCardFrame job={job} />);

    const link = screen.getByRole("link", { name: "Edit" });
    expect(link).toHaveAttribute("href", "/editjob/job-7");
    expect(link).toHaveAttribute("draggable", "false");
  });
});
