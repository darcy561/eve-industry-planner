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
        activeGroupID: "group-2",
        actions: {
          addToMultiSelect: vi.fn(),
          removeFromMultiSelect: vi.fn(),
          getActiveGroupObject: () => ({ areComplete: new Set() }),
        },
      },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  );
});

vi.mock("../../../../Hooks/DocumentLock/useDocumentLockState", () => ({
  useJobCardLockState: () => locked.current,
}));

vi.mock("../../../Job Planner/Hooks/useDnD", () => ({
  plannerDragPassThroughSx: () => ({}),
  usePlannerJobCardDrag: () => ({
    setNodeRef: () => {},
    attributes: {},
    listeners: {},
    isDragging: false,
    style: {},
  }),
}));

vi.mock("./JobCards/groupStep1", () => ({ default: () => null }));
vi.mock("./JobCards/groupStep2", () => ({ default: () => null }));
vi.mock("./JobCards/groupStep3", () => ({ default: () => null }));
vi.mock("./JobCards/groupStep4", () => ({ default: () => null }));
vi.mock("./JobCards/groupStep5", () => ({ default: () => null }));

const { ClassicGroupJobCardFrame } =
  await import("./ClassicGroupJobCardFrame.jsx");

const job = {
  jobID: "job-2",
  itemID: 587,
  name: "Rifter",
  jobStatus: 0,
  jobType: 1,
};

function showCard(editReturnPageView) {
  return renderWithRouter(
    <ClassicGroupJobCardFrame
      job={job}
      highlightedItems={new Set()}
      editReturnPageView={editReturnPageView}
    />,
  );
}

beforeEach(() => {
  locked.current = { cardLocked: false, reason: "" };
});

describe("a classic grouped job card", () => {
  it("opens the job as a link carrying the group it was reached from", async () => {
    await showCard();

    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/editjob/job-2?activeGroup=group-2",
    );
  });

  // The reader came from a particular view of the group and should land back in
  // it, so the view rides along in the link.
  it("carries the view the reader should come back to", async () => {
    await showCard("outputs");

    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/editjob/job-2?activeGroup=group-2&pageView=outputs",
    );
  });
});
