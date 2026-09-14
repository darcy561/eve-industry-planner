import { describe, expect, it, vi } from "vitest";

let accountPricing;
let groupDefaults;

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

vi.mock("./marketGroupData", () => ({
  groupPricingFor: ({ marketLocationRung, listingTypeRung }) =>
    groupDefaults
      ? {
          marketGroups: { 1857: { name: "Minerals" } },
          groupDefaults,
          marketGroupOf: (typeID) =>
            String(typeID) === "34" ? 1857 : undefined,
          marketLocationRung,
          listingTypeRung,
        }
      : undefined,
}));

const { PRICING_SIDE } = await import("./pricingSide.js");
const { resolveFor, sideDefaults } = await import("./priceResolution.js");
const { pricesWantedBy, pricesWantedForTypes } =
  await import("./pricesWanted.js");

const setAccount = (pricing) => {
  accountPricing = pricing;
  groupDefaults = pricing?.buying?.groups;
};

const job = (overrides = {}) => ({
  materialIDs: [34],
  itemID: 99,
  layout: {},
  ...overrides,
});

describe("where a type is priced", () => {
  it("answers the account's market when nothing nearer does", () => {
    setAccount({ buying: { market: "jita", basis: "sell" }, selling: {} });

    const resolved = resolveFor(sideDefaults(PRICING_SIDE.BUYING), null, 34);

    expect(resolved.marketLocation).toBe("jita");
  });

  // Rung 2. It is resolved into the side's defaults rather than per type, so a
  // caller that forgot to pass it would silently fall back to the account's.
  it("lets the job's own choice outrank the account", () => {
    setAccount({ buying: { market: "jita", basis: "sell" }, selling: {} });

    const resolved = resolveFor(
      sideDefaults(PRICING_SIDE.BUYING, {
        jobPricing: { buying: { market: "amarr" } },
      }),
      null,
      34,
    );

    expect(resolved.marketLocation).toBe("amarr");
  });

  // Rung 1, which is per type and so answered by resolveFor rather than by the
  // side's defaults.
  it("lets a material's own override outrank the job", () => {
    setAccount({ buying: { market: "jita", basis: "sell" }, selling: {} });

    const resolved = resolveFor(
      sideDefaults(PRICING_SIDE.BUYING, {
        jobPricing: { buying: { market: "amarr" } },
      }),
      { materialPriceOverrides: { 34: { marketDisplay: "hek" } } },
      34,
    );

    expect(resolved.marketLocation).toBe("hek");
  });
});

// The fetch and the read must resolve identically: a fetch that warmed one
// market while the reader looked at another would show a zero with nothing
// reporting a problem. These assert the two agree rather than trusting that they
// were written the same way.
describe("what is fetched is what is read", () => {
  it("agrees for a job whose own choice is not the account's", () => {
    setAccount({ buying: { market: "jita", basis: "sell" }, selling: {} });
    const withOwnMarket = job({
      layout: { localPricing: { buying: { market: "amarr" } } },
    });

    const { wants } = pricesWantedBy(withOwnMarket);
    const read = resolveFor(
      sideDefaults(PRICING_SIDE.BUYING, {
        jobPricing: withOwnMarket.layout.localPricing,
      }),
      withOwnMarket.layout,
      34,
    );

    const fetchedFor34 = wants.find((want) => want.typeID === 34);
    expect(fetchedFor34.sourceID).toBe(read.marketLocation);
    expect(fetchedFor34.sourceID).toBe("amarr");
  });

  it("agrees for a material carrying its own override", () => {
    setAccount({ buying: { market: "jita", basis: "sell" }, selling: {} });
    const withOverride = job({
      layout: { materialPriceOverrides: { 34: { marketDisplay: "hek" } } },
    });

    const { wants } = pricesWantedBy(withOverride);
    const read = resolveFor(
      sideDefaults(PRICING_SIDE.BUYING),
      withOverride.layout,
      34,
    );

    expect(wants.find((want) => want.typeID === 34).sourceID).toBe(
      read.marketLocation,
    );
  });

  // The shopping list carries no job, and resolves through the same pair.
  it("agrees for a list with no job at all", () => {
    setAccount({ buying: { market: "dodixie", basis: "sell" }, selling: {} });

    const { wants } = pricesWantedForTypes([34], PRICING_SIDE.BUYING);
    const read = resolveFor(sideDefaults(PRICING_SIDE.BUYING), null, 34);

    expect(wants[0].sourceID).toBe(read.marketLocation);
    expect(wants[0].sourceID).toBe("dodixie");
  });

  // The output is sold, not bought, and the two sides routinely differ.
  it("asks for the output at the selling market", () => {
    setAccount({
      buying: { market: "jita", basis: "sell" },
      selling: { market: "amarr", exit: "listed" },
    });

    const { wants } = pricesWantedBy(job());

    expect(wants.find((want) => want.typeID === 99).sourceID).toBe("amarr");
    expect(wants.find((want) => want.typeID === 34).sourceID).toBe("jita");
  });
});
