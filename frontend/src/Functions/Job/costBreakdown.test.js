import { describe, expect, it } from "vitest";

import { MATERIAL_PLAN } from "./materialSourcingRow";
import { buildCostBreakdown } from "./costBreakdown";

/** A row as useMaterialsSourcing builds one: what is left to source is on it. */
const row = ({ quantity = 100, paidQuantity = 0, ...overrides } = {}) => ({
  quantity,
  remainingQuantity: quantity - paidQuantity,
  buyPrice: 10,
  buildPrice: null,
  paidCost: 0,
  plan: MATERIAL_PLAN.BUY,
  ...overrides,
});

const lineValue = (band, id) =>
  band.lines.find((line) => line.id === id)?.value;

const lineDetail = (band, id) =>
  band.lines.find((line) => line.id === id)?.detail;

describe("what a build costs", () => {
  it("prices a bought material at the market", () => {
    const cost = buildCostBreakdown({ rows: [row()] });

    expect(lineValue(cost.toBuild, "bought")).toBe(1000);
  });

  it("prices a built material at what building it costs", () => {
    const cost = buildCostBreakdown({
      rows: [row({ plan: MATERIAL_PLAN.BUILD, buildPrice: 8 })],
    });

    expect(lineValue(cost.toBuild, "built")).toBe(800);
  });

  it("counts a built material once, not in both lines", () => {
    // A child's own unit cost replaces the market price rather than adding to
    // it, so a linked material contributes nothing to the market line.
    const cost = buildCostBreakdown({
      rows: [row({ plan: MATERIAL_PLAN.BUILD, buildPrice: 8 })],
    });

    expect(lineValue(cost.toBuild, "bought")).toBeUndefined();
    expect(cost.toBuild.total).toBe(800);
  });

  it("counts what was paid for a material already bought, not an estimate", () => {
    const cost = buildCostBreakdown({
      rows: [
        row({
          plan: MATERIAL_PLAN.PAID,
          paidQuantity: 100,
          paidCost: 940,
          buyPrice: 10,
        }),
      ],
    });

    expect(lineValue(cost.toBuild, "paid")).toBe(940);
    expect(lineValue(cost.toBuild, "bought")).toBeUndefined();
  });

  it("adds the job's own install cost and its extras", () => {
    const cost = buildCostBreakdown({
      rows: [],
      installCost: 500,
      extras: [{ id: "a", categoryLabel: "Hauling", extraValue: 250 }],
    });

    expect(cost.toBuild.total).toBe(750);
  });
});

describe("what selling it costs", () => {
  it("is its own band, because it is only paid on listing", () => {
    const cost = buildCostBreakdown({
      rows: [row()],
      brokerFee: 300,
      salesTax: 700,
    });

    expect(cost.toSell.total).toBe(1000);
    expect(cost.toBuild.total).toBe(1000);
    expect(cost.total).toBe(2000);
  });

  it("is absent when nothing is being charged for it", () => {
    // Stage H has a job with parents never listing its output at all.
    const cost = buildCostBreakdown({ rows: [row()] });

    expect(cost.toSell.lines).toHaveLength(0);
    expect(cost.toSell.total).toBe(0);
  });
});

describe("the figures a panel leads with", () => {
  it("divides the whole cost by what the job makes", () => {
    const cost = buildCostBreakdown({
      rows: [row()],
      brokerFee: 500,
      quantityProduced: 10,
    });

    expect(cost.perUnit).toBe(150);
  });

  it("has no per-unit cost to state for a job that makes nothing", () => {
    // Unanswerable rather than zero, the same as every other ratio here.
    const cost = buildCostBreakdown({ rows: [row()], quantityProduced: 0 });

    expect(cost.perUnit).toBeNull();
  });
});

