import { beforeEach, describe, expect, it, vi } from "vitest";

const readMarketFreshness = vi.fn();
vi.mock("../../../../Functions/MarketData/prices/priceStore.js", () => ({
  readMarketFreshness: (...args) => readMarketFreshness(...args),
}));

const { lastReadMoment, summariseMarket } = await import("./marketSummary.js");
const { recordSourceClock, resetSourceClocks } =
  await import("../../../../Functions/MarketData/prices/sourceClocks");
const { SOURCE_KIND } =
  await import("../../../../Functions/MarketData/registry/marketSources");
const { MARKET_READ_OUTCOME } =
  await import("../../../../Functions/MarketData/registry/marketReadOutcome");

const citadel = {
  id: "saved-citadel",
  name: "Perimeter Azbel",
  kind: SOURCE_KIND.CITADEL,
};
const hub = { id: "jita", name: "Jita", kind: SOURCE_KIND.HUB };

beforeEach(() => {
  resetSourceClocks();
  readMarketFreshness.mockReset().mockResolvedValue(undefined);
});

// Two questions wearing one name. A market the reader reads themselves was read
// on this device, at a moment only this device knows; a market this server
// prices states one clock for every reader.
describe("when a market was last read", () => {
  it("is this device's own moment for a market the reader reads", async () => {
    readMarketFreshness.mockResolvedValue({ readAt: 1700, expiresAt: 9999 });

    expect(await lastReadMoment(citadel)).toEqual({
      lastReadAt: 1700,
      readHere: true,
      readOutcome: undefined,
    });
  });

  // A market they have saved but never opened on this machine. Another of their
  // machines may have read it; this one is not saying so.
  it("is nothing for a market this device has never read", async () => {
    expect(await lastReadMoment(citadel)).toEqual({
      lastReadAt: undefined,
      readHere: true,
      readOutcome: undefined,
    });
  });

  it("is the server's clock for a market the server prices", async () => {
    recordSourceClock("jita", 4242);

    expect(await lastReadMoment(hub)).toEqual({
      lastReadAt: 4242,
      readHere: false,
      readOutcome: undefined,
    });
    expect(readMarketFreshness).not.toHaveBeenCalled();
  });

  // A market that has been refused every time it was tried carries a turn but
  // no read. Saying "read at the epoch" would be worse than saying nothing.
  it("is nothing for a market whose every attempt was refused", async () => {
    readMarketFreshness.mockResolvedValue({ readAt: 0, expiresAt: 9999 });

    expect((await lastReadMoment(citadel)).lastReadAt).toBeUndefined();
  });
});

describe("a market as a panel shows it", () => {
  // A citadel's rate is its owner's and nothing can derive it. A station's is
  // worked out from the seller's skills and standings, so quoting a stored one
  // would show the untrained rate without saying so.
  it("quotes a citadel's rate and not a station's", async () => {
    const saved = { ...citadel, structureID: 1, brokerFee: 2.5 };
    // A fee stored against a station is ignored rather than quoted: the real
    // one comes from the seller's skills and standings.
    const station = { ...hub, stationID: 60003760, brokerFee: 9 };

    expect((await summariseMarket(saved)).brokerFee).toBe(2.5);
    expect((await summariseMarket(station)).brokerFee).toBeUndefined();
  });
});

// A saved NPC station is priced by this server, like a hub, and the moment it
// carries is when the server last walked the region it sits in. So an absent one
// here is "this server has not walked it yet", not "it has never been read", and
// `readHere` is what tells a panel which sentence to write.
describe("a market this server prices", () => {
  const station = {
    id: "saved-station",
    name: "Rens VI - Moon 8",
    kind: SOURCE_KIND.STATION,
  };

  // A market only just saved is registered and has not come round on the walk
  // yet, so the server sends no clock for it either.
  it("has no moment until the server has walked it", async () => {
    expect(await lastReadMoment(station)).toEqual({
      lastReadAt: undefined,
      readHere: false,
      readOutcome: undefined,
    });
  });

  // The clock the market arrived with, so a fresh load says when the server
  // last walked it rather than claiming nothing has ever been priced there.
  it("takes the clock the market carried", async () => {
    expect(await lastReadMoment({ ...station, pricedAt: 4000 })).toEqual({
      lastReadAt: 4000,
      readHere: false,
      readOutcome: undefined,
    });
  });

  it("takes the clock that came back with the prices", async () => {
    recordSourceClock("saved-station", 5150);

    expect(await lastReadMoment(station)).toEqual({
      lastReadAt: 5150,
      readHere: false,
      readOutcome: undefined,
    });
  });

  // The market's own clock is as old as the last time the set was read, and a
  // price answered since then has walked past it.
  it("prefers a price answered since the set was read", async () => {
    recordSourceClock("saved-station", 5150);

    expect(await lastReadMoment({ ...station, pricedAt: 4000 })).toEqual({
      lastReadAt: 5150,
      readHere: false,
      readOutcome: undefined,
    });
  });

  // The other way round is the ordinary case on a fresh load: the set carries a
  // clock and nothing has asked for a price yet this session.
  it("keeps the market's clock when no price has been answered since", async () => {
    recordSourceClock("saved-station", 4000);

    expect(await lastReadMoment({ ...station, pricedAt: 5150 })).toEqual({
      lastReadAt: 5150,
      readHere: false,
      readOutcome: undefined,
    });
  });
});

// A market whose figures never arrive looks exactly like one nothing has got to
// yet, so how the last read went travels with when it happened — it is the same
// record, and the panel has nothing else to go on.
describe("how the last read of a market went", () => {
  it("carries what the device recorded for a market the reader reads", async () => {
    readMarketFreshness.mockResolvedValue({
      readAt: 0,
      expiresAt: 9999,
      outcome: MARKET_READ_OUTCOME.REFUSED,
    });

    expect(await lastReadMoment(citadel)).toEqual({
      lastReadAt: undefined,
      readHere: true,
      readOutcome: MARKET_READ_OUTCOME.REFUSED,
    });
  });

  // The server's own failures are not this reader's to see, and nothing they
  // could do would change one: a hub answers for everybody at once.
  it("answers nothing for a market the server prices", async () => {
    readMarketFreshness.mockResolvedValue({
      readAt: 1700,
      outcome: MARKET_READ_OUTCOME.REFUSED,
    });

    expect((await lastReadMoment(hub)).readOutcome).toBeUndefined();
  });

  it("reaches the summary the panel is built from", async () => {
    readMarketFreshness.mockResolvedValue({
      readAt: 0,
      outcome: MARKET_READ_OUTCOME.UNASKABLE,
    });

    expect(await summariseMarket(citadel)).toMatchObject({
      readOutcome: MARKET_READ_OUTCOME.UNASKABLE,
    });
  });

  // A market saved on another machine has no record here at all, which is not
  // the same as a read that went wrong.
  it("is nothing where the device holds no record", async () => {
    expect((await summariseMarket(citadel)).readOutcome).toBeUndefined();
  });
});
