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
import { deriveBookPrices } from "./deriveBookPrices.js";

// Resolved from the working directory, as the hub parity test does: the suite
// runs from frontend/, and the fixture is the repo's rather than the SPA's.
const FIXTURE = resolve(
  process.cwd(),
  "../testing/fixtures/market-derivation/books.json",
);

const REGENERATE =
  "EIP_UPDATE_MARKET_DERIVATION=1 go test ./worker/tasks/esi/ -run TestTheDerivationIsCurrent";

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

describe("deriving the four prices as the server does", () => {
  it("has a fixture to check against", () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases.map((c) => [c.name, c]))("%s", (_name, testCase) => {
    const got = deriveBookPrices(testCase.orders, testCase.stationID);

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

  it("covers a book large enough for the rank to leave the extreme", () => {
    const large =
      byName["a book large enough for the rank to leave the extreme"];

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

  it("covers a book too small for the percentile", () => {
    const small = byName["a book under the percentile floor"];

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
  it("answers zero for a book with nothing in it", () => {
    expect(deriveBookPrices([], 60003760)).toEqual({
      buy: 0,
      sell: 0,
      buyP95: 0,
      sellP05: 0,
    });
  });

  it("answers zero when nothing was returned at all", () => {
    expect(deriveBookPrices(undefined, 60003760)).toEqual({
      buy: 0,
      sell: 0,
      buyP95: 0,
      sellP05: 0,
    });
  });

  // ESI ids arrive as numbers and a saved location may be held as a string;
  // comparing them raw would price an empty book.
  it("matches a location whether it is given as a number or a string", () => {
    const orders = [
      { price: 10, is_buy_order: true, location_id: 60003760 },
      { price: 20, is_buy_order: false, location_id: 60003760 },
    ];

    expect(deriveBookPrices(orders, "60003760")).toEqual(
      deriveBookPrices(orders, 60003760),
    );
    expect(deriveBookPrices(orders, "60003760").buy).toBe(10);
  });

  // A malformed order must not become a price of NaN, which would spread
  // through every figure derived from it.
  it("ignores an order carrying no usable price", () => {
    const orders = [
      { price: 10, is_buy_order: true, location_id: 1 },
      { price: null, is_buy_order: true, location_id: 1 },
      { price: "twelve", is_buy_order: true, location_id: 1 },
      { is_buy_order: true, location_id: 1 },
    ];

    expect(deriveBookPrices(orders, 1).buy).toBe(10);
  });
});
