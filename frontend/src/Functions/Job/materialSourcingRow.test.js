import { describe, expect, it } from "vitest";

import JobMaterial from "../../Classes/jobMaterial";
import {
  MATERIAL_PLAN,
  buildMaterialSourcingRow,
  hasSavingAvailable,
  priceDelta,
  summariseSourcing,
} from "./materialSourcingRow";

const material = (required, { purchasing = [], volume = 0.01 } = {}) =>
  new JobMaterial(
    { typeID: 34, name: "Tritanium", volume, purchasing },
    required,
  );

const row = (overrides = {}) =>
  buildMaterialSourcingRow({
    material: material(1000),
    buyPrice: 10,
    buildPrice: 8,
    isBuildable: true,
    isLinked: false,
    ...overrides,
  });

describe("priceDelta", () => {
  it("is negative when building is cheaper", () => {
    expect(priceDelta(10, 8)).toBeCloseTo(-0.2);
  });

  it("is positive when building costs more", () => {
    expect(priceDelta(10, 12)).toBeCloseTo(0.2);
  });

  it("has nothing to say without both figures", () => {
    expect(priceDelta(10, null)).toBeNull();
    expect(priceDelta(null, 8)).toBeNull();
  });

  it("has nothing to say when the market price is zero", () => {
    // Dividing by it would report an infinite saving on a material the market
    // has no price for.
    expect(priceDelta(0, 8)).toBeNull();
  });
});

describe("a material row", () => {
  it("states both prices and the comparison between them", () => {
    expect(row()).toMatchObject({
      buyPrice: 10,
      buildPrice: 8,
      delta: -0.2,
      quantity: 1000,
    });
  });

  it("carries the volume the quantity occupies, not the unit volume", () => {
    expect(
      row({ material: material(1000, { volume: 0.01 }) }).volume,
    ).toBeCloseTo(10);
  });

  describe("what the plan column says", () => {
    it("says build when child jobs are linked and there is a cost", () => {
      expect(row({ isLinked: true }).plan).toBe(MATERIAL_PLAN.BUILD);
    });

    it("says buy when it could be built but is not", () => {
      expect(row({ isLinked: false }).plan).toBe(MATERIAL_PLAN.BUY);
    });

    it("says base when the material has no blueprint to build from", () => {
      const base = row({ isBuildable: false, buildPrice: null });

      expect(base.plan).toBe(MATERIAL_PLAN.BASE);
      expect(base.buildPrice).toBeNull();
      expect(base.delta).toBeNull();
    });

    it("says paid once the material is bought in full", () => {
      const bought = material(1000, {
        purchasing: [{ id: "p1", itemCount: 1000, itemCost: 9 }],
      });

      expect(row({ material: bought, isLinked: true }).plan).toBe(
        MATERIAL_PLAN.PAID,
      );
    });

    it("still says buy when only part of it has been bought", () => {
      const partly = material(1000, {
        purchasing: [{ id: "p1", itemCount: 400, itemCost: 9 }],
      });

      expect(row({ material: partly }).plan).toBe(MATERIAL_PLAN.BUY);
    });
  });

  it("does not offer a build price of zero as a comparison", () => {
    // A child job that costs nothing has not been costed, and showing it as free
    // would make every material look cheaper to build.
    const free = row({ buildPrice: 0, isLinked: true });

    expect(free.buildPrice).toBeNull();
    expect(free.delta).toBeNull();
    expect(free.plan).toBe(MATERIAL_PLAN.BUY);
  });
});

describe("the summary above and below the table", () => {
  const rows = [
    row({ buyPrice: 10, buildPrice: 8, isLinked: false }), // cheaper to build
    row({ buyPrice: 100, buildPrice: 90, isLinked: false }), // cheaper to build
    row({ buyPrice: 10, buildPrice: 12, isLinked: false }), // dearer to build
    row({ isBuildable: false, buildPrice: null }), // nothing to compare
  ];

  it("counts what the list holds", () => {
    expect(summariseSourcing(rows)).toMatchObject({
      materials: 4,
      buildable: 3,
      linked: 0,
    });
  });

  it("totals what switching the cheaper rows would save", () => {
    // (10−8)×1000 + (100−90)×1000
    expect(summariseSourcing(rows)).toMatchObject({
      cheaperToBuild: 2,
      savingAvailable: 12000,
    });
  });

  it("does not offer a saving on a row that is already building", () => {
    const building = [row({ buyPrice: 10, buildPrice: 8, isLinked: true })];

    expect(summariseSourcing(building)).toMatchObject({
      cheaperToBuild: 0,
      savingAvailable: 0,
    });
  });

  it("does not offer a saving on a row that has been paid for", () => {
    const bought = material(1000, {
      purchasing: [{ id: "p1", itemCount: 1000, itemCost: 9 }],
    });
    const paid = [row({ material: bought, buyPrice: 10, buildPrice: 8 })];

    expect(summariseSourcing(paid)).toMatchObject({
      cheaperToBuild: 0,
      savingAvailable: 0,
    });
  });

  it("adds the volume of every row", () => {
    expect(summariseSourcing(rows).volume).toBeCloseTo(40);
  });

  it("copes with no materials at all", () => {
    expect(summariseSourcing([])).toMatchObject({
      materials: 0,
      savingAvailable: 0,
      volume: 0,
    });
    expect(summariseSourcing(undefined).materials).toBe(0);
  });
});

