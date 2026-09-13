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
  buying: { market: "jita", basis: "sell" },
  selling: { market: "amarr", basis: "buy" },
};

const resolve = (jobPricing, side = PRICING_SIDE.BUYING) =>
  resolvePricingSide({ jobPricing, accountPricing: account, side });

describe("resolvePricingSide", () => {
  it("answers each side from its own account default", () => {
    expect(resolve(null, PRICING_SIDE.BUYING)).toEqual({
      marketDisplay: "jita",
      orderDisplay: "sell",
    });
    expect(resolve(null, PRICING_SIDE.SELLING)).toEqual({
      marketDisplay: "amarr",
      orderDisplay: "buy",
    });
  });

  it("lets the job outrank the account, per side", () => {
    const job = { selling: { market: "hek", basis: "buyP95" } };

    expect(resolve(job, PRICING_SIDE.SELLING)).toEqual({
      marketDisplay: "hek",
      orderDisplay: "buyP95",
    });
    expect(resolve(job, PRICING_SIDE.BUYING)).toEqual({
      marketDisplay: "jita",
      orderDisplay: "sell",
    });
  });

  // A job naming a market but no basis has not chosen a basis, so the rung below
  // still answers it. Resolving the pair together would silently take both.
  it("resolves market and basis independently", () => {
    expect(resolve({ buying: { market: "dodixie" } })).toEqual({
      marketDisplay: "dodixie",
      orderDisplay: "sell",
    });
    expect(resolve({ buying: { basis: "buy" } })).toEqual({
      marketDisplay: "jita",
      orderDisplay: "buy",
    });
  });

  it("treats an empty value as no choice at any rung", () => {
    expect(resolve({ buying: { market: "", basis: "" } })).toEqual({
      marketDisplay: "jita",
      orderDisplay: "sell",
    });
    expect(
      resolvePricingSide({
        jobPricing: null,
        accountPricing: { buying: { market: "", basis: "" } },
        side: PRICING_SIDE.BUYING,
      }),
    ).toEqual({ marketDisplay: "jita", orderDisplay: "sell" });
  });

  it("falls through to the global default when nothing has said", () => {
    expect(
      resolvePricingSide({
        jobPricing: null,
        accountPricing: null,
        side: PRICING_SIDE.SELLING,
      }),
    ).toEqual({ marketDisplay: "jita", orderDisplay: "sell" });
  });
});

describe("setJobPricingSide", () => {
  it("sets one field of one side and leaves the other alone", () => {
    const next = setJobPricingSide(
      { selling: { market: "hek", basis: "buy" } },
      PRICING_SIDE.BUYING,
      "market",
      "amarr",
    );

    expect(next.buying).toEqual({ market: "amarr", basis: null });
    expect(next.selling).toEqual({ market: "hek", basis: "buy" });
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

  // The selling branch has no control writing to it yet, so nothing but this
  // would notice the side argument being ignored.
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

    expect(next.selling).toEqual({ market: "amarr", basis: null });
    expect(next.buying).toEqual({ market: "jita", basis: null });
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
      "basis",
      "buyP95",
    );

    expect(both.selling).toEqual({ market: "hek", basis: "buyP95" });
    expect(both.buying).toEqual({ market: null, basis: null });
  });

  it("answers null once nothing is chosen anywhere", () => {
    const one = setJobPricingSide(null, PRICING_SIDE.SELLING, "basis", "buy");

    expect(
      setJobPricingSide(one, PRICING_SIDE.SELLING, "basis", null),
    ).toBeNull();
  });

  it("reads an empty string as clearing the field", () => {
    const one = setJobPricingSide(null, PRICING_SIDE.BUYING, "market", "amarr");

    expect(
      setJobPricingSide(one, PRICING_SIDE.BUYING, "market", ""),
    ).toBeNull();
  });
});

// Tritanium sits in Minerals, which sits in Manufacture & Research.
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
    expect(groupWalk({ 1857: { market: "jita", basis: "sell" } })).toEqual({
      market: "jita",
      basis: "sell",
    });
  });

  it("climbs to an ancestor when the item's group says nothing", () => {
    expect(groupWalk({ 1849: { market: "amarr" } })).toEqual({
      market: "amarr",
      basis: null,
    });
  });

  // The rule every other rung uses, applied per field: a nearer group answers
  // what it names, and leaves what it does not to the one above.
  it("lets a nearer group outrank a further one, field by field", () => {
    const answer = groupWalk({
      1849: { market: "amarr", basis: "buy" },
      1857: { market: "hek" },
    });

    expect(answer).toEqual({ market: "hek", basis: "buy" });
  });

  it("answers nothing when no ancestor names anything", () => {
    expect(groupWalk({ 516: { market: "dodixie" } })).toEqual({
      market: null,
      basis: null,
    });
  });

  // An item can have a market group before the defaults map has loaded, and that
  // is a normal early state rather than a reason to throw on every row.
  it("answers nothing when the defaults have not loaded", () => {
    expect(resolveGroupDefault({ marketGroupID: 1857, marketGroups })).toEqual({
      market: null,
      basis: null,
    });
  });

  it("answers nothing for an item with no market group", () => {
    expect(
      resolveGroupDefault({
        marketGroupID: undefined,
        marketGroups,
        groupDefaults: { 1857: { market: "jita" } },
      }),
    ).toEqual({ market: null, basis: null });
  });

  it("reads an empty value as no choice, and keeps climbing", () => {
    expect(
      groupWalk({ 1857: { market: "", basis: "" }, 1855: { market: "hek" } }),
    ).toEqual({ market: "hek", basis: null });
  });

  // A cycle should not reach the published file, but this runs once per material
  // on every row, so it cannot be the thing that hangs the page.
  it("stops rather than circling a tree that points at itself", () => {
    const circular = { 1: { parent_id: 2 }, 2: { parent_id: 1 } };

    expect(
      resolveGroupDefault({
        marketGroupID: 1,
        marketGroups: circular,
        groupDefaults: { 99: { market: "jita" } },
      }),
    ).toEqual({ market: null, basis: null });
  });
});

