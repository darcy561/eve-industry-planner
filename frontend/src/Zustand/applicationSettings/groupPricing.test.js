import { describe, expect, it } from "vitest";

import useUsersStore from "../usersStore";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide";

const pricing = () =>
  useUsersStore.getState().applicationSettings.defaultPricing;

const seed = (defaultPricing) =>
  useUsersStore.setState((state) => ({
    ...state,
    applicationSettings: { ...state.applicationSettings, defaultPricing },
  }));

const act = (...args) =>
  useUsersStore
    .getState()
    .applicationSettings.actions.updateGroupPricingDefault(...args);

// The side's own market and basis sit beside its group table, and this project
// has already lost a field once by replacing a whole side to fill part of it.
describe("setting a market group's pricing", () => {
  it("keeps the side's own choices", () => {
    seed({
      buying: { market: "jita", basis: "sell" },
      selling: { market: "amarr", exit: "listed" },
    });

    act(PRICING_SIDE.BUYING, 1857, "market", "hek");

    expect(pricing().buying).toEqual({
      market: "jita",
      basis: "sell",
      groups: { 1857: { market: "hek" } },
    });
  });

  it("leaves the other side alone", () => {
    seed({
      buying: { market: "jita", basis: "sell" },
      selling: { market: "amarr", exit: "listed" },
    });

    act(PRICING_SIDE.BUYING, 1857, "market", "hek");

    expect(pricing().selling).toEqual({ market: "amarr", exit: "listed" });
  });

  it("holds a group per side rather than one between them", () => {
    seed({
      buying: { market: "jita", basis: "sell" },
      selling: { market: "amarr", exit: "listed" },
    });

    act(PRICING_SIDE.BUYING, 1857, "market", "hek");
    act(PRICING_SIDE.SELLING, 1857, "market", "dodixie");

    expect(pricing().buying.groups).toEqual({ 1857: { market: "hek" } });
    expect(pricing().selling.groups).toEqual({ 1857: { market: "dodixie" } });
  });

  it("keeps other groups when one changes", () => {
    seed({
      buying: {
        market: "jita",
        basis: "sell",
        groups: { 1857: { market: "hek" }, 1996: { basis: "buy" } },
      },
      selling: { market: "amarr", exit: "listed" },
    });

    act(PRICING_SIDE.BUYING, 1857, "basis", "buyP95");

    expect(pricing().buying.groups).toEqual({
      1857: { market: "hek", basis: "buyP95" },
      1996: { basis: "buy" },
    });
  });

  // The side must stop carrying `groups` rather than hold an empty table, which
  // would be persisted and read back as a table answering nothing.
  it("drops the table once the last group goes, keeping the side", () => {
    seed({
      buying: {
        market: "jita",
        basis: "sell",
        groups: { 1857: { market: "hek" } },
      },
      selling: { market: "amarr", exit: "listed" },
    });

    act(PRICING_SIDE.BUYING, 1857, "market", "");

    expect(pricing().buying).toEqual({ market: "jita", basis: "sell" });
    expect(pricing().buying).not.toHaveProperty("groups");
  });
});
