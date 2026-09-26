import { describe, expect, it } from "vitest";
import {
  setGroupPricing,
  PRICING_RUNG,
  PRICING_SIDE,
  resolvePricingSide,
  resolvePricingSideRungs,
  resolveGroupDefault,
  setJobPricingSide,
} from "./pricingSide.js";

const account = {
  buying: { market: "jita", orderType: "sell" },
  selling: { market: "amarr", orderType: "buy" },
};

const resolve = (jobPricing, side = PRICING_SIDE.BUYING) =>
  resolvePricingSide({ jobPricing, accountPricing: account, side });

describe("resolvePricingSide", () => {
  it("answers each side from its own account default", () => {
    expect(resolve(null, PRICING_SIDE.BUYING)).toEqual({
      marketLocation: "jita",
      orderType: "sell",
    });
    expect(resolve(null, PRICING_SIDE.SELLING)).toEqual({
      marketLocation: "amarr",
      orderType: "buy",
    });
  });

  it("lets the job outrank the account, per side", () => {
    const job = { selling: { market: "hek", orderType: "buyP95" } };

    expect(resolve(job, PRICING_SIDE.SELLING)).toEqual({
      marketLocation: "hek",
      orderType: "buyP95",
    });
    expect(resolve(job, PRICING_SIDE.BUYING)).toEqual({
      marketLocation: "jita",
      orderType: "sell",
    });
  });

  it("resolves market and order type independently", () => {
    expect(resolve({ buying: { market: "dodixie" } })).toEqual({
      marketLocation: "dodixie",
      orderType: "sell",
    });
    expect(resolve({ buying: { orderType: "buy" } })).toEqual({
      marketLocation: "jita",
      orderType: "buy",
    });
  });

  it("treats an empty value as no choice at any rung", () => {
    expect(resolve({ buying: { market: "", orderType: "" } })).toEqual({
      marketLocation: "jita",
      orderType: "sell",
    });
    expect(
      resolvePricingSide({
        jobPricing: null,
        accountPricing: { buying: { market: "", orderType: "" } },
        side: PRICING_SIDE.BUYING,
      }),
    ).toEqual({ marketLocation: "jita", orderType: "sell" });
  });

  it("falls through to the global default when nothing has said", () => {
    expect(
      resolvePricingSide({
        jobPricing: null,
        accountPricing: null,
        side: PRICING_SIDE.SELLING,
      }),
    ).toEqual({ marketLocation: "jita", orderType: "sell" });
  });
});

describe("setJobPricingSide", () => {
  it("sets one field of one side and leaves the other alone", () => {
    const next = setJobPricingSide(
      { selling: { market: "hek", orderType: "buy" } },
      PRICING_SIDE.BUYING,
      "market",
      "amarr",
    );

    expect(next.buying).toEqual({ market: "amarr", orderType: null });
    expect(next.selling).toEqual({ market: "hek", orderType: "buy" });
  });

  it("replaces a value rather than keeping the first one", () => {
    const first = setJobPricingSide(
      null,
      PRICING_SIDE.BUYING,
      "market",
      "amarr",
    );

    expect(
      setJobPricingSide(first, PRICING_SIDE.BUYING, "market", "dodixie").buying
        .market,
    ).toBe("dodixie");
  });

  it("writes the selling side without touching the buying one", () => {
    const withBuying = setJobPricingSide(
      null,
      PRICING_SIDE.BUYING,
      "market",
      "jita",
    );

    const next = setJobPricingSide(
      withBuying,
      PRICING_SIDE.SELLING,
      "market",
      "amarr",
    );

    expect(next.selling).toEqual({ market: "amarr", orderType: null });
    expect(next.buying).toEqual({ market: "jita", orderType: null });
  });

  it("writes each field of the selling side independently", () => {
    const market = setJobPricingSide(
      null,
      PRICING_SIDE.SELLING,
      "market",
      "hek",
    );
    const both = setJobPricingSide(
      market,
      PRICING_SIDE.SELLING,
      "orderType",
      "buyP95",
    );

    expect(both.selling).toEqual({ market: "hek", orderType: "buyP95" });
    expect(both.buying).toEqual({ market: null, orderType: null });
  });

  it("answers null once nothing is chosen anywhere", () => {
    const one = setJobPricingSide(
      null,
      PRICING_SIDE.SELLING,
      "orderType",
      "buy",
    );

    expect(
      setJobPricingSide(one, PRICING_SIDE.SELLING, "orderType", null),
    ).toBeNull();
  });

  it("reads an empty string as clearing the field", () => {
    const one = setJobPricingSide(null, PRICING_SIDE.BUYING, "market", "amarr");

    expect(
      setJobPricingSide(one, PRICING_SIDE.BUYING, "market", ""),
    ).toBeNull();
  });
});

const marketGroups = {
  1857: { name: "Minerals", parent_id: 1855 },
  1855: { name: "Manufacture & Research", parent_id: 1849 },
  1849: { name: "Materials" },
  516: { name: "Ore" },
};

const groupWalk = (groupDefaults, marketGroupID = 1857) =>
  resolveGroupDefault({ marketGroupID, marketGroups, groupDefaults });

