import { beforeEach, describe, expect, it, vi } from "vitest";

let accountPricing;

vi.mock("../../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1" },
      applicationSettings: {
        get defaultPricing() {
          return accountPricing;
        },
      },
    }),
  },
}));

vi.mock("../defaults/marketGroupData.js", () => ({
  groupPricingFor: () => undefined,
}));

const { PRICING_SIDE } = await import("../defaults/pricingSide");
const { jobFromDocument } = await import("../../Job/jobDocument.js");
const { pricesWantedBy, pricesWantedByWatchlist, pricesWantedForTypes } =
  await import("./pricesWanted.js");

const at = (wants, typeID) =>
  wants.filter((want) => String(want.typeID) === String(typeID));
const marketsFor = (wants, typeID) =>
  at(wants, typeID)
    .map((want) => want.marketLocation)
    .sort();

beforeEach(() => {
  accountPricing = {
    buying: { market: "jita", orderType: "sell" },
    selling: { market: "amarr", exit: "listed" },
  };
});

describe("what a job needs priced", () => {
  const job = ({ materials = [34, 35], build = {}, ...overrides } = {}) => ({
    itemID: 99,
    ...overrides,
    build: {
      materials: Object.fromEntries(
        materials.map((typeID) => [String(typeID), { typeID }]),
      ),
      ...build,
    },
  });

  it("asks for materials where they are bought and the output where it is sold", () => {
    const { wants } = pricesWantedBy(job());

    expect(marketsFor(wants, 34)).toEqual(["jita"]);
    expect(marketsFor(wants, 99)).toEqual(["amarr"]);
  });

  it("wants an adjusted price for the materials and not the output", () => {
    const { adjustedTypeIDs } = pricesWantedBy(job());

    expect(adjustedTypeIDs.sort()).toEqual([34, 35]);
  });

  it("takes a list of jobs as readily as one", () => {
    const { wants } = pricesWantedBy([job(), job({ itemID: 100 })]);

    expect(marketsFor(wants, 100)).toEqual(["amarr"]);
  });

  it("keeps two jobs' different markets apart in one call", () => {
    const { wants } = pricesWantedBy([
      job({ materials: [34], itemID: 98 }),
      job({
        materials: [34],
        itemID: 99,
        build: { localPricing: { buying: { market: "hek" } } },
      }),
    ]);

    expect(marketsFor(wants, 34)).toEqual(["hek", "jita"]);
  });

  it("asks for the output once, even for a job out of the store", () => {
    const stored = jobFromDocument({
      jobID: "job-1",
      itemID: 99,
      jobType: 1,
      name: "Item",
      build: { materials: { 34: { typeID: 34, name: "Tritanium" } } },
    });

    const { wants } = pricesWantedBy(stored);

    expect(marketsFor(wants, 99)).toEqual(["amarr"]);
    expect(marketsFor(wants, 34)).toEqual(["jita"]);
  });

  it("asks once for a type two jobs want at the same market", () => {
    const { wants } = pricesWantedBy([job(), job()]);

    expect(at(wants, 34)).toHaveLength(1);
  });

  it("skips a job that is not there", () => {
    const { wants } = pricesWantedBy([null, undefined, job()]);

    expect(marketsFor(wants, 34)).toEqual(["jita"]);
  });

  it("asks for nothing for a job with no output and no materials", () => {
    const { wants, adjustedTypeIDs } = pricesWantedBy(
      job({ materials: [], itemID: null }),
    );

    expect(wants).toEqual([]);
    expect(adjustedTypeIDs).toEqual([]);
  });
});

describe("what a bare list of types needs priced", () => {
  it("prices every type on the side it was asked for", () => {
    expect(pricesWantedForTypes([34, 35], PRICING_SIDE.BUYING).wants).toEqual([
      { typeID: 34, marketLocation: "jita" },
      { typeID: 35, marketLocation: "jita" },
    ]);
    expect(pricesWantedForTypes([34], PRICING_SIDE.SELLING).wants).toEqual([
      { typeID: 34, marketLocation: "amarr" },
    ]);
  });

  it("asks for nothing when given nothing", () => {
    expect(pricesWantedForTypes(undefined, PRICING_SIDE.BUYING).wants).toEqual(
      [],
    );
  });
});

describe("what the watchlist needs priced", () => {
  const watched = (overrides = {}) => ({
    typeID: 99,
    materials: [],
    ...overrides,
  });

  it("wants each material at both the buying and the selling market", () => {
    const { wants } = pricesWantedByWatchlist([
      watched({ materials: [{ typeID: 34, materials: [] }] }),
    ]);

    expect(marketsFor(wants, 34)).toEqual(["amarr", "jita"]);
  });

  it("wants the item itself only where it would be sold", () => {
    const { wants } = pricesWantedByWatchlist([watched()]);

    expect(marketsFor(wants, 99)).toEqual(["amarr"]);
  });

  it("wants a material's components only where they are bought", () => {
    const { wants } = pricesWantedByWatchlist([
      watched({
        materials: [
          { typeID: 34, materials: [{ typeID: 35 }, { typeID: 36 }] },
        ],
      }),
    ]);

    expect(marketsFor(wants, 35)).toEqual(["jita"]);
    expect(marketsFor(wants, 36)).toEqual(["jita"]);
  });

  it("takes the account pricing it is handed over the stored one", () => {
    const { wants } = pricesWantedByWatchlist([watched()], {
      buying: { market: "hek", orderType: "sell" },
      selling: { market: "dodixie", exit: "listed" },
    });

    expect(marketsFor(wants, 99)).toEqual(["dodixie"]);
  });

  it("walks past an entry that is missing or has no type", () => {
    const { wants } = pricesWantedByWatchlist([
      null,
      watched({ typeID: undefined }),
      watched({ materials: [null, { materials: [null] }] }),
    ]);

    expect(wants).toEqual([{ typeID: 99, marketLocation: "amarr" }]);
  });

  it("asks for nothing for an empty watchlist", () => {
    expect(pricesWantedByWatchlist(undefined).wants).toEqual([]);
  });
});
