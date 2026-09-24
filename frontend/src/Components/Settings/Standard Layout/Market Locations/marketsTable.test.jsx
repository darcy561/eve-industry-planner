import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MarketsTable from "./marketsTable";

const azbel = {
  id: "market-1",
  name: "Perimeter Azbel",
  placeLabel: "Citadel · The Forge",
  lastReadAt: 1700,
  lastReadLabel: "20 minutes ago",
  readHere: true,
  brokerFee: 2.5,
  editable: true,
};

const shared = {
  id: "market-2",
  name: "Jita IV-4",
  placeLabel: "Station · The Forge",
  readHere: false,
  sharedByLabel: "Your Corp",
  editable: false,
};

function show(rows, { open = new Set(), onToggleRow = vi.fn() } = {}) {
  render(<MarketsTable rows={rows} open={open} onToggleRow={onToggleRow} />);
  return onToggleRow;
}

describe("the markets a reader may price against", () => {
  it("names each market and where it is", () => {
    show([azbel]);

    expect(screen.getByText("Perimeter Azbel")).toBeTruthy();
    expect(screen.getByText("Citadel · The Forge")).toBeTruthy();
  });

  // A citadel's rate is its owner's; a station's is worked out from the seller's
  // skills and standings, so there is no number to show rather than a zero.
  it("shows a citadel's rate and nothing for a station's", () => {
    show([azbel, shared]);

    expect(screen.getByText("2.5%")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  // Where the market came from, because the reader did not save it and the name
  // alone would have them wondering.
  it("says which organisation shared a market", () => {
    show([shared]);

    expect(screen.getByText("Your Corp")).toBeTruthy();
  });

  it("says a market is the reader's own when nobody shared it", () => {
    show([azbel]);

    expect(screen.getByText("You")).toBeTruthy();
  });
});

// An absent moment is two different sentences, and writing one for both would
// tell a reader their market had never been read when nothing had asked.
describe("when a market was last read", () => {
  it("gives the moment where there is one", () => {
    show([azbel]);

    expect(screen.getByText("20 minutes ago")).toBeTruthy();
  });

  it("says a market the reader reads has not been read here", () => {
    show([{ ...azbel, lastReadAt: undefined, lastReadLabel: undefined }]);

    expect(screen.getByText("Not read on this device")).toBeTruthy();
  });

  // Saving a market asks for it to be walked; the first walk follows rather than
  // arriving with the save. "Nobody has asked for a price" would be a different
  // claim, and a wrong one — a reader who has priced a job against it has asked.
  it("says a market the server has not walked yet is waiting", () => {
    show([shared]);

    expect(screen.getByText("Waiting for its first prices")).toBeTruthy();
  });
});

// A market that stopped answering looks exactly like one nothing has got to,
// and the reader is the only one who can fix the first.
describe("a market whose prices are not arriving", () => {
  const refused = {
    ...azbel,
    lastReadAt: undefined,
    lastReadLabel: undefined,
    readProblem: {
      label: "No character can dock here",
      explain: "Link or authorise one that can dock there.",
    },
  };

  it("says what is wrong rather than that nobody has read it", () => {
    show([refused]);

    expect(screen.getByText("No character can dock here")).toBeTruthy();
    expect(screen.getByText("No prices")).toBeTruthy();
    expect(screen.queryByText("Not read on this device")).toBeNull();
  });

  // The explanation is the only place the fix is described, so a reader who does
  // not use a mouse has to be able to reach it.
  it("puts the explanation within reach of the keyboard", async () => {
    show([refused]);

    await userEvent.tab();

    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Link or authorise one that can dock there.",
    );
  });

  // The figures on screen are still the ones from that moment, so dropping the
  // date would hide how old the prices a job is costed against have become.
  it("keeps the moment on a market that was readable and is not now", () => {
    show([{ ...refused, lastReadAt: 1700, lastReadLabel: "20 minutes ago" }]);

    expect(screen.getByText("20 minutes ago")).toBeTruthy();
    expect(screen.getByText("No character can dock here")).toBeTruthy();
  });

  it("says nothing on a market with no problem to report", () => {
    show([azbel]);

    expect(screen.queryByText("No character can dock here")).toBeNull();
  });
});

describe("opening a market's settings", () => {
  it("asks for the row it belongs to", async () => {
    const onToggleRow = show([azbel]);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Show the settings for Perimeter Azbel",
      }),
    );

    expect(onToggleRow).toHaveBeenCalledWith("market-1");
  });

  it("says it is open once it is", () => {
    show([azbel], { open: new Set(["market-1"]) });

    expect(
      screen
        .getByRole("button", {
          name: "Hide the settings for Perimeter Azbel",
        })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  // A market the reader did not save has nothing to open. A chevron that can be
  // pressed and does nothing is worse than no chevron.
  it("offers nothing to open on a market the reader did not save", () => {
    render(
      <MarketsTable
        rows={[shared]}
        open={new Set()}
        onToggleRow={vi.fn()}
        renderEditor={() => <div>an editor</div>}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /settings for Jita IV-4/ }),
    ).toBeNull();
    expect(screen.queryByText("an editor")).toBeNull();
  });

  // Each editor belongs to its own row, so opening one says nothing about
  // another.
  it("opens each market's settings independently", () => {
    const second = { ...azbel, id: "market-3", name: "Rens VI" };
    render(
      <MarketsTable
        rows={[azbel, second]}
        open={new Set(["market-1", "market-3"])}
        onToggleRow={vi.fn()}
        renderEditor={(row) => <div>editing {row.name}</div>}
      />,
    );

    expect(screen.getByText("editing Perimeter Azbel")).toBeTruthy();
    expect(screen.getByText("editing Rens VI")).toBeTruthy();
  });

  // A closed editor is not drawn at all rather than drawn and hidden: it holds
  // the fields a reader is part-way through typing into, and one behind a
  // collapsed row would keep them without showing them.
  it("draws nothing for a market whose settings are closed", () => {
    render(
      <MarketsTable
        rows={[azbel]}
        open={new Set()}
        onToggleRow={vi.fn()}
        renderEditor={(row) => <div>editing {row.name}</div>}
      />,
    );

    expect(screen.queryByText("editing Perimeter Azbel")).toBeNull();
  });

  // The editor spans the table under its own row rather than floating over it,
  // so more than one can be open and each stays with its market.
  it("renders the editor beneath the market it belongs to", () => {
    render(
      <MarketsTable
        rows={[azbel]}
        open={new Set(["market-1"])}
        onToggleRow={vi.fn()}
        renderEditor={(row) => <div>editing {row.name}</div>}
      />,
    );

    expect(screen.getByText("editing Perimeter Azbel")).toBeTruthy();
  });
});
