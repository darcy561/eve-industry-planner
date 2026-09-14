import { beforeEach, describe, expect, it, vi } from "vitest";

let accountPricing;

vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      applicationSettings: {
        get defaultPricing() {
          return accountPricing;
        },
      },
    }),
  },
}));

vi.mock("./marketGroupData", () => ({ groupPricingFor: () => undefined }));

const { PRICING_SIDE } = await import("./pricingSide.js");
const { pricesWantedBy, pricesWantedByWatchlist, pricesWantedForTypes } =
  await import("./pricesWanted.js");

const at = (wants, typeID) =>
  wants.filter((want) => String(want.typeID) === String(typeID));
const marketsFor = (wants, typeID) =>
  at(wants, typeID)
    .map((want) => want.sourceID)
    .sort();

beforeEach(() => {
  accountPricing = {
    // Deliberately different sides: a fixture whose sides agree cannot tell a
    // caller asking for the wrong one.
    buying: { market: "jita", basis: "sell" },
    selling: { market: "amarr", exit: "listed" },
  };
});

describe("what a job needs priced", () => {
  const job = (overrides = {}) => ({
    materialIDs: [34, 35],
    itemID: 99,
    layout: {},
    ...overrides,
  });

  it("asks for materials where they are bought and the output where it is sold", () => {
    const { wants } = pricesWantedBy(job());

    expect(marketsFor(wants, 34)).toEqual(["jita"]);
    expect(marketsFor(wants, 99)).toEqual(["amarr"]);
  });

  // CCP's adjusted price belongs to no market and is read by the install cost
  // estimate for the materials only, never for the output.
  it("wants an adjusted price for the materials and not the output", () => {
    const { adjustedTypeIDs } = pricesWantedBy(job());

    expect(adjustedTypeIDs.sort()).toEqual([34, 35]);
  });

  it("takes a list of jobs as readily as one", () => {
    const { wants } = pricesWantedBy([job(), job({ itemID: 100 })]);

    expect(marketsFor(wants, 100)).toEqual(["amarr"]);
  });

  // The market is a per-job rung, so two jobs in one call can answer it
  // differently and the batch must carry both answers.
  it("keeps two jobs' different markets apart in one call", () => {
    const { wants } = pricesWantedBy([
      job({ materialIDs: [34], itemID: 98 }),
      job({
        materialIDs: [34],
        itemID: 99,
        layout: { localPricing: { buying: { market: "hek" } } },
      }),
    ]);

    expect(marketsFor(wants, 34)).toEqual(["hek", "jita"]);
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
      job({ materialIDs: [], itemID: null }),
    );

    expect(wants).toEqual([]);
    expect(adjustedTypeIDs).toEqual([]);
  });
});

describe("what a bare list of types needs priced", () => {
  it("prices every type on the side it was asked for", () => {
    expect(pricesWantedForTypes([34, 35], PRICING_SIDE.BUYING).wants).toEqual([
      { typeID: 34, sourceID: "jita" },
      { typeID: 35, sourceID: "jita" },
    ]);
    expect(pricesWantedForTypes([34], PRICING_SIDE.SELLING).wants).toEqual([
      { typeID: 34, sourceID: "amarr" },
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

  // The one surface reading both sides at once: a material is bought as part of
  // the item and also valued at what it would fetch on its own row.
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

  // A material's own components are only ever bought — nothing values them on
  // their own — so asking for them at the selling market would fetch rows
  // nothing reads.
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
      buying: { market: "hek", basis: "sell" },
      selling: { market: "dodixie", exit: "listed" },
    });

    expect(marketsFor(wants, 99)).toEqual(["dodixie"]);
  });

  it("walks past a row that is missing or has no type", () => {
    const { wants } = pricesWantedByWatchlist([
      null,
      watched({ typeID: undefined }),
      watched({ materials: [null, { materials: [null] }] }),
    ]);

    expect(wants).toEqual([{ typeID: 99, sourceID: "amarr" }]);
  });

  it("asks for nothing for an empty watchlist", () => {
    expect(pricesWantedByWatchlist(undefined).wants).toEqual([]);
  });
});
