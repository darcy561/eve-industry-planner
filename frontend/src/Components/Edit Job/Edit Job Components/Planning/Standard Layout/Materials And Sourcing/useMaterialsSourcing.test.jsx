import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { beforeAll } from "vitest";

vi.mock(
  "../../../../../../Hooks/Planner/useEffectiveMarketHubFromLayout.js",
  () => ({
    useEffectiveMarketHubFromLayout: () => ({
      marketLocation: "jita",
      listingType: "sell",
      marketLocationRung: "account",
      listingTypeRung: "account",
    }),
  }),
);
// Tritanium (34) sits in Minerals; 35 carries no market group, as most
// unpublished types do. The real module is primed rather than stubbed, because
// the rule deciding whether the rung fires reads its state directly.
vi.mock(
  "../../../../../../Functions/Helper/getCachedData",
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMarketGroups: async () => ({ 1857: { name: "Minerals" } }),
    getFullItemList: async () => ({ 34: { market_group_id: 1857 } }),
  }),
);
vi.mock("../../../../../../Functions/MarketData/marketPriceForType", () => ({
  getMarketPriceForType: (typeID, hub, basis) =>
    ({
      jita: { sell: 10, buy: 8, buyP95: 9, sellP05: 11 },
      amarr: { sell: 20, buy: 16, buyP95: 18, sellP05: 22 },
    })[hub]?.[basis] ?? 0,
}));
// Set per test rather than remocked, so a case with linked children does not
// need the module registry reset around it.
let linkedChildJobs = [];

vi.mock("./Helpers/materialChildJobs", () => ({
  resolveMaterialChildJobs: () => ({
    childJobsById: new Map(linkedChildJobs.map((job) => [job.jobID, job])),
    childJobIDs: linkedChildJobs.map((job) => job.jobID),
    hasChildJobs: linkedChildJobs.length > 0,
  }),
  resolveMaterialChildJobStatus: () => ({
    hasLinked: linkedChildJobs.length > 0,
    hasTemp: false,
    hasPendingAdd: false,
  }),
}));
let automaticRecalculation = true;
let groupDefaults;

// A reader rather than a built state: the harness builds one once, and a getter
// does not survive that — it is evaluated as the state is spread, freezing
// whatever the first test set.
vi.mock("../../../../../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../../tests/usersStoreHarness.js");
  // The reader form, not the eager one: two of these are read per render, and an
  // eagerly built state spreads the getter away and freezes the first value.
  return usersStoreMock(() =>
    usersStoreState({
      applicationSettings: {
        get enableAutomaticJobRecalculation() {
          return automaticRecalculation;
        },
        actions: { checkTypeIDisExempt: () => false },
        // The two sides carry different values, so a hook asking for the wrong
        // one is visible.
        get defaultPricing() {
          return {
            buying: { market: "jita", basis: "sell", groups: groupDefaults },
            selling: { market: "amarr", basis: "buy" },
          };
        },
      },
      worldData: { actions: { findMarketData: () => undefined } },
    }),
  );
});
vi.mock(
  "../../../../../../Functions/Helper/checkJobTypeIsBuildable.js",
  () => ({
    default: (jobType) => jobType === 1,
  }),
);
// The child jobs behind a row are costed for what they actually make, so the
// stub answers per job rather than per material.
vi.mock("../../../../../../Functions/Groups/childJobTotals", () => ({
  calculateChildJobTotals: (job) => ({
    totalCostOfMaterials: 0,
    totalInstallCosts: 0,
    quantityProduced: job?.totalQuantityProduced ?? 100,
    totalCostPerItem: job?.unitCost ?? 7,
  }),
}));

const { useMaterialsSourcing } = await import("./useMaterialsSourcing.js");

const material = (typeID, jobType = 1, overrides = {}) => ({
  typeID,
  name: `Material ${typeID}`,
  jobType,
  quantity: 100,
  volume: 0.01,
  purchasing: [],
  quantityPurchased: 0,
  purchasedCost: 0,
  purchaseComplete: false,
  ...overrides,
});

