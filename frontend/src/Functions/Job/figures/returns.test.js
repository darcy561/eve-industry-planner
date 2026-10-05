import { describe, expect, it } from "vitest";

import { EXIT_ROUTE, calculateReturns } from "./returns";

const returns = (overrides = {}) =>
  calculateReturns({
    sellPrice: 100,
    buyPrice: 80,
    quantityProduced: 10,
    buildCost: 500,
    brokerFee: 30,
    salesTax: 70,
    ...overrides,
  });

const route = (result, id) => result.routes.find((r) => r.id === id);

describe("the two ways out", () => {
  it("charges a listing both the broker fee and the tax", () => {
    // 1000 revenue − 30 fee − 70 tax − 500 build
    expect(route(returns(), "listed").net).toBe(400);
  });

  it("charges selling into buy orders the tax only", () => {
    // Nothing is listed, so no broker fee: 800 − 70 − 500
    expect(route(returns(), "immediate").net).toBe(230);
  });

  it("states each route's revenue before what selling costs", () => {
    expect(route(returns(), "listed").revenue).toBe(1000);
    expect(route(returns(), "immediate").revenue).toBe(800);
  });

  it("picks neither as the one to lead with", () => {
    // A player selling only into buy orders would otherwise be shown a margin
    // that is not theirs, with nothing saying whose it was.
    const result = returns();

    expect(result.routes).toHaveLength(2);
    expect(result.net).toBeUndefined();
    expect(result.margin).toBeUndefined();
    expect(result.perUnit).toBeUndefined();
    for (const r of result.routes) {
      expect(r).toHaveProperty("net");
      expect(r).toHaveProperty("margin");
      expect(r).toHaveProperty("returnOnOutlay");
    }
  });
});

describe("the three normalisations of the net return", () => {
  it("states each route per unit produced", () => {
    expect(route(returns(), "listed").perUnit).toBe(40);
    expect(route(returns(), "immediate").perUnit).toBe(23);
  });

  it("states each route as a margin on its own revenue", () => {
    expect(route(returns(), "listed").margin).toBeCloseTo(0.4);
    expect(route(returns(), "immediate").margin).toBeCloseTo(0.2875);
  });

  it("states each route against what the build cost", () => {
    expect(route(returns(), "listed").returnOnOutlay).toBeCloseTo(0.8);
    expect(route(returns(), "immediate").returnOnOutlay).toBeCloseTo(0.46);
  });

  it("has no margin to state without revenue", () => {
    // Unanswerable rather than infinite, and an infinity would colour every
    // figure beside it.
    expect(route(returns({ sellPrice: 0 }), "listed").margin).toBeNull();
  });

  it("has no return on outlay to state without an outlay", () => {
    expect(
      route(returns({ buildCost: 0 }), "listed").returnOnOutlay,
    ).toBeNull();
  });
});

describe("break-even", () => {
  it("is what a unit must fetch to cover the build and the selling", () => {
    // (500 + 30 + 70) / 10
    expect(returns().breakEvenPerUnit).toBe(60);
  });

  it("has nothing to state for a job that produces nothing", () => {
    expect(returns({ quantityProduced: 0 }).breakEvenPerUnit).toBeNull();
  });
});

describe("a build that loses money", () => {
  it("says so with a negative net rather than clamping at zero", () => {
    const losing = route(returns({ sellPrice: 10 }), "listed");

    expect(losing.net).toBeLessThan(0);
    expect(losing.margin).toBeLessThan(0);
  });
});

// Break-even alone says what a unit must fetch. The headroom says how far
// today's price is above it, which is what makes the figure worth stating.
describe("headroom above break-even", () => {
  it("measures today's price against what a unit must fetch", () => {
    const returns = calculateReturns({
      sellPrice: 120,
      buyPrice: 100,
      quantityProduced: 10,
      buildCost: 800,
      brokerFee: 100,
      salesTax: 100,
    });

    // 1,000 of cost over 10 units is 100 to break even, against 120 today.
    expect(returns.breakEvenPerUnit).toBe(100);
    expect(returns.headroom.price).toBe(120);
    expect(returns.headroom.above).toBeCloseTo(0.2);
  });

  it("reports a price below break-even as negative headroom", () => {
    const returns = calculateReturns({
      sellPrice: 80,
      quantityProduced: 10,
      buildCost: 1000,
    });

    expect(returns.headroom.above).toBeCloseTo(-0.2);
  });

  it("has no headroom to state when nothing is produced", () => {
    expect(calculateReturns({ quantityProduced: 0 }).headroom).toBeNull();
  });
});

// A route's figure means little without the price it came from and what was
// taken off it.
describe("what each route was priced from", () => {
  it("carries its own unit price and what is deducted", () => {
    const { routes } = calculateReturns({
      sellPrice: 120,
      buyPrice: 100,
      quantityProduced: 10,
      buildCost: 800,
      brokerFee: 36,
      salesTax: 45,
    });

    const listed = routes.find((r) => r.id === "listed");
    const immediate = routes.find((r) => r.id === "immediate");

    expect(listed.unitPrice).toBe(120);
    expect(listed.deducts).toBe("less fee and tax");
    expect(immediate.unitPrice).toBe(100);
    // Nothing is listed, so no broker fee is charged on this route.
    expect(immediate.deducts).toBe("less tax");
  });
});

// A hub with no orders on a side reports a price of zero, and a real order can
// never be zero — EVE will not accept one. Without marking that, a build nobody
// is trading reads as a total loss of everything it cost rather than as an
// item with no market where it is being sold.
describe("a hub holding no orders", () => {
  it("marks the route priced from the empty side", () => {
    const returns = calculateReturns({
      sellPrice: 0,
      buyPrice: 851_600_000,
      quantityProduced: 1,
      buildCost: 155_000_000_000,
    });

    const listed = returns.routes.find(
      (route) => route.id === EXIT_ROUTE.LISTED,
    );
    const immediate = returns.routes.find(
      (route) => route.id === EXIT_ROUTE.IMMEDIATE,
    );

    expect(listed.hasNoOrders).toBe(true);
    expect(immediate.hasNoOrders).toBe(false);
  });

  it("says so of the whole job only when neither side holds anything", () => {
    const oneSide = calculateReturns({
      sellPrice: 0,
      buyPrice: 851_600_000,
      quantityProduced: 1,
      buildCost: 100,
    });
    const neither = calculateReturns({
      sellPrice: 0,
      buyPrice: 0,
      quantityProduced: 1,
      buildCost: 100,
    });

    expect(oneSide.hasNoOrders).toBe(false);
    expect(neither.hasNoOrders).toBe(true);
  });

  it("leaves a priced route unmarked", () => {
    const returns = calculateReturns({
      sellPrice: 900_000_000,
      buyPrice: 851_600_000,
      quantityProduced: 1,
      buildCost: 100,
    });

    expect(returns.routes.every((route) => route.hasNoOrders)).toBe(false);
    expect(returns.hasNoOrders).toBe(false);
  });
});
