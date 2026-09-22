import { beforeEach, describe, expect, it, vi } from "vitest";

const writeMarketLocations = vi.fn();
const writePlannerMarketLocations = vi.fn();
const savePlannerSettings = vi.fn(async () => {});

vi.mock("../../../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: { isLoggedIn: true },
      applicationSettings: {
        actions: { writeMarketLocations },
        marketLocations: [],
      },
      plannerSettings: {
        actions: { writePlannerMarketLocations, savePlannerSettings },
      },
    }),
  },
}));

// The debounce modules are deliberately NOT mocked. A flush writes whatever is
// already waiting rather than making a write out of nothing, so mocking them
// would hide a writer that flushes without having scheduled — which sends
// nothing at all. What is mocked is the network boundary beneath them.
const saveApplicationSettings = vi.fn(async () => true);
vi.mock("../../../../Functions/Endpoints/Private/userDocument.js", () => ({
  saveApplicationSettings: () => saveApplicationSettings(),
  saveUserAccountDocument: vi.fn(async () => true),
  saveUserAccountAndApplicationSettings: vi.fn(async () => true),
}));

const marketLocationsChanged = vi.fn();
vi.mock("../../../../Functions/MarketData/marketLocations", () => ({
  marketLocationsChanged: () => marketLocationsChanged(),
}));

const { marketEdits, addMarket, removeMarket, updateMarket } =
  await import("./marketWriter.js");

const OWNER = "corporation:98000001";
const azbel = { id: "market-1", name: "Perimeter Azbel", structureID: 1 };

/** Lets the writer's fire-and-forget save settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("where a change to one market goes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveApplicationSettings.mockResolvedValue(true);
  });

  it("writes a market the reader saved to their own settings", () => {
    marketEdits().add(azbel);

    expect(writeMarketLocations).toHaveBeenCalledTimes(1);
    expect(writePlannerMarketLocations).not.toHaveBeenCalled();
  });

  it("writes an organisation's market to that organisation's settings", () => {
    marketEdits(OWNER).add(azbel);

    expect(writePlannerMarketLocations).toHaveBeenCalledWith(
      OWNER,
      expect.any(Function),
    );
    expect(writeMarketLocations).not.toHaveBeenCalled();
  });

  // Every surface reads the set the server composed, so a market saved to the
  // reader's own settings is offered nowhere until that set has been read
  // again — which is the whole of why this is recorded rather than assumed to
  // be visible already.
  it("records that the composed set has moved, whoever saved the market", () => {
    marketEdits().add(azbel);
    expect(marketLocationsChanged).toHaveBeenCalledTimes(1);

    marketEdits(OWNER).add(azbel);
    expect(marketLocationsChanged).toHaveBeenCalledTimes(2);
  });

  // The set cannot be read again until the document carrying the change has
  // reached the server, so the save is not left on the debounce's trailing
  // edge: a reader would be looking at a panel their new market is missing from
  // until it fired.
  //
  // Asserted as a request actually going out, because a flush of nothing is
  // indistinguishable from a flush that worked — a writer that flushes without
  // scheduling saves nothing and looks identical from the flush's side.
  it("sends the reader's own settings now rather than on the debounce", async () => {
    marketEdits().add(azbel);
    await settled();

    expect(saveApplicationSettings).toHaveBeenCalledTimes(1);
    expect(savePlannerSettings).not.toHaveBeenCalled();
  });

  it("sends the organisation's settings now for a market it owns", async () => {
    marketEdits(OWNER).remove("market-1");
    await settled();

    expect(savePlannerSettings).toHaveBeenCalledWith(OWNER);
    expect(saveApplicationSettings).not.toHaveBeenCalled();
  });

  // A save that fails has already reported itself; what must not happen is an
  // unhandled rejection out of a control with no answer to give.
  it("does not reject out of a control when the save fails", async () => {
    saveApplicationSettings.mockRejectedValueOnce(new Error("refused"));

    expect(() => marketEdits().add(azbel)).not.toThrow();
    await settled();
  });

  // The transform is what decides the change, and it is the same one whichever
  // document it lands on.
  it("hands the owner's lane to the transform", () => {
    marketEdits(OWNER).update("market-1", { name: "Renamed" });

    const [, transform] = writePlannerMarketLocations.mock.calls[0];
    expect(transform([azbel])[0].name).toBe("Renamed");
  });
});

describe("changing a lane of saved markets", () => {
  const azbel = { id: "mkt-1", name: "Perimeter Azbel", brokerFee: 2.5 };
  const jita = { id: "mkt-2", name: "Jita IV-4" };

  it("saves nothing for a market with no id", () => {
    expect(addMarket([], { name: "Nameless" })).toEqual([]);
  });

  it("renames one market and leaves the rest", () => {
    const lane = updateMarket([azbel, jita], "mkt-1", { name: "Perimeter" });

    expect(lane[0].name).toBe("Perimeter");
    expect(lane[1]).toEqual(jita);
  });

  // An absent change leaves the field alone, so renaming does not silently
  // reset the rate.
  it("keeps a fee no change was given for", () => {
    const lane = updateMarket([azbel], "mkt-1", { name: "Perimeter" });

    expect(lane[0].brokerFee).toBe(2.5);
  });

  it("takes a fee of zero as a change", () => {
    const lane = updateMarket([azbel], "mkt-1", { brokerFee: 0 });

    expect(lane[0].brokerFee).toBe(0);
  });

  // An organisation's market is shared through the same path its name changes
  // by, so the two are one write rather than two.
  it("changes whether an organisation shares a market", () => {
    const lane = updateMarket([azbel], "mkt-1", { sharedWithMembers: true });

    expect(lane[0].sharedWithMembers).toBe(true);
  });

  it("forgets one market", () => {
    const lane = removeMarket([azbel, jita], "mkt-1");

    expect(lane.map((market) => market.id)).toEqual(["mkt-2"]);
  });
});
