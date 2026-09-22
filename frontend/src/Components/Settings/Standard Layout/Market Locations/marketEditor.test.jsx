import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const edits = {
  update: vi.fn(),
  remove: vi.fn(),
};
const marketEdits = vi.fn(() => edits);

vi.mock("./marketWriter", () => ({
  marketEdits: (...args) => marketEdits(...args),
}));

const { default: MarketEditor } = await import("./marketEditor.jsx");

const azbel = {
  id: "market-1",
  name: "Perimeter Azbel",
  kind: "citadel",
  brokerFee: 2.5,
  isDefault: false,
};

const jita = {
  id: "market-2",
  name: "Jita IV-4",
  kind: "station",
  isDefault: true,
};

const shared = {
  ...azbel,
  sharedBy: "corporation:98000001",
  sharedWithMembers: false,
};

function nameField() {
  return screen.getByLabelText("Market name");
}

describe("MarketEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A name typed a letter at a time would schedule a save per letter, so the
  // change is the one the reader left the field holding.
  it("records a new name once, when the reader leaves the field", () => {
    render(<MarketEditor row={azbel} />);

    fireEvent.change(nameField(), { target: { value: "Perimeter" } });
    expect(edits.update).not.toHaveBeenCalled();

    fireEvent.blur(nameField());

    expect(edits.update).toHaveBeenCalledWith("market-1", {
      name: "Perimeter",
    });
  });

  // An empty name leaves the market unidentifiable in every picker it appears
  // in, so the field goes back to what it held rather than saving nothing.
  it("refuses an empty name and restores the one it had", () => {
    render(<MarketEditor row={azbel} />);

    fireEvent.change(nameField(), { target: { value: "   " } });
    fireEvent.blur(nameField());

    expect(edits.update).not.toHaveBeenCalled();
    expect(nameField().value).toBe("Perimeter Azbel");
  });

  it("saves nothing when the name was not changed", () => {
    render(<MarketEditor row={azbel} />);

    fireEvent.blur(nameField());

    expect(edits.update).not.toHaveBeenCalled();
  });

  // A citadel's rate is the one thing about it nothing can read from the game.
  it("takes a citadel's broker fee", () => {
    render(<MarketEditor row={azbel} />);

    const fee = screen.getByLabelText("Broker fee");
    fireEvent.change(fee, { target: { value: "3.5" } });
    fireEvent.blur(fee);

    expect(edits.update).toHaveBeenCalledWith("market-1", { brokerFee: 3.5 });
  });

  // An NPC station's fee comes from the seller's skills and standings, so a
  // field here would quote a rate that is not the one charged.
  it("does not offer a broker fee on an NPC station", () => {
    render(<MarketEditor row={jita} />);

    expect(screen.queryByLabelText("Broker fee")).toBeNull();
  });

  it("forgets a market", () => {
    render(<MarketEditor row={azbel} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove market" }));

    expect(edits.remove).toHaveBeenCalledWith("market-1");
  });

  // A market is stored on the settings document of whoever saved it, and which
  // that is belongs to the writer rather than to the controls.
  it("routes an organisation's market to that organisation", () => {
    render(<MarketEditor row={shared} />);

    expect(marketEdits).toHaveBeenCalledWith("corporation:98000001");
  });

  it("routes a market the reader saved to their own account", () => {
    render(<MarketEditor row={azbel} />);

    expect(marketEdits).toHaveBeenCalledWith(undefined);
  });

  // Adding a market and giving it to every member are two acts, so the second
  // is asked for rather than assumed.
  it("offers sharing on an organisation's market only", () => {
    const own = render(<MarketEditor row={azbel} />);
    expect(screen.queryByRole("switch")).toBeNull();
    own.unmount();

    render(<MarketEditor row={shared} />);
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("shares an organisation's market with its members", () => {
    render(<MarketEditor row={shared} />);

    fireEvent.click(screen.getByRole("switch"));

    expect(edits.update).toHaveBeenCalledWith("market-1", {
      sharedWithMembers: true,
    });
  });
});
