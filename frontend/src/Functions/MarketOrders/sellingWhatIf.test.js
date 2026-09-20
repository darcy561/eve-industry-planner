import { describe, expect, it } from "vitest";

import { sellingWhatIf } from "./sellingWhatIf";
import { SALE_LOCATION_KIND } from "./saleLocations";

const stationFee = {
  kind: SALE_LOCATION_KIND.NPC_STATION,
  base: 3,
  rate: 2.4,
  terms: [
    { id: "brokerRelations", label: "Broker Relations", amount: 0.6, level: 2 },
    { id: "faction", label: "Faction standing", amount: 0, level: 0 },
    { id: "corporation", label: "Corporation standing", amount: 0, level: 0 },
  ],
};

const salesTax = { base: 7.5, accounting: 0, rate: 7.5 };

const ask = (proposed, overrides = {}) =>
  sellingWhatIf({
    brokerFee: stationFee,
    salesTax,
    listedValue: 1_000_000,
    quantity: 100,
    proposed,
    ...overrides,
  });

describe("sellingWhatIf", () => {
  it("states the rate a higher Broker Relations would give", () => {
    const got = ask({ brokerRelations: 5, accounting: 0 });

    // Base 3% less 0.3 a level.
    expect(got.brokerFee.rate).toBeCloseTo(1.5);
    expect(got.brokerFee.saved).toBeCloseTo(9000);
  });

  // Standings are the same character's whatever level is imagined, so they must
  // survive the recalculation rather than being dropped from it.
  it("keeps the standings the rate already accounted for", () => {
    const withStandings = {
      ...stationFee,
      rate: 2.25,
      terms: [
        { id: "brokerRelations", amount: 0.6, level: 2 },
        { id: "faction", amount: 0.15, level: 5 },
        { id: "corporation", amount: 0, level: 0 },
      ],
    };

    const got = sellingWhatIf({
      brokerFee: withStandings,
      salesTax,
      listedValue: 1_000_000,
      quantity: 100,
      proposed: { brokerRelations: 5, accounting: 0 },
    });

    // 3 − 1.5 − 0.15, not 3 − 1.5.
    expect(got.brokerFee.rate).toBeCloseTo(1.35);
  });

  // Accounting takes a share of the base rather than subtracting from it, which
  // is what puts the rate at 3.375% rather than 6.95% at level V.
  it("reduces sales tax multiplicatively", () => {
    const got = ask({ brokerRelations: 2, accounting: 5 });

    expect(got.salesTax.rate).toBeCloseTo(3.375);
    expect(got.salesTax.saved).toBeCloseTo(41250);
  });

  it("adds both savings together", () => {
    const got = ask({ brokerRelations: 5, accounting: 5 });

    expect(got.saved).toBeCloseTo(got.brokerFee.saved + got.salesTax.saved);
  });

  // A market skill leaves the build cost alone, so the whole saving lands on the
  // return and break-even falls by its share of a unit.
  it("states what each unit would no longer have to fetch", () => {
    const got = ask({ brokerRelations: 5, accounting: 0 });

    expect(got.breakEvenPerUnit).toBeCloseTo(90);
  });

  it("has no per-unit answer when nothing is being sold", () => {
    expect(
      ask({ brokerRelations: 5, accounting: 0 }, { quantity: 0 })
        .breakEvenPerUnit,
    ).toBeNull();
  });

  // A structure's fee is its owner's, so training the skill changes nothing
  // there — and the panel says so rather than quoting a saving that is not real.
  it("saves nothing on a structure's broker fee", () => {
    const got = sellingWhatIf({
      brokerFee: {
        kind: SALE_LOCATION_KIND.CITADEL,
        base: null,
        rate: 1.5,
        terms: [],
      },
      salesTax,
      listedValue: 1_000_000,
      quantity: 100,
      proposed: { brokerRelations: 5, accounting: 0 },
    });

    expect(got.brokerFeeApplies).toBe(false);
    expect(got.brokerFee.saved).toBe(0);
    expect(got.saved).toBe(0);
  });

  // Untraining is not a thing a player does, but the control allows any level
  // and a lower one must read as costing more rather than saving a negative.
  it("reports a lower level as costing more", () => {
    const got = ask({ brokerRelations: 0, accounting: 0 });

    expect(got.brokerFee.saved).toBeLessThan(0);
  });
});

// The game charges 100 ISK however small the order is, so on a cheap listing a
// better skill buys nothing — and a saving that cannot be realised must not be
// offered as a reason to train.
describe("against the broker fee floor", () => {
  const cheap = (proposed) =>
    sellingWhatIf({
      brokerFee: stationFee,
      salesTax,
      listedValue: 1000,
      quantity: 10,
      proposed,
    });

  it("reports no fee saving when both levels land on the floor", () => {
    const got = cheap({ brokerRelations: 5, accounting: 0 });

    // 2.4% and 1.5% of 1,000 are both under 100 ISK.
    expect(got.brokerFee.amount).toBe(100);
    expect(got.brokerFee.saved).toBe(0);
  });

  it("counts only the part above the floor when one side clears it", () => {
    const got = sellingWhatIf({
      brokerFee: stationFee,
      salesTax,
      listedValue: 5000,
      quantity: 10,
      proposed: { brokerRelations: 5, accounting: 0 },
    });

    // 2.4% of 5,000 is 120; 1.5% is 75, which the floor lifts to 100.
    expect(got.brokerFee.saved).toBeCloseTo(20);
  });

  it("still reports the tax saving when the fee is floored", () => {
    const got = cheap({ brokerRelations: 5, accounting: 5 });

    expect(got.brokerFee.saved).toBe(0);
    expect(got.salesTax.saved).toBeGreaterThan(0);
    expect(got.saved).toBeCloseTo(got.salesTax.saved);
  });
});
