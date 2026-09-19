/**
 * A job shaped the way the `Job` class actually exposes itself.
 *
 * `selectedSetup` is a getter over `build.setup[layout.setupToEdit]`, not a
 * stored field — a fixture that flattens it to a string or an object reads
 * correctly through consuming code while hiding a real defect. One did: a panel
 * indexed the setup map with the setup itself, always got undefined, and priced
 * every job at signed-out rates with every test still green.
 *
 * Built here rather than in each test file so the fidelity is guaranteed once.
 */

/**
 * @param {object} [overrides]
 * @param {string|null} [overrides.setupToEdit] - null for a job with no setup selected
 * @param {object} [overrides.setup] - The setup at that key
 * @param {Array<object>} [overrides.materials]
 * @param {Object<number, string[]>} [overrides.childJobs]
 * @param {Array<object>} [overrides.inventionEntries]
 * @param {Array<object>} [overrides.extrasCosts]
 * @returns {object} An activeJob with the class's own getter semantics
 */
export function jobFixture({
  setupToEdit = "setup0",
  setup = {},
  materials = [],
  childJobs = {},
  inventionEntries = [],
  extrasCosts = [],
  ...rest
} = {}) {
  return {
    jobID: "job-1",
    itemID: 34,
    name: "Tritanium",
    jobType: 1,
    totalQuantityProduced: 10,
    skills: {},
    parentJobs: [],
    layout: { setupToEdit, materialPriceOverrides: {} },
    build: {
      materials,
      childJobs,
      costs: { extrasCosts, inventionEntries },
      // Where the output is meant to go. Both halves null is what almost every
      // job carries: the account's defaults apply.
      sale: {
        marketOrders: [],
        transactions: [],
        brokersFee: [],
        plan: { sellerCharacter: null, saleLocationID: null },
      },
      setup: {
        setup0: {
          id: "setup0",
          selectedCharacter: "builder",
          jobType: 1,
          rawTime: 10000,
          runCount: 1,
          TE: 0,
          structureID: 0,
          rigID: 0,
          materialCount: {},
          ...setup,
        },
      },
    },
    get selectedSetup() {
      return this.build.setup[this.layout.setupToEdit];
    },
    get totalExtrasCost() {
      return this.build.costs.extrasCosts.reduce(
        (total, row) => total + (Number(row?.extraValue) || 0),
        0,
      );
    },
    get totalInventionCost() {
      return this.build.costs.inventionEntries.reduce(
        (total, entry) => total + (Number(entry?.itemCost) || 0),
        0,
      );
    },
    ...rest,
  };
}

/**
 * One material as the rows are built from it.
 *
 * @param {object} [overrides]
 */
export function materialFixture(overrides = {}) {
  return {
    typeID: 34,
    name: "Tritanium",
    jobType: 1,
    quantity: 100,
    volume: 0.01,
    purchasing: [],
    quantityPurchased: 0,
    purchasedCost: 0,
    purchaseComplete: false,
    ...overrides,
  };
}