describe("what a breakdown leaves out", () => {
  it("states only the parts that are actually there", () => {
    // Listing every part a build could have had, at zero, reads as a figure
    // rather than as an absence.
    const cost = buildCostBreakdown({ rows: [row()], installCost: 100 });

    expect(cost.toBuild.lines.map((line) => line.id)).not.toContain("built");
    expect(cost.toBuild.lines.map((line) => line.id)).not.toContain("paid");
  });

  // The one exception, and it is deliberate: a build with no extras recorded is
  // the common case, so the row is the only thing telling a reader the stage
  // takes them at all.
  it("keeps the extras row even at zero, as an invitation", () => {
    const cost = buildCostBreakdown({ rows: [row()], installCost: 100 });
    const extras = cost.toBuild.lines.find((line) => line.id === "extras");

    expect(extras.value).toBe(0);
    expect(extras.detail).toMatch(/Hauling/);
  });

  it("drops the invitation once there is a figure to state instead", () => {
    const cost = buildCostBreakdown({
      rows: [row()],
      extras: [
        {
          id: "a",
          categoryLabel: "Hauling",
          extraText: "Courier",
          extraValue: 500,
        },
      ],
    });

    expect(
      cost.toBuild.lines.find((line) => line.id === "extras"),
    ).toBeUndefined();
    expect(
      cost.toBuild.lines.find((line) => line.id === "extras:a").value,
    ).toBe(500);
  });

  it("costs nothing for a job with no materials at all", () => {
    const cost = buildCostBreakdown({ rows: [] });

    expect(cost.total).toBe(0);
    expect(cost.toBuild.lines.map((line) => line.id)).toEqual(["extras"]);
  });
});

describe("what each line says about itself", () => {
  it("says how much of the list the market line covers", () => {
    const cost = buildCostBreakdown({
      rows: [row(), row(), row({ plan: MATERIAL_PLAN.BUILD, buildPrice: 8 })],
    });

    expect(lineDetail(cost.toBuild, "bought")).toBe(
      "2 of 3 · 1 replaced by child builds",
    );
  });

  it("does not mention child builds where there are none", () => {
    const cost = buildCostBreakdown({ rows: [row(), row()] });

    expect(lineDetail(cost.toBuild, "bought")).toBe("2 of 2");
  });

  it("carries the rates behind the selling figures", () => {
    const cost = buildCostBreakdown({
      rows: [row()],
      brokerFee: 100,
      salesTax: 200,
      sellDetail: {
        brokerFee: "1.5% at Jita · Broker Relations IV",
        salesTax: "2.25% of revenue · Accounting IV",
      },
    });

    expect(lineDetail(cost.toSell, "brokerFee")).toBe(
      "1.5% at Jita · Broker Relations IV",
    );
    expect(lineDetail(cost.toSell, "salesTax")).toContain("Accounting IV");
  });
});

describe("a material bought in part", () => {
  const partly = () =>
    row({
      quantity: 1000,
      paidQuantity: 400,
      paidCost: 4_000_000,
      buyPrice: 5_000,
      plan: MATERIAL_PLAN.BUY,
    });

  it("counts what was already spent on it", () => {
    const cost = buildCostBreakdown({ rows: [partly()] });

    expect(lineValue(cost.toBuild, "paid")).toBe(4_000_000);
  });

  it("estimates only the units still to buy", () => {
    // Pricing all 1000 would charge for 400 nobody is going to buy again.
    const cost = buildCostBreakdown({ rows: [partly()] });

    expect(lineValue(cost.toBuild, "bought")).toBe(3_000_000);
  });

  it("comes to what was spent plus what is left to spend", () => {
    expect(buildCostBreakdown({ rows: [partly()] }).total).toBe(7_000_000);
  });

  it("charges nothing more for a material bought in full", () => {
    const cost = buildCostBreakdown({
      rows: [
        row({
          quantity: 1000,
          paidQuantity: 1000,
          paidCost: 9_000,
          plan: MATERIAL_PLAN.PAID,
        }),
      ],
    });

    expect(cost.total).toBe(9_000);
  });
});

