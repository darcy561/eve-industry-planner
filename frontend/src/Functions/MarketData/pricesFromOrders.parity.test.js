/**
 * Holds this derivation and the server's together.
 *
 * The fixture is written from the server's own `buildMarketPriceEntry` by
 * `services/worker/tasks/esi/derivation_parity_test.go`, so the cases here state
 * what the running server does rather than what this side believes. A change to
 * either derivation without the other fails here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pricesByType } from "./pricesFromOrders.js";

// Resolved from the working directory, as the hub parity test does: the suite
// runs from frontend/, and the fixture is the repo's rather than the SPA's.
const FIXTURE = resolve(
  process.cwd(),
  "../testing/fixtures/market-derivation/orders.json",
);

const REGENERATE =
  "EIP_UPDATE_MARKET_DERIVATION=1 go test ./worker/tasks/esi/ -run TestTheDerivationIsCurrent";

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

describe("deriving the four prices as the server does", () => {
  it("has a fixture to check against", () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases.map((c) => [c.name, c]))("%s", (_name, testCase) => {
    // Through the derivation the app runs, not one written beside it: a parity
    // fixture checking a function no price passes through proves nothing.
    const got = pricesByType(testCase.orders, testCase.stationID).get(
      String(testCase.typeID),
    );

    expect(got, `${testCase.why}\nRegenerate with: ${REGENERATE}`).toEqual(
      testCase.expected,
    );
  });
});

/**
 * The fixture only proves agreement, and two sides can agree on a rule neither
 * applies. These name the rules the cases were chosen for, so a fixture that
 * stopped covering one is visible here rather than silently weaker.
 */
describe("the rules the fixture exists to cover", () => {
  const byName = Object.fromEntries(fixture.cases.map((c) => [c.name, c]));

  it("covers enough orders for the rank to leave the extreme", () => {
    const large = byName["enough orders for the rank to leave the extreme"];

    expect(large).toBeDefined();
    expect(large.expected.buyP95).not.toBe(large.expected.buy);
    expect(large.expected.sellP05).not.toBe(large.expected.sell);
  });

  // The reason a figure other than the best price exists at all.
  it("covers an outlier that moves the best price and not the percentile", () => {
    const trimmed = byName["outliers the percentile is there to trim"];

    expect(trimmed).toBeDefined();
    expect(trimmed.expected.buyP95).toBeLessThan(trimmed.expected.buy);
    expect(trimmed.expected.sellP05).toBeGreaterThan(trimmed.expected.sell);
  });

  it("covers orders at another station in the same region", () => {
    const filtered = byName["orders at another station in the same region"];

    expect(filtered).toBeDefined();
    const foreign = filtered.orders.filter(
      (o) => String(o.location_id) !== String(filtered.stationID),
    );
    expect(foreign.length).toBeGreaterThan(0);
  });

  it("covers too few orders for the percentile", () => {
    const small = byName["too few orders for the percentile"];

    expect(small).toBeDefined();
    expect(small.expected.buyP95).toBe(small.expected.buy);
  });

  it("covers a side with no orders at all", () => {
    const oneSided = byName["only sell orders"];

    expect(oneSided).toBeDefined();
    expect(oneSided.expected.buy).toBe(0);
    expect(oneSided.expected.sell).toBeGreaterThan(0);
  });
});

/**
 * What the fixture cannot carry, because the server never sees it: the browser
 * reads ESI directly, so it meets shapes the Go accumulator is never handed.
 */
describe("what only this side has to survive", () => {
  // Absent rather than zero: a type nothing is trading is not a type priced at
  // nothing, and every reader of the map turns absence into "no price held".
  it("holds nothing for a market with no orders on it", () => {
    expect(pricesByType([], 60003760).size).toBe(0);
    expect(pricesByType(undefined, 60003760).size).toBe(0);
  });

  it("prices each type on the market apart from the others", () => {
    const orders = [
      { price: 10, type_id: 34, is_buy_order: false, location_id: 1 },
      { price: 25, type_id: 35, is_buy_order: false, location_id: 1 },
    ];

    const priced = pricesByType(orders, 1);

    expect(priced.get("34").sell).toBe(10);
    expect(priced.get("35").sell).toBe(25);
  });

  // A region's orders cover every station in it, so a caller that skipped this
  // would price the wrong market.
  it("counts only the orders at the location asked about", () => {
    const orders = [
      { price: 10, type_id: 34, is_buy_order: false, location_id: 60003760 },
      { price: 1, type_id: 34, is_buy_order: false, location_id: 60004588 },
    ];

    expect(pricesByType(orders, 60003760).get("34").sell).toBe(10);
  });

  // ESI ids arrive as numbers and a saved location may be held as a string;
  // comparing them raw would price an empty market.
  it("matches a location whether it is given as a number or a string", () => {
    const orders = [
      { price: 10, type_id: 34, is_buy_order: true, location_id: 60003760 },
      { price: 20, type_id: 34, is_buy_order: false, location_id: 60003760 },
    ];

    expect(pricesByType(orders, "60003760").get("34")).toEqual(
      pricesByType(orders, 60003760).get("34"),
    );
    expect(pricesByType(orders, "60003760").get("34").buy).toBe(10);
  });

  // A malformed order must not become a price of NaN, which would spread
  // through every figure derived from it.
  it("ignores an order carrying no usable price", () => {
    const orders = [
      { price: 10, type_id: 34, is_buy_order: true, location_id: 1 },
      { price: null, type_id: 34, is_buy_order: true, location_id: 1 },
      { price: "twelve", type_id: 34, is_buy_order: true, location_id: 1 },
      { type_id: 34, is_buy_order: true, location_id: 1 },
    ];

    expect(pricesByType(orders, 1).get("34").buy).toBe(10);
  });
});
