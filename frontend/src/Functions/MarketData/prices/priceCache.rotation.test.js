import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMarketRead = vi.fn();
vi.mock("./priceLoader", () => ({
  requestMarketRead: (...args) => requestMarketRead(...args),
  requestPrice: vi.fn(),
  requestAdjustedPrice: vi.fn(),
  setClockMovedListener: () => {},
  setOrdersStoredListener: () => {},
}));

const readMarketFreshness = vi.fn();
const deferMarket = vi.fn();
vi.mock("./priceStore", () => ({
  readStoredPrice: vi.fn(),
  readMarketFreshness: (...args) => readMarketFreshness(...args),
  deferMarket: (...args) => deferMarket(...args),
}));

// Four saved citadels, because what this file is about is what happens across
// several markets at once — which one market cannot show.
const SAVED = ["azbel", "astrahus", "fortizar", "raitaru"];

vi.mock("../registry/marketSources.js", async () => {
  const { marketSourcesWith, savedCitadel } =
    await import("../../../tests/marketSourceFixtures.js");
  return marketSourcesWith(
    ...SAVED.map((id, at) => savedCitadel({ id, structureID: 1000 + at })),
  );
});

const { rotateSelfReadMarkets } = await import("./priceCache.js");
const { PRICE_ROTATION_MS } = await import("../citadels/citadelPrices");
const { MARKET_READ_OUTCOME } = await import("../registry/marketReadOutcome");

/** Nothing on record, so every market is due. */
const NEVER_READ = undefined;

beforeEach(() => {
  vi.clearAllMocks();
  readMarketFreshness.mockResolvedValue(NEVER_READ);
  requestMarketRead.mockResolvedValue(undefined);
  deferMarket.mockResolvedValue(undefined);
});

describe("a rotation across several markets", () => {
  it("reads every market that is due", async () => {
    expect(await rotateSelfReadMarkets(1000)).toBe(SAVED.length);

    expect(requestMarketRead.mock.calls.map(([id]) => id).sort()).toEqual(
      [...SAVED].sort(),
    );
  });

  // A structure's market is on an ESI allowance of its own, so reading several
  // takes nothing from the prices this server serves — and a reader who has just
  // logged in wants them all, not a queue.
  it("reads them together rather than one after another", async () => {
    let reading = 0;
    let most = 0;
    requestMarketRead.mockImplementation(async () => {
      reading += 1;
      most = Math.max(most, reading);
      await Promise.resolve();
      reading -= 1;
    });

    await rotateSelfReadMarkets(1000);

    expect(most).toBe(SAVED.length);
  });

  it("reads the rest after one of them fails", async () => {
    requestMarketRead.mockImplementation(async (marketLocation) => {
      if (marketLocation === "azbel") throw new Error("ESI is down");
    });

    await rotateSelfReadMarkets(1000);

    expect(requestMarketRead).toHaveBeenCalledTimes(SAVED.length);
  });

  // The market that was refused, and not whichever happened to sit at its index.
  it("puts back the turn of the markets it was refused, and no others", async () => {
    requestMarketRead.mockImplementation(async (marketLocation) => {
      if (marketLocation === "astrahus" || marketLocation === "raitaru") {
        const refusal = new Error("nobody can dock there");
        refusal.permanent = true;
        throw refusal;
      }
    });

    await rotateSelfReadMarkets(1000);

    expect(deferMarket.mock.calls.map(([id]) => id).sort()).toEqual([
      "astrahus",
      "raitaru",
    ]);
    expect(deferMarket).toHaveBeenCalledWith(
      "astrahus",
      1000 + PRICE_ROTATION_MS,
      MARKET_READ_OUTCOME.REFUSED,
    );
  });

  it("reads nothing while every market's turn is still to come", async () => {
    readMarketFreshness.mockResolvedValue({
      refreshedAt: 0,
      expiresAt: 9_000_000_000_000,
    });

    expect(await rotateSelfReadMarkets(1000)).toBe(0);
    expect(requestMarketRead).not.toHaveBeenCalled();
  });
});

// A read that failed says nothing about the market: ESI may be down, or the
// account's characters may not all have arrived — as they have not when a cloud
// account signs in and its roster is still filling. An hour's wait on that would
// leave a readable market unread on nothing but bad timing.
describe("a market that could not be read, as against refused", () => {
  it("is left due when the read simply failed", async () => {
    requestMarketRead.mockRejectedValue(new Error("ESI is down"));

    await rotateSelfReadMarkets(1000);

    expect(deferMarket).not.toHaveBeenCalled();
  });

  it("waits its turn out when the account was refused", async () => {
    requestMarketRead.mockImplementation(async () => {
      const refusal = new Error("no character can see it");
      refusal.permanent = true;
      throw refusal;
    });

    await rotateSelfReadMarkets(1000);

    expect(deferMarket).toHaveBeenCalledTimes(SAVED.length);
  });

  // Having nobody to ask with is an answer about the account rather than a
  // failure to reach ESI, so it waits its turn out the way a refusal does.
  it("waits its turn out when nothing could be asked", async () => {
    requestMarketRead.mockImplementation(async () => {
      const unaskable = new Error("no character is authorised to ask");
      unaskable.needsReauthorisation = true;
      throw unaskable;
    });

    await rotateSelfReadMarkets(1000);

    expect(deferMarket).toHaveBeenCalledTimes(SAVED.length);
  });
});

// The reason is the only thing a panel can say about a market whose figures
// never arrive, so it has to survive the rotation rather than being read once
// and dropped.
describe("what the rotation records about a market it could not read", () => {
  it("hands the reason on with the turn it puts back", async () => {
    requestMarketRead.mockImplementation(async () => {
      const refusal = new Error("no character can see it");
      refusal.permanent = true;
      throw refusal;
    });

    await rotateSelfReadMarkets(1000);

    for (const [, , outcome] of deferMarket.mock.calls) {
      expect(outcome).toBe(MARKET_READ_OUTCOME.REFUSED);
    }
  });

  it("separates having nobody to ask from being told no", async () => {
    requestMarketRead.mockImplementation(async () => {
      const unaskable = new Error("no character is authorised to ask");
      unaskable.needsReauthorisation = true;
      throw unaskable;
    });

    await rotateSelfReadMarkets(1000);

    for (const [, , outcome] of deferMarket.mock.calls) {
      expect(outcome).toBe(MARKET_READ_OUTCOME.UNASKABLE);
    }
  });
});