describe("per unit", () => {
  it("is worked out once, for every line and every total", () => {
    // Two divisions of the same figures is how two totals that disagree start.
    const cost = buildCostBreakdown({
      rows: [row()],
      installCost: 500,
      quantityProduced: 10,
    });

    expect(cost.toBuild.lines[0].perUnit).toBe(100);
    expect(cost.toBuild.perUnit).toBe(150);
    expect(cost.perUnit).toBe(cost.total / 10);
  });
});

// The toggle changes what the components are, not merely how they are labelled:
// the materials line grows and the child-builds line disappears.
describe("pricing every material at market", () => {
  const linked = () =>
    row({
      plan: MATERIAL_PLAN.BUILD,
      buildPrice: 4,
      buyPrice: 10,
      quantity: 100,
    });

  it("prices a linked row at market and drops the child-builds line", () => {
    const cost = buildCostBreakdown({ rows: [linked()], buyEverything: true });

    expect(cost.toBuild.lines.map((line) => line.id)).not.toContain("built");
    const bought = cost.toBuild.lines.find((line) => line.id === "bought");
    expect(bought.value).toBe(1000);
  });

  it("prices it from the child build when left alone", () => {
    const cost = buildCostBreakdown({ rows: [linked()] });

    const built = cost.toBuild.lines.find((line) => line.id === "built");
    expect(built.value).toBe(400);
  });

  // A purchase already made is a record rather than an estimate, so no model
  // reprices it.
  it("leaves what was actually paid alone in either model", () => {
    const paid = row({
      plan: MATERIAL_PLAN.PAID,
      paidCost: 700,
      remainingQuantity: 0,
      quantity: 100,
    });

    for (const buyEverything of [false, true]) {
      const cost = buildCostBreakdown({ rows: [paid], buyEverything });
      expect(cost.toBuild.lines.find((line) => line.id === "paid").value).toBe(
        700,
      );
    }
  });
});

// The archive counts invention in what a build cost, so a stage that leaves it
// out reads every T2 job as cheaper than its own history says the last one was.
it("counts what the invention attempts cost", () => {
  const cost = buildCostBreakdown({
    rows: [],
    installCost: 1_000,
    inventionCost: 5_000,
    quantityProduced: 10,
  });

  const invention = cost.toBuild.lines.find((line) => line.id === "invention");
  expect(invention.value).toBe(5_000);
  expect(invention.perUnit).toBe(500);
  expect(cost.toBuild.total).toBe(6_000);
});

it("drops the invention line on a job that invented nothing", () => {
  const cost = buildCostBreakdown({
    rows: [],
    installCost: 1_000,
    quantityProduced: 10,
  });

  expect(cost.toBuild.lines.some((line) => line.id === "invention")).toBe(
    false,
  );
});

// A child job that no longer covers its material is part built and part bought.
// Costing all of it as a build states a plan the linked jobs do not carry out.
describe("a row whose child jobs fall short", () => {
  const shortRow = {
    plan: MATERIAL_PLAN.BUILD,
    quantity: 100,
    remainingQuantity: 100,
    buyPrice: 10,
    buildPrice: 8.8,
    coverage: {
      required: 100,
      covered: 40,
      shortfall: 60,
      isShort: true,
      buildCost: 280,
      buyCost: 600,
      assumed: false,
    },
  };

  it("puts the shortfall in the band that bought it", () => {
    const cost = buildCostBreakdown({ rows: [shortRow], quantityProduced: 10 });

    const built = cost.toBuild.lines.find((line) => line.id === "built");
    const bought = cost.toBuild.lines.find((line) => line.id === "bought");

    expect(built.value).toBe(280);
    expect(bought.value).toBe(600);
    expect(bought.detail).toContain("fall short");
  });

  it("says when the build line assumes a resize instead", () => {
    const assumedRow = {
      ...shortRow,
      buildPrice: 7,
      coverage: { ...shortRow.coverage, buyCost: 0, assumed: true },
    };

    const cost = buildCostBreakdown({
      rows: [assumedRow],
      quantityProduced: 10,
    });
    const built = cost.toBuild.lines.find((line) => line.id === "built");

    expect(built.value).toBe(700);
    expect(built.detail).toContain("assumes a resize on close");
  });

  it("says nothing extra when the child jobs still cover the row", () => {
    const covered = {
      ...shortRow,
      buildPrice: 7,
      coverage: {
        ...shortRow.coverage,
        isShort: false,
        buyCost: 0,
        assumed: false,
      },
    };

    const cost = buildCostBreakdown({ rows: [covered], quantityProduced: 10 });
    const built = cost.toBuild.lines.find((line) => line.id === "built");

    expect(built.detail).toBe("their materials and install, not counted above");
  });
});

