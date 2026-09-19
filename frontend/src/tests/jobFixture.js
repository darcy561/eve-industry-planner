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
 * @param {Array<object>|Object<string, object>} [overrides.materials] - Given as
 *   an array for brevity; the fixture keys them as a document holds them
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
      materials: keyedMaterials(materials),
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
      return Object.values(this.build.costs.extrasCosts).reduce(
        (total, row) => total + (Number(row?.extraValue) || 0),
        0,
      );
    },
    get totalInventionCost() {
      return Object.values(this.build.costs.inventionEntries).reduce(
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

/**
 * Keys material rows, and each row's purchases, as a stored document holds them.
 *
 * Tests name materials as a list because that reads better than writing the key
 * twice; a document keys them by type id and each purchase by its own id.
 *
 * @param {Array<object>|Object<string, object>} materials
 * @returns {Object<string, object>} The materials keyed by type id
 */
function keyedMaterials(materials) {
  const rows = Array.isArray(materials)
    ? materials
    : Object.values(materials ?? {});
  return Object.fromEntries(
    rows.map((material) => [
      String(material.typeID),
      Array.isArray(material.purchasing)
        ? {
            ...material,
            purchasing: Object.fromEntries(
              material.purchasing.map((row) => [String(row.id), row]),
            ),
          }
        : material,
    ]),
  );
}