describe("a row stating one setup's requirement", () => {
  it("uses the quantity it is given rather than the job's own", () => {
    // Raw Resources let a player see the selected setup's need instead of the
    // whole job's, and that choice came with it into this panel.
    const stated = row({ material: material(1000), quantity: 250 });

    expect(stated.quantity).toBe(250);
  });

  it("falls back to the job's requirement when none is given", () => {
    expect(row({ material: material(1000) }).quantity).toBe(1000);
  });

  it("counts the volume of what it states, not of the whole job", () => {
    const stated = row({
      material: material(1000, { volume: 0.01 }),
      quantity: 250,
    });

    expect(stated.volume).toBeCloseTo(2.5);
  });
});

describe("what a row can and cannot say at once", () => {
  it("cannot be priced to build and planned to buy in the same breath", () => {
    // A build price only exists once child jobs are linked, and being linked
    // makes the plan Build — so no row reaches the state the offer above the
    // table looks for. Speculative child jobs are what break the tie, and they
    // are Stage G's. Until then the offer is inert by construction.
    const linkedAndCheaper = row({
      isLinked: true,
      buildPrice: 8,
      buyPrice: 10,
    });

    expect(linkedAndCheaper.plan).toBe(MATERIAL_PLAN.BUILD);
    expect(hasSavingAvailable(linkedAndCheaper)).toBe(false);

    const notLinked = row({ isLinked: false, buildPrice: null });

    expect(notLinked.plan).toBe(MATERIAL_PLAN.BUY);
    expect(hasSavingAvailable(notLinked)).toBe(false);
  });
});

// Stage G's whole point: a row can be priced to build and still planned to buy.
// Before speculative jobs existed, a build price only came from linked children,
// and being linked made the plan Build — so no row was ever both, and the offer
// to switch could never fire.
describe("a speculatively costed row", () => {
  it("carries a build price without being planned to build", () => {
    const row = buildMaterialSourcingRow({
      material: { typeID: 34, name: "Tritanium", quantity: 100, volume: 0.01 },
      buyPrice: 5.4,
      buildPrice: 4.95,
      isBuildable: true,
      isLinked: false,
      isSpeculative: true,
    });

    expect(row.buildPrice).toBe(4.95);
    expect(row.plan).toBe(MATERIAL_PLAN.BUY);
    expect(row.isSpeculative).toBe(true);
    expect(row.delta).toBeLessThan(0);
  });

  it("is offered as a saving, which a linked row is not", () => {
    const speculative = buildMaterialSourcingRow({
      material: { typeID: 34, name: "Tritanium", quantity: 100, volume: 0.01 },
      buyPrice: 5.4,
      buildPrice: 4.95,
      isBuildable: true,
      isLinked: false,
      isSpeculative: true,
    });
    const linked = buildMaterialSourcingRow({
      material: { typeID: 34, name: "Tritanium", quantity: 100, volume: 0.01 },
      buyPrice: 5.4,
      buildPrice: 4.95,
      isBuildable: true,
      isLinked: true,
    });

    expect(hasSavingAvailable(speculative)).toBe(true);
    expect(hasSavingAvailable(linked)).toBe(false);
  });

  it("is not speculative by default", () => {
    const row = buildMaterialSourcingRow({
      material: { typeID: 34, name: "Tritanium", quantity: 100, volume: 0.01 },
      buyPrice: 5.4,
      buildPrice: null,
      isBuildable: true,
      isLinked: false,
    });

    expect(row.isSpeculative).toBe(false);
  });
});

// A part-paid row is still on Buy, so it counts toward the offer — but only the
// units nobody has bought yet can move to a build plan, and the offer has to be
// a figure applying the change can actually deliver.
it("offers a saving only on the part of a row still to source", () => {
  const summary = summariseSourcing([
    {
      typeID: 34,
      plan: MATERIAL_PLAN.BUY,
      isLinked: false,
      buyPrice: 10,
      buildPrice: 8,
      quantity: 100,
      remainingQuantity: 40,
      volume: 0,
    },
  ]);

  expect(summary.savingAvailable).toBe(80);
  expect(summary.cheaperToBuild).toBe(1);
});

// A row has a blueprint long before anything works out what building it would
// cost, so these two counts have to be able to disagree. Counting buildable
// rows by whether they carried a price made the panel state "2 of 1": the
// banner counted rows waiting for a price, and the total counted rows that
// already had one, which are sets that cannot overlap.
it("counts a row with a blueprint as buildable before it has been costed", () => {
  const withBlueprint = (typeID, buildPrice) => ({
    typeID,
    plan: MATERIAL_PLAN.BUY,
    isBuildable: true,
    isLinked: false,
    buyPrice: 100,
    buildPrice,
    quantity: 1,
    volume: 0,
  });

  const summary = summariseSourcing([
    withBlueprint(1, 80),
    withBlueprint(2, null),
    withBlueprint(3, null),
    {
      typeID: 34,
      plan: MATERIAL_PLAN.BASE,
      isBuildable: false,
      isLinked: false,
      buyPrice: 5,
      buildPrice: null,
      quantity: 1,
      volume: 0,
    },
  ]);

  expect(summary.buildable).toBe(3);
  expect(summary.costed).toBe(1);
  // What the banner states, and the reason this test exists.
  expect(summary.buildable - summary.costed).toBe(2);
});