// Units already paid for come off the shortfall before they come off what the
// child jobs make: the jobs produce what they produce whatever was bought
// separately. Prorating both halves alike charged the row for paid units.
describe("a row that is both short and partly paid", () => {
  const row = {
    plan: MATERIAL_PLAN.BUILD,
    quantity: 100,
    remainingQuantity: 50,
    paidCost: 300,
    buyPrice: 10,
    buildPrice: 8.5,
    coverage: {
      required: 100,
      covered: 30,
      shortfall: 70,
      isShort: true,
      // 5 an item to build, 10 an item to buy.
      buildCost: 150,
      buyCost: 700,
      assumed: false,
    },
  };

  it("covers what is still needed from the child jobs first", () => {
    const cost = buildCostBreakdown({ rows: [row], quantityProduced: 10 });

    // Of the 50 still to source, the jobs make 30 at 5 and 20 are bought at 10.
    expect(cost.toBuild.lines.find((line) => line.id === "built").value).toBe(
      150,
    );
    expect(cost.toBuild.lines.find((line) => line.id === "bought").value).toBe(
      200,
    );
  });

  it("never costs more than the same row with nothing paid yet", () => {
    const paid = buildCostBreakdown({ rows: [row], quantityProduced: 10 });
    const unpaid = buildCostBreakdown({
      rows: [{ ...row, remainingQuantity: 100, paidCost: 0 }],
      quantityProduced: 10,
    });

    expect(paid.toBuild.total).toBeLessThanOrEqual(unpaid.toBuild.total);
  });

  it("buys nothing when the jobs already make everything still needed", () => {
    const cost = buildCostBreakdown({
      rows: [{ ...row, remainingQuantity: 20 }],
      quantityProduced: 10,
    });

    expect(
      cost.toBuild.lines.find((line) => line.id === "bought"),
    ).toBeUndefined();
    expect(cost.toBuild.lines.find((line) => line.id === "built").value).toBe(
      100,
    );
  });
});

