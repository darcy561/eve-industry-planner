import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import {
  archiveStoreState,
  renderWithProviders,
  usersStoreMock,
} from "../../../tests/archiveHarness.jsx";

const getAccountTimeline = vi.fn();

vi.mock("../../Functions/Endpoints/Private/statisticsTimeline.js", () => ({
  getAccountTimeline: (...args) => getAccountTimeline(...args),
  getAccountTimelineItems: vi.fn(),
}));
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, archiveStoreState } = await import(
    "../../../tests/archiveHarness.jsx"
  );
  return usersStoreMock(archiveStoreState());
});

const { RecalculationNotice } = await import("./RecalculationNotice.jsx");

beforeEach(() => {
  getAccountTimeline.mockReset();
});

describe("the recalculation notice", () => {
  it("says nothing for a state it does not recognise", async () => {
    getAccountTimeline.mockResolvedValue({ months: [], recalculation: "queued" });
    renderWithProviders(<RecalculationNotice />);

    // A value this side has no wording for must render nothing rather than an
    // empty alert, which would read as a fault with no explanation.
    await vi.waitFor(() =>
      expect(getAccountTimeline).toHaveBeenCalled(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says nothing while the figures have not arrived", () => {
    getAccountTimeline.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<RecalculationNotice />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
