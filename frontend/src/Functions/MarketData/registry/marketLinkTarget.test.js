import { describe, expect, it } from "vitest";

import { resolveMarketLinkTarget } from "./marketLinkTarget";
import { PRICING_SIDE } from "../defaults/pricingSide.js";

const accountPricing = {
  buying: { market: "amarr", orderType: "sell" },
  selling: { market: "hek", orderType: "buy" },
};

const resolve = (given, side = PRICING_SIDE.BUYING, needsRegion = false) =>
  resolveMarketLinkTarget({ given, side, accountPricing, needsRegion });

describe("resolveMarketLinkTarget", () => {
  it("takes the market a caller gives as a row", () => {
    const given = { id: "dodixie", regionID: 10000032 };

    expect(resolve(given)).toBe(given);
  });

  it("looks up a market a caller gives as an id", () => {
    expect(resolve("dodixie")).toMatchObject({ id: "dodixie" });
  });

  it("does not consult the default for an id it was given", () => {
    expect(resolve("dodixie").id).toBe("dodixie");
  });

  it("falls back to the account default for the side asked", () => {
    expect(resolve(undefined, PRICING_SIDE.BUYING)).toMatchObject({
      id: "amarr",
    });
    expect(resolve(undefined, PRICING_SIDE.SELLING)).toMatchObject({
      id: "hek",
    });
  });

  it("answers nothing where the default names no market the list carries", () => {
    expect(
      resolveMarketLinkTarget({
        given: null,
        side: PRICING_SIDE.BUYING,
        accountPricing: { buying: { market: "a-citadel" } },
      }),
    ).toBeUndefined();
  });

  it("opens the default region instead, where the caller needs one", () => {
    const answer = resolveMarketLinkTarget({
      given: null,
      side: PRICING_SIDE.BUYING,
      accountPricing: { buying: { market: "a-citadel" } },
      needsRegion: true,
    });

    expect(answer).toMatchObject({ regionID: 10000002 });
  });

  it("keeps the account's own market where the list carries it", () => {
    expect(resolve(undefined, PRICING_SIDE.BUYING, true)).toMatchObject({
      id: "amarr",
    });
  });
});