describe("resolveGroupDefault", () => {
  it("answers from the item's own group", () => {
    expect(groupWalk({ 1857: { market: "jita", orderType: "sell" } })).toEqual({
      marketLocation: "jita",
      orderType: "sell",
    });
  });

  it("climbs to an ancestor when the item's group says nothing", () => {
    expect(groupWalk({ 1849: { market: "amarr" } })).toEqual({
      marketLocation: "amarr",
      orderType: null,
    });
  });

  it("lets a nearer group outrank a further one, field by field", () => {
    const answer = groupWalk({
      1849: { market: "amarr", orderType: "buy" },
      1857: { market: "hek" },
    });

    expect(answer).toEqual({ marketLocation: "hek", orderType: "buy" });
  });

  it("answers nothing when no ancestor names anything", () => {
    expect(groupWalk({ 516: { market: "dodixie" } })).toEqual({
      marketLocation: null,
      orderType: null,
    });
  });

  it("answers nothing when the defaults have not loaded", () => {
    expect(resolveGroupDefault({ marketGroupID: 1857, marketGroups })).toEqual({
      marketLocation: null,
      orderType: null,
    });
  });

  it("answers nothing for an item with no market group", () => {
    expect(
      resolveGroupDefault({
        marketGroupID: undefined,
        marketGroups,
        groupDefaults: { 1857: { market: "jita" } },
      }),
    ).toEqual({ marketLocation: null, orderType: null });
  });

  it("reads an empty value as no choice, and keeps climbing", () => {
    expect(
      groupWalk({
        1857: { market: "", orderType: "" },
        1855: { market: "hek" },
      }),
    ).toEqual({ marketLocation: "hek", orderType: null });
  });

  it("stops rather than circling a tree that points at itself", () => {
    const circular = { 1: { parent_id: 2 }, 2: { parent_id: 1 } };

    expect(
      resolveGroupDefault({
        marketGroupID: 1,
        marketGroups: circular,
        groupDefaults: { 99: { market: "jita" } },
      }),
    ).toEqual({ marketLocation: null, orderType: null });
  });
});

describe("resolvePricingSideRungs", () => {
  const rungs = (jobPricing, side = PRICING_SIDE.BUYING) =>
    resolvePricingSideRungs({ jobPricing, accountPricing: account, side });

  it("names the job when the job answered", () => {
    const answer = rungs({ buying: { market: "hek", orderType: "buy" } });

    expect(answer.marketLocationRung).toBe(PRICING_RUNG.JOB);
    expect(answer.orderTypeRung).toBe(PRICING_RUNG.JOB);
  });

  it("names the account when the job said nothing", () => {
    const answer = rungs(null);

    expect(answer.marketLocationRung).toBe(PRICING_RUNG.ACCOUNT);
    expect(answer.orderTypeRung).toBe(PRICING_RUNG.ACCOUNT);
  });

  it("names a rung per axis", () => {
    const answer = rungs({ buying: { market: "hek" } });

    expect(answer.marketLocationRung).toBe(PRICING_RUNG.JOB);
    expect(answer.orderTypeRung).toBe(PRICING_RUNG.ACCOUNT);
  });

  it("names the global default when nothing else did", () => {
    const answer = resolvePricingSideRungs({
      jobPricing: null,
      accountPricing: { buying: {}, selling: {} },
      side: PRICING_SIDE.BUYING,
    });

    expect(answer.marketLocationRung).toBe(PRICING_RUNG.GLOBAL);
    expect(answer.orderTypeRung).toBe(PRICING_RUNG.GLOBAL);
  });

  it("resolves the same values resolvePricingSide does", () => {
    const job = { buying: { market: "dodixie" } };

    const { marketLocation, orderType } = rungs(job);
    expect({ marketLocation, orderType }).toEqual(
      resolvePricingSide({
        jobPricing: job,
        accountPricing: account,
        side: PRICING_SIDE.BUYING,
      }),
    );
  });
});

describe("setGroupPricing", () => {
  const existing = {
    1857: { market: "jita", orderType: "buy" },
    1996: { market: "amarr" },
  };

  it("sets a field on a group the table does not carry yet", () => {
    expect(setGroupPricing(existing, 1998, "market", "hek")).toEqual({
      ...existing,
      1998: { market: "hek" },
    });
  });

  it("leaves every other group alone", () => {
    const next = setGroupPricing(existing, 1857, "market", "dodixie");

    expect(next[1996]).toEqual({ market: "amarr" });
    expect(next[1857]).toEqual({ market: "dodixie", orderType: "buy" });
  });

  it("sets one field without disturbing the other", () => {
    expect(setGroupPricing(existing, 1996, "orderType", "sell")[1996]).toEqual({
      market: "amarr",
      orderType: "sell",
    });
  });

  it("builds a table where a side had none", () => {
    expect(setGroupPricing(undefined, 1857, "market", "jita")).toEqual({
      1857: { market: "jita" },
    });
  });

  it("drops a group once its last field is cleared", () => {
    const next = setGroupPricing(existing, 1996, "market", "");

    expect(next).not.toHaveProperty("1996");
    expect(next[1857]).toEqual({ market: "jita", orderType: "buy" });
  });

  it("keeps a group that still names something", () => {
    expect(setGroupPricing(existing, 1857, "market", "")[1857]).toEqual({
      orderType: "buy",
    });
  });

  it("answers undefined once the last group goes", () => {
    const one = { 1857: { market: "jita" } };

    expect(setGroupPricing(one, 1857, "market", "")).toBeUndefined();
  });

  it("reads a cleared field as gone rather than as empty", () => {
    const next = setGroupPricing(existing, 1857, "orderType", null);

    expect(next[1857]).toEqual({ market: "jita" });
    expect(next[1857]).not.toHaveProperty("orderType", null);
  });

  it("reaches the same entry whether the id is a number or a string", () => {
    const byString = setGroupPricing(existing, "1857", "market", "hek");

    expect(byString[1857]).toEqual({ market: "hek", orderType: "buy" });
    expect(Object.keys(byString)).toHaveLength(2);
  });
});