// A player writes down a courier contract and a set of copies because they are
// separate costs. Anything that adds them back together undoes the record.
describe("extras, a line each as they were recorded", () => {
  const extra = (id, extraText, extraValue, categoryLabel = "Hauling") => ({
    id,
    category: "1",
    categoryLabel,
    extraText,
    extraValue,
  });

  it("gives every extra its own line", () => {
    const cost = buildCostBreakdown({
      rows: [],
      extras: [extra("a", "Courier to Jita", 300), extra("b", "BPC set", 100)],
    });

    const labels = cost.toBuild.lines.map((line) => line.label);
    expect(labels).toContain("Courier to Jita");
    expect(labels).toContain("BPC set");
  });

  it("keeps two costs filed the same way apart", () => {
    const cost = buildCostBreakdown({
      rows: [],
      extras: [extra("a", "First haul", 300), extra("b", "Second haul", 200)],
    });

    const extrasLines = cost.toBuild.lines.filter((line) =>
      line.id.startsWith("extras"),
    );
    expect(extrasLines).toHaveLength(2);
    expect(extrasLines.map((line) => line.value)).toEqual([300, 200]);
  });

  it("lists them in the order they were recorded", () => {
    const cost = buildCostBreakdown({
      rows: [],
      extras: [extra("a", "First", 100), extra("b", "Second", 900)],
    });

    const extrasLines = cost.toBuild.lines.filter((line) =>
      line.id.startsWith("extras"),
    );
    expect(extrasLines.map((line) => line.label)).toEqual(["First", "Second"]);
  });

  it("says what a cost was filed under beside it", () => {
    const cost = buildCostBreakdown({
      rows: [],
      extras: [extra("a", "Courier to Jita", 300, "Hauling")],
    });

    expect(
      cost.toBuild.lines.find((line) => line.id === "extras:a").detail,
    ).toBe("Hauling");
  });

  it("falls back to the category for a cost with no description", () => {
    const cost = buildCostBreakdown({
      rows: [],
      extras: [extra("a", "", 300, "Hauling")],
    });

    expect(
      cost.toBuild.lines.find((line) => line.id === "extras:a").label,
    ).toBe("Hauling");
  });

  it("names a cost with neither a description nor a category", () => {
    const cost = buildCostBreakdown({
      rows: [],
      extras: [{ id: "a", extraValue: 300 }],
    });

    expect(
      cost.toBuild.lines.find((line) => line.id === "extras:a").label,
    ).toBe("Extra cost");
  });

  // A row's id could otherwise collide with a component's own.
  it("keeps an extra's id apart from a component's", () => {
    const cost = buildCostBreakdown({
      rows: [],
      extras: [extra("install", "Odd", 100)],
    });

    expect(
      cost.toBuild.lines.find((line) => line.id === "install"),
    ).toBeUndefined();
    expect(
      cost.toBuild.lines.find((line) => line.id === "extras:install"),
    ).toBeDefined();
  });

  // Rows stored before they carried ids must still draw as separate lines.
  it("draws two lines for two costs with no ids", () => {
    const cost = buildCostBreakdown({
      rows: [],
      extras: [
        { extraText: "One", extraValue: 100 },
        { extraText: "Two", extraValue: 200 },
      ],
    });

    const extrasLines = cost.toBuild.lines.filter((line) =>
      line.id.startsWith("extras"),
    );
    expect(new Set(extrasLines.map((line) => line.id)).size).toBe(2);
  });

  it("still invites them where a build has none", () => {
    const cost = buildCostBreakdown({ rows: [], extras: [] });
    const extras = cost.toBuild.lines.find((line) => line.id === "extras");

    expect(extras.value).toBe(0);
    expect(extras.detail).toMatch(/Hauling/);
  });
});

// A hub with no orders reports no price, and the row is counted for nothing in
// the bought line. A total that is quietly low is worse than one that admits
// what it left out: an item off the market is not an item that is free.
describe("a material the market holds no orders for", () => {
  const rows = [
    {
      typeID: 34,
      plan: MATERIAL_PLAN.BUY,
      quantity: 10,
      remainingQuantity: 10,
      buyPrice: 5,
      buildPrice: null,
      volume: 0,
    },
    {
      typeID: 35,
      plan: MATERIAL_PLAN.BUY,
      quantity: 2,
      remainingQuantity: 2,
      buyPrice: null,
      buildPrice: null,
      volume: 0,
    },
  ];

  it("says how many the figure leaves out", () => {
    const cost = buildCostBreakdown({ rows, quantityProduced: 1 });
    const bought = cost.toBuild.lines.find((line) => line.id === "bought");

    expect(bought.detail).toContain("1 not on the market, counted as nothing");
  });

  it("says nothing of the sort when every row has a price", () => {
    const cost = buildCostBreakdown({
      rows: [rows[0]],
      quantityProduced: 1,
    });
    const bought = cost.toBuild.lines.find((line) => line.id === "bought");

    expect(bought.detail).not.toContain("not on the market");
  });
});