describe("resolvePricingSideRungs", () => {
  const rungs = (jobPricing, side = PRICING_SIDE.BUYING) =>
    resolvePricingSideRungs({ jobPricing, accountPricing: account, side });

  it("names the job when the job answered", () => {
    const answer = rungs({ buying: { market: "hek", basis: "buy" } });

    expect(answer.marketRung).toBe(PRICING_RUNG.JOB);
    expect(answer.orderRung).toBe(PRICING_RUNG.JOB);
  });

  it("names the account when the job said nothing", () => {
    const answer = rungs(null);

    expect(answer.marketRung).toBe(PRICING_RUNG.ACCOUNT);
    expect(answer.orderRung).toBe(PRICING_RUNG.ACCOUNT);
  });

  // The rung is per axis for the same reason the value is: a job naming a market
  // and no basis has answered one question and left the other.
  it("names a rung per axis", () => {
    const answer = rungs({ buying: { market: "hek" } });

    expect(answer.marketRung).toBe(PRICING_RUNG.JOB);
    expect(answer.orderRung).toBe(PRICING_RUNG.ACCOUNT);
  });

  it("names the global default when nothing else did", () => {
    const answer = resolvePricingSideRungs({
      jobPricing: null,
      accountPricing: { buying: {}, selling: {} },
      side: PRICING_SIDE.BUYING,
    });

    expect(answer.marketRung).toBe(PRICING_RUNG.GLOBAL);
    expect(answer.orderRung).toBe(PRICING_RUNG.GLOBAL);
  });

  // Two functions answering the same ladder is exactly how a quoted total comes
  // to disagree with the row it quotes.
  it("resolves the same values resolvePricingSide does", () => {
    const job = { buying: { market: "dodixie" } };

    const { marketDisplay, orderDisplay } = rungs(job);
    expect({ marketDisplay, orderDisplay }).toEqual(
      resolvePricingSide({
        jobPricing: job,
        accountPricing: account,
        side: PRICING_SIDE.BUYING,
      }),
    );
  });
});

// A side's group table is the one place this project has already recorded a
// whole-value replacement destroying what sat beside it, so each of these is
// about what survives a write rather than what it sets.
describe("setGroupPricing", () => {
  const existing = {
    1857: { market: "jita", basis: "buy" },
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
    expect(next[1857]).toEqual({ market: "dodixie", basis: "buy" });
  });

  it("sets one field without disturbing the other", () => {
    expect(setGroupPricing(existing, 1996, "basis", "sell")[1996]).toEqual({
      market: "amarr",
      basis: "sell",
    });
  });

  it("builds a table where a side had none", () => {
    expect(setGroupPricing(undefined, 1857, "market", "jita")).toEqual({
      1857: { market: "jita" },
    });
  });

  // An entry naming nothing would be a row a reader can see and not use: the
  // walk reads an empty value as no choice, so it would answer nothing.
  it("drops a group once its last field is cleared", () => {
    const next = setGroupPricing(existing, 1996, "market", "");

    expect(next).not.toHaveProperty("1996");
    expect(next[1857]).toEqual({ market: "jita", basis: "buy" });
  });

  it("keeps a group that still names something", () => {
    expect(setGroupPricing(existing, 1857, "market", "")[1857]).toEqual({
      basis: "buy",
    });
  });

  // The side has to stop carrying `groups` at all, rather than an empty object
  // that reads as a table answering nothing.
  it("answers undefined once the last group goes", () => {
    const one = { 1857: { market: "jita" } };

    expect(setGroupPricing(one, 1857, "market", "")).toBeUndefined();
  });

  it("reads a cleared field as gone rather than as empty", () => {
    const next = setGroupPricing(existing, 1857, "basis", null);

    expect(next[1857]).toEqual({ market: "jita" });
    expect(next[1857]).not.toHaveProperty("basis", null);
  });

  // Group ids arrive as numbers from the tree and as strings from a stored
  // document; both have to reach the same entry.
  it("reaches the same entry whether the id is a number or a string", () => {
    const byString = setGroupPricing(existing, "1857", "market", "hek");

    expect(byString[1857]).toEqual({ market: "hek", basis: "buy" });
    expect(Object.keys(byString)).toHaveLength(2);
  });
});
