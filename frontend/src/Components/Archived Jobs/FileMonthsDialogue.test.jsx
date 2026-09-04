import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../../../tests/archiveHarness.jsx";

/**
 * Choosing the months a job counts in.
 *
 * The rule the dialogue has to carry is that costs are always the user's to file
 * and market income never is, and that it says which rather than silently
 * dropping half the request.
 */

const fileArchivedJobMonths = vi.fn();

vi.mock("../../Functions/Endpoints/Private/archivedJobsList", () => ({
  fileArchivedJobMonths: (...args) => fileArchivedJobMonths(...args),
}));

const { FileMonthsDialogue } = await import("./FileMonthsDialogue.jsx");

const HAND_ENTERED = {
  scope: "job",
  id: "job-1",
  name: "Rifter",
  jobCount: 1,
  costMonth: "2026-08",
  salesMonth: "2026-07",
  salesFromMarket: false,
};

const GROUP = {
  scope: "group",
  id: "group-1",
  name: "Drone run",
  jobCount: 4,
  costMonth: "2026-08",
  salesMonth: "2026-07",
  salesFromMarket: false,
};

function open(target = HAND_ENTERED, handlers = {}) {
  return renderWithTheme(
    <FileMonthsDialogue
      target={target}
      onClose={handlers.onClose ?? vi.fn()}
      onFiled={handlers.onFiled ?? vi.fn()}
    />,
  );
}

// A picker's field is a group of sections rather than one text input, so its
// value is read off the group and its state off the sections inside it.
function field(name) {
  return screen.getByRole("group", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  fileArchivedJobMonths.mockResolvedValue({ monthsFiled: true });
});

describe("filing a job's months", () => {
  // Both sides open on where the figures count today: a blank field would read
  // as "no month", which is a different request from "leave it as it is".
  it("opens on the months the figures currently count in", () => {
    open();

    expect(field("Costs count in")).toHaveTextContent("2026-08");
    expect(field("Sales count in")).toHaveTextContent("2026-07");
  });

  it("sends the months on screen, so saving unchanged changes nothing", async () => {
    const onFiled = vi.fn();
    open(HAND_ENTERED, { onFiled });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fileArchivedJobMonths).toHaveBeenCalledWith("job", "job-1", {
        costMonth: "2026-08",
        salesMonth: "2026-07",
      }),
    );
    expect(onFiled).toHaveBeenCalled();
  });

  // The money arrived when it arrived, and the reason is on screen rather than
  // left for the reader to discover by trying.
  it("locks the sales month for a job the market recorded", () => {
    open({ ...HAND_ENTERED, salesFromMarket: true });

    // Nothing to open and nothing to clear: the month is not the user's.
    expect(screen.getAllByRole("button", { name: /choose date/i })[1]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Clear" })[1]).toBeDisabled();
    expect(screen.getByText(/came from the market/i)).toBeInTheDocument();
  });

  it("does not send a sales month it was not allowed to change", async () => {
    open({ ...HAND_ENTERED, salesFromMarket: true });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fileArchivedJobMonths).toHaveBeenCalledWith("job", "job-1", {
        costMonth: "2026-08",
      }),
    );
  });

  // Clearing is how a filing is undone: the server derives the month again.
  it("clears a month by sending null", async () => {
    open();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fileArchivedJobMonths).toHaveBeenCalledWith("job", "job-1", {
        costMonth: null,
        salesMonth: "2026-07",
      }),
    );
  });

  // The pending state belongs to the form now, so the controls follow the action
  // rather than a flag the component sets and has to remember to clear.
  it("holds the controls while the action runs, and lets go when it answers", async () => {
    let answer;
    fileArchivedJobMonths.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    open();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    answer({ jobIDs: ["job-1"] });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
  });

  // The server has the last word on the market rule, and what it says is shown
  // rather than swallowed.
  it("shows what the server refused", async () => {
    fileArchivedJobMonths.mockResolvedValue({ error: "sales came from the market" });
    const onFiled = vi.fn();
    open(HAND_ENTERED, { onFiled });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("sales came from the market")).toBeInTheDocument();
    expect(onFiled).not.toHaveBeenCalled();
  });
});

// A group is filed as one: naming the set is the point, so the request names it
// rather than its members.
describe("filing a whole set", () => {
  it("names the group, and says how many jobs it covers", async () => {
    open(GROUP);

    expect(screen.getByText(/these 4 jobs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fileArchivedJobMonths).toHaveBeenCalledWith("group", "group-1", {
        costMonth: "2026-08",
        salesMonth: "2026-07",
      }),
    );
  });

  // A set files what it can, so the income field stays open even though some
  // members may be locked; the server reports what it left alone.
  it("leaves the income field open for a mixed set", () => {
    open(GROUP);

    expect(screen.getAllByRole("button", { name: /choose date/i })[1]).toBeEnabled();
  });
});
