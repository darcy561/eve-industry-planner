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

vi.mock("./Job Cards/step1", () => ({ default: () => null }));
vi.mock("./Job Cards/step2", () => ({ default: () => null }));
vi.mock("./Job Cards/step3", () => ({ default: () => null }));
vi.mock("./Job Cards/step4", () => ({ default: () => null }));
vi.mock("./Job Cards/step5", () => ({ default: () => null }));

const { JobCardFrame } = await import("./ClassicJobCardFrame.jsx");

const job = {
  jobID: "job-4",
  itemID: 587,
  name: "Rifter",
  jobStatus: 0,
  jobType: 1,
};

function showCard() {
  return renderWithRouter(<JobCardFrame job={job} />);
}

beforeEach(() => {
  locked.current = { cardLocked: false, reason: "" };
});

describe("a classic job card", () => {
  it("opens the job as a link a reader can take to another tab", async () => {
    await showCard();

    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/editjob/job-4",
    );
  });

  // The card is a dnd-kit drag source and an anchor drags natively, which would
  // hand the browser a link drag in place of the card's own.
  it("does not let the browser drag the link out of the card", async () => {
    await showCard();

    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "draggable",
      "false",
    );
  });

  // Locked, the control reads "View" and the tooltip's reason becomes its
  // accessible name, so the link is found by what it says rather than by name.
  it("still reaches the job when someone else holds it", async () => {
    locked.current = { cardLocked: true, reason: "Held by another session" };

    await showCard();

    expect(screen.getByText("View").closest("a")).toHaveAttribute(
      "href",
      "/editjob/job-4",
    );
  });
});