function setup({
  materials = [material(34)],
  layout = {},
  speculativeChildJobs = {},
} = {}) {
  return {
    activeJob: {
      build: { materials, childJobs: {} },
      layout,
      selectedSetup: { materialCount: {} },
    },
    parentChildToEdit: { childJobs: {} },
    temporaryChildJobs: {},
    speculativeChildJobs,
  };
}

const render = (state) =>
  renderHook(() => useMaterialsSourcing({ state, actions: {} })).result.current;

describe("useMaterialsSourcing", () => {
  it("gives the panel every part it draws", () => {
    // The panel destructures each of these; one missing is a feature that
    // silently never renders.
    const result = render(setup());

    expect(Object.keys(result).sort()).toEqual(
      [
        "basisOptions",
        "basisUsage",
        "listingType",
        "marketLocation",
        "priceAge",
        "rows",
        "summary",
      ].sort(),
    );
  });

  it("builds a row per material", () => {
    const result = render(setup({ materials: [material(34), material(35)] }));

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ typeID: 34, buyPrice: 10 });
  });

  it("marks each row with what kind of material it is", () => {
    expect(render(setup()).rows[0].mark).toMatchObject({
      label: "Manufacturing Job",
      isExempt: false,
    });
  });

  it("carries what a drawer opened on a row needs", () => {
    const result = render(setup());

    expect(result.rows[0]).toMatchObject({
      marketLocation: "jita",
      listingType: "sell",
      matchedChildJobs: [],
    });
    expect(result.rows[0].material).toBeDefined();
  });

  it("counts no overrides when every row is on the panel's basis", () => {
    expect(render(setup()).basisUsage).toMatchObject({ overridden: 0 });
  });

  it("counts a row that carries its own hub", () => {
    const state = setup({
      layout: { materialPriceOverrides: { 34: { marketDisplay: "amarr" } } },
    });

    expect(render(state).basisUsage.overridden).toBe(1);
  });

  it("costs the job on every basis the picker offers", () => {
    const result = render(setup());

    expect(result.basisOptions).toHaveLength(4);
    expect(result.basisOptions.find((o) => o.isCurrent).id).toBe("sell");
  });
});

// A speculative job prices a row without committing it, which is what lets the
// panel offer the switch. If it counted as linked the row would read as planned
// to build the moment it was costed, and there would be nothing left to offer.
describe("a row costed from a speculative job", () => {
  it("takes its build price from the speculative job", () => {
    const { rows } = render(
      setup({ speculativeChildJobs: { 34: { jobID: "spec-34", itemID: 34 } } }),
    );

    expect(rows[0].isSpeculative).toBe(true);
    expect(rows[0].buildPrice).toBe(7);
  });

  it("stays unlinked, and so stays planned to buy", () => {
    const { rows } = render(
      setup({ speculativeChildJobs: { 34: { jobID: "spec-34", itemID: 34 } } }),
    );

    expect(rows[0].isLinked).toBe(false);
    expect(rows[0].plan).toBe("buy");
  });

  it("is not speculative when nothing has costed it", () => {
    const { rows } = render(setup());

    expect(rows[0].isSpeculative).toBe(false);
  });
});

// A child job is sized to the requirement when it is created and not again until
// the parent closes, so the two drift apart whenever the parent changes. The row
// has to carry that rather than quietly costing the requirement at the child's
// rate as though it had been resized.
describe("a row whose child jobs no longer cover it", () => {
  afterEach(() => {
    linkedChildJobs = [];
    automaticRecalculation = true;
  });

  function renderLinked(...jobs) {
    linkedChildJobs = jobs;
    return render(setup());
  }

  it("says how much of the requirement the child actually makes", () => {
    const { rows } = renderLinked({
      jobID: "child-1",
      totalQuantityProduced: 40,
      unitCost: 7,
    });

    expect(rows[0].coverage).toMatchObject({
      required: 100,
      produced: 40,
      covered: 40,
      shortfall: 60,
      isShort: true,
    });
  });

  it("buys the shortfall when nothing will resize the child on close", () => {
    automaticRecalculation = false;

    const { rows } = renderLinked({
      jobID: "child-1",
      totalQuantityProduced: 40,
      unitCost: 7,
    });

    // 40 built at 7, 60 bought at the sell price of 10.
    expect(rows[0].coverage.buildCost).toBe(280);
    expect(rows[0].coverage.buyCost).toBe(600);
    expect(rows[0].buildPrice).toBe(8.8);
    expect(rows[0].coverage.assumed).toBe(false);
  });

  it("extrapolates and flags it when the child will be resized on close", () => {
    const { rows } = renderLinked({
      jobID: "child-1",
      totalQuantityProduced: 40,
      unitCost: 7,
    });

    expect(rows[0].buildPrice).toBe(7);
    expect(rows[0].coverage.assumed).toBe(true);
  });

  it("carries no shortfall when the child still covers the requirement", () => {
    const { rows } = renderLinked({
      jobID: "child-1",
      totalQuantityProduced: 100,
      unitCost: 7,
    });

    expect(rows[0].coverage.isShort).toBe(false);
    expect(rows[0].coverage.assumed).toBe(false);
  });

  // Two jobs each making half were each costed for the whole requirement, so a
  // material built by siblings cost twice what it should.
  it("splits the requirement between siblings rather than giving each all of it", () => {
    const { rows } = renderLinked(
      { jobID: "child-1", totalQuantityProduced: 50, unitCost: 7 },
      { jobID: "child-2", totalQuantityProduced: 50, unitCost: 7 },
    );

    expect(rows[0].coverage.covered).toBe(100);
    expect(rows[0].coverage.total).toBe(700);
    expect(rows[0].buildPrice).toBe(7);
  });
});

// The rung the account's group table answers. It sits above the account default
// and below a job's own choice, and it is resolved per material — so it has to be
// visible on the row the panel builds, not only in the pure resolver.
describe("a material priced from its market group", () => {
  // Reset first: the module holds the tree for the whole worker, so another file
  // in the same run may have primed it with data of its own.
  beforeAll(async () => {
    const { primeMarketGroupData, resetMarketGroupData } =
      await import("../../../../../../Functions/MarketData/marketGroupData");
    resetMarketGroupData();
    await primeMarketGroupData();
  });

  afterEach(() => {
    groupDefaults = undefined;
  });

  it("prices the row from the group rather than the account default", () => {
    groupDefaults = { 1857: { market: "amarr", basis: "buy" } };

    const { rows } = render(setup());

    expect(rows[0]).toMatchObject({
      marketLocation: "amarr",
      listingType: "buy",
      buyPrice: 16,
    });
  });

  it("leaves the account default where the item's group says nothing", () => {
    groupDefaults = { 9999: { market: "amarr", basis: "buy" } };

    const { rows } = render(setup());

    expect(rows[0]).toMatchObject({
      marketLocation: "jita",
      listingType: "sell",
      buyPrice: 10,
    });
  });

  it("reads as it did before the rung where the account set no groups", () => {
    const { rows } = render(setup());

    expect(rows[0]).toMatchObject({ marketLocation: "jita", buyPrice: 10 });
  });

  // The basis comparison varies the basis itself, so a group naming one must not
  // answer all four candidates identically.
  it("still costs each basis apart when the group names one", () => {
    groupDefaults = { 1857: { basis: "buy" } };

    const { basisOptions } = render(setup());
    const byId = Object.fromEntries(basisOptions.map((o) => [o.id, o.total]));

    expect(byId.sell).not.toBe(byId.buy);
  });
});
