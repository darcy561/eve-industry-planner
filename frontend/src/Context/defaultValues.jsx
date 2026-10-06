/**
 * Fixed planner workflow stages, ids and default labels; custom names come from
 * `application_settings.jobStatuses` on the server.
 *
 * @type {ReadonlyArray<{ id: number, order: number, defaultName: string }>}
 */
export const JOB_STATUS_CATALOG = Object.freeze([
  { id: 0, order: 0, defaultName: "Planning" },
  { id: 1, order: 1, defaultName: "Purchasing" },
  { id: 2, order: 2, defaultName: "Building" },
  { id: 3, order: 3, defaultName: "Complete" },
  { id: 4, order: 4, defaultName: "For Sale" },
]);

/** Last workflow stage id (e.g. “For Sale”) — jobs in this stage match this id. */
export const LAST_JOB_STATUS_ID =
  JOB_STATUS_CATALOG[JOB_STATUS_CATALOG.length - 1].id;

/**
 * Default categories for extra costs in EVE Industry Planner.
 *
 * @type {Array<Object>}
 * @property {string} id - Unique identifier for the category
 * @property {string} label - Display label for the category
 * @property {boolean} permanent - Whether the category is permanent and cannot be removed
 */
export const extrasCategoriesDefault = [
  { id: "0", label: "Unassigned", deleted: false, deletedAt: null },
  { id: "1", label: "Hauling Service", deleted: false, deletedAt: null },
  { id: "2", label: "Jump Freight Service", deleted: false, deletedAt: null },
  { id: "3", label: "Blueprint Copies", deleted: false, deletedAt: null },
  { id: "4", label: "Loyal Point Costs", deleted: false, deletedAt: null },
  { id: "5", label: "Other", deleted: false, deletedAt: null },
];

/**
 * Permanent extras categories for EVE Industry Planner.
 *
 * @type {Set<number>}
 * @property {string} "0" - Unassigned
 * @property {string} "5" - Other
 */

export const permanentExtrasCategories = new Set(["0", "5"]);

/**
 * The order types a figure may be read on, named as ESI names them, with the percentile forms
 * that exclude outlying quotes.
 *
 * @type {Array<Object>}
 * @property {string} id - `buy` and `sell` are ESI's own; the percentile forms
 *   are this server's, derived from the same orders
 * @property {string} name - Display name for the order type
 */
export let ORDER_TYPES = [
  {
    id: "buy",
    name: "Buy Orders",
    caption: "best bid on the book",
    description:
      "What you would get selling into a buy order right now. One silly bid moves it.",
  },
  {
    id: "sell",
    name: "Sell Orders",
    caption: "best ask on the book",
    description:
      "What buying instantly actually costs — the honest figure if you rush.",
  },
  {
    id: "buyP95",
    name: "Buy Orders (95th %ile)",
    caption: "outlier-trimmed bid",
    description:
      "Ignores the top few bids, so a thin side stops flattering the estimate.",
  },
  {
    id: "sellP05",
    name: "Sell Orders (5th %ile)",
    caption: "outlier-trimmed ask",
    description:
      "Ignores the cheapest few asks you will not actually be fast enough to get.",
  },
];

/**
 * Job type enumeration for EVE Online industry activities.
 *
 * @type {Object}
 * @property {number} baseMaterial - Base material (raw materials)
 * @property {number} manufacturing - Manufacturing jobs
 * @property {number} reaction - Reaction jobs
 * @property {number} pi - Planetary Interaction jobs
 * @property {number} invention - Invention jobs
 * @property {number} reprocessing - Reprocessing jobs
 */
export let jobTypes = {
  baseMaterial: 0,
  manufacturing: 1,
  reaction: 2,
  pi: 3,
  invention: 4,
  reprocessing: 5,
};

/**
 * The kinds of thing a saved structure can be: the four job types it is a place for, and a market,
 * which is deliberately not a job type.
 *
 * @type {Object<string, number>}
 */
export const structureKinds = {
  manufacturing: jobTypes.manufacturing,
  reaction: jobTypes.reaction,
  invention: jobTypes.invention,
  reprocessing: jobTypes.reprocessing,
  market: 6,
};

/**
 * Mapping of job type IDs to their string representations.
 *
 * @type {Object}
 * @property {string} 1 - "manufacturing"
 * @property {string} 2 - "reaction"
 * @property {string} 4 - "invention"
 * @property {string} 5 - "reprocessing"
 */
/**
 * What each job type is called where a player reads it.
 *
 * `jobTypeMapping` names them for code; these are the words.
 *
 * @type {Object<number, string>}
 */
export const jobTypeNames = {
  [jobTypes.baseMaterial]: "Base Material",
  [jobTypes.manufacturing]: "Manufacturing Job",
  [jobTypes.reaction]: "Reaction Job",
  [jobTypes.pi]: "Planetary Interaction",
  [jobTypes.invention]: "Invention Job",
  [jobTypes.reprocessing]: "Reprocessing Job",
};

export const jobTypeMapping = {
  [jobTypes.manufacturing]: "manufacturing",
  [jobTypes.reaction]: "reaction",
  [jobTypes.invention]: "invention",
  [jobTypes.reprocessing]: "reprocessing",
};

/**
 * The kinds of reprocessable item, numbered as the reprocessing static file writes them.
 *
 * @type {Object}
 * @property {number} ore - Asteroid ore
 * @property {number} moonOre - Moon ore
 * @property {number} ice - Ice
 * @property {number} gas - Compressed gas, which is decompressed rather than reprocessed
 * @property {number} scrap - Modules and other scrap metal
 * @property {number} unrefinedMineral - An unrefined mineral, giving one mineral in a varying amount
 * @property {number} erratic - Erratic ore, giving one of several minerals at random each batch
 */
export const reprocessingItemTypes = {
  ore: 0,
  moonOre: 1,
  ice: 2,
  gas: 3,
  scrap: 4,
  unrefinedMineral: 5,
  erratic: 6,
};

/**
 * Mapping of reprocessing item type IDs to their string representations.
 *
 * @type {Object}
 * @property {string} 0 - "ore"
 * @property {string} 1 - "moonOre"
 * @property {string} 2 - "ice"
 * @property {string} 3 - "gas"
 * @property {string} 4 - "scrap"
 * @property {string} 5 - "unrefinedMineral"
 * @property {string} 6 - "erratic"
 */
export const reprocessingItemTypesByValue = {
  [reprocessingItemTypes.ore]: "ore",
  [reprocessingItemTypes.moonOre]: "moonOre",
  [reprocessingItemTypes.ice]: "ice",
  [reprocessingItemTypes.gas]: "gas",
  [reprocessingItemTypes.scrap]: "scrap",
  [reprocessingItemTypes.unrefinedMineral]: "unrefinedMineral",
  [reprocessingItemTypes.erratic]: "erratic",
};

/** What each reprocessing kind is called on the page, keyed by its value. */
export const reprocessingItemTypeLabels = {
  [reprocessingItemTypes.ore]: "Ore",
  [reprocessingItemTypes.moonOre]: "Moon ore",
  [reprocessingItemTypes.ice]: "Ice",
  [reprocessingItemTypes.gas]: "Gas",
  [reprocessingItemTypes.scrap]: "Scrap metal",
  [reprocessingItemTypes.unrefinedMineral]: "Unrefined minerals",
  [reprocessingItemTypes.erratic]: "Erratic ore",
};

/**
 * Blueprint efficiency options for EVE Online industry.
 *
 * @type {Object}
 * @property {Array<Object>} me - Material Efficiency options (0-10)
 * @property {Array<Object>} te - Time Efficiency options (0-10, but labels show actual TE values)
 */
export const blueprintOptions = {
  me: [
    { value: 0, label: "0" },
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" },
    { value: 6, label: "6" },
    { value: 7, label: "7" },
    { value: 8, label: "8" },
    { value: 9, label: "9" },
    { value: 10, label: "10" },
  ],
  te: [
    { value: 0, label: "0" },
    { value: 1, label: "2" },
    { value: 2, label: "4" },
    { value: 3, label: "6" },
    { value: 4, label: "8" },
    { value: 5, label: "10" },
    { value: 6, label: "12" },
    { value: 7, label: "14" },
    { value: 8, label: "16" },
    { value: 9, label: "18" },
    { value: 10, label: "20" },
  ],
};

/**
 * What an NPC station charges to list an order, before the seller reduces it; a citadel's owner
 * sets its own rate.
 *
 * @type {Object}
 * @property {number} base - Percentage charged before any reduction
 * @property {number} brokerRelations - Percentage removed per level of Broker Relations
 * @property {number} factionStanding - Percentage removed per point of standing with the station's faction
 * @property {number} corporationStanding - Percentage removed per point of standing with its owner
 * @property {number} minimumFee - Floor in ISK, charged when the percentage comes to less
 */
export const brokerFeeRates = {
  base: 3,
  brokerRelations: 0.3,
  factionStanding: 0.03,
  corporationStanding: 0.02,
  minimumFee: 100,
};

/**
 * What every sale is taxed, before Accounting reduces it multiplicatively, at NPC stations and
 * citadels alike.
 *
 * @type {Object}
 * @property {number} base - Percentage charged before any reduction
 * @property {number} accounting - Fraction of the base removed per level of Accounting
 */
export const salesTaxRates = {
  base: 7.5,
  accounting: 0.11,
};

/** The highest level a skill trains to. */
export const maxSkillLevel = 5;

/**
 * Type IDs of the skills that change what selling costs.
 *
 * @type {Object}
 * @property {number} brokerRelations - Reduces an NPC station's broker fee
 * @property {number} accounting - Reduces sales tax everywhere
 */
export const marketSkillIDs = {
  brokerRelations: 3446,
  accounting: 16622,
};

/**
 * Skills that shorten a whole job as one modifier, so the per-skill reduction other required skills
 * give is not applied to them.
 *
 * @type {Object}
 */
export const industrySkillIDs = {
  industry: 3380,
  advancedIndustry: 3388,
  reaction: 45746,
  capitalShipConstruction: 22242,
};

/**
 * Structure options for EVE Online industry calculations.
 *
 * @type {Object}
 * @property {Object} manStructure - Manufacturing structure options
 * @property {Object} manRigs - Manufacturing rig options
 * @property {Object} manSystem - Manufacturing system security bands
 * @property {Object} reactionSystem - Reaction system security bands
 * @property {Object} reactionStructure - Reaction structure options
 * @property {Object} reactionRigs - Reaction rig options
 * @property {Object} reprocessingSystem - Reprocessing system security bands
 * @property {Object} reprocessingStructure - Reprocessing structure options
 * @property {Object} reprocessingRigs - Reprocessing rig options
 * @property {Object} inventionStructure - Invention structure options
 * @property {Object} inventionRigs - Invention rig options
 * @property {Object} inventionSystem - Invention system security bands
 */
/**
 * The pirate militias a character can fly for, whose bonuses The Fulcrum carries.
 *
 * @type {Object<string, number>}
 */
export const pirateFactions = {
  guristas: 500010,
  angelCartel: 500011,
};

/**
 * The ore kinds each published reprocessing rig group helps, which the game names
 * in the group rather than in a family.
 *
 * @type {Object<number, Array<number>>}
 */
export const reprocessingRigFamilies = {
  1941: [
    reprocessingItemTypes.ore,
    reprocessingItemTypes.unrefinedMineral,
    reprocessingItemTypes.erratic,
  ],
  1942: [reprocessingItemTypes.ice],
  1943: [reprocessingItemTypes.moonOre],
  1944: [
    reprocessingItemTypes.ore,
    reprocessingItemTypes.unrefinedMineral,
    reprocessingItemTypes.erratic,
    reprocessingItemTypes.moonOre,
    reprocessingItemTypes.ice,
  ],
  1945: [
    reprocessingItemTypes.ore,
    reprocessingItemTypes.unrefinedMineral,
    reprocessingItemTypes.erratic,
    reprocessingItemTypes.moonOre,
    reprocessingItemTypes.ice,
  ],
};

/**
 * The published family holding capital hulls, which The Fulcrum's bonus stops
 * short of.
 *
 * @type {number}
 */
export const capitalShipFamilyID = 11;

export const structureOptions = {
  manStructure: {
    0: {
      id: 0,
      label: "NPC Station",
      material: 0,
      time: 0,
      cost: 0,
      npcStation: true,
    },
    1: {
      id: 1,
      label: "Medium",
      material: 1,
      time: 0.15,
      cost: 0.03,
      rigSize: 2,
    },
    2: {
      id: 2,
      label: "Large",
      material: 1,
      time: 0.2,
      cost: 0.04,
      rigSize: 3,
    },
    3: {
      id: 3,
      label: "X-Large",
      material: 1,
      time: 0.3,
      cost: 0.05,
      rigSize: 4,
    },
    4: {
      id: 4,
      label: "The Fulcrum",
      npcStation: true,
      material: 6,
      time: 0.7,
      cost: 0.9,
      appliesTo: {
        factions: [pirateFactions.angelCartel, pirateFactions.guristas],
        exceptFamilies: [capitalShipFamilyID],
      },
    },
  },

  manRigs: {
    0: { id: 0, label: "None", material: 0, time: 0, relatedTo: [] },
    1: {
      id: 1,
      security: { 0: 1, 1: 1.9, 2: 2.1 },
      label: "T1 - ME - All",
      material: 2.0,
      time: 0,
      relatedTo: [2, 9],
      appliesToAll: true,
    },
    2: {
      id: 2,
      security: { 0: 1, 1: 1.9, 2: 2.1 },
      label: "T2 - ME - All",
      material: 2.4,
      time: 0,
      relatedTo: [1, 9],
      appliesToAll: true,
    },
    3: {
      id: 3,
      security: { 0: 1, 1: 1.9, 2: 2.1 },
      label: "T1 - TE - All",
      material: 0,
      time: 0.2,
      relatedTo: [4],
      appliesToAll: true,
    },
    4: {
      id: 4,
      security: { 0: 1, 1: 1.9, 2: 2.1 },
      label: "T2 - TE - All",
      material: 0,
      time: 0.24,
      relatedTo: [3],
      appliesToAll: true,
    },
    9: {
      id: 9,
      security: { 0: 0.1, 1: 1.9, 2: 0.1 },
      label: "Faction - ME - All",
      material: 3.7,
      time: 0.2,
      relatedTo: [1, 2],
      appliesToAll: true,
    },
  },

  manSystem: {
    0: { id: 0, label: "High Sec", band: "hiSec" },
    1: { id: 1, label: "Low Sec", band: "lowSec" },
    2: { id: 2, label: "Null Sec / WH", band: "nullSec" },
    3: { id: 3, label: "Zarzakh", band: "hiSec", legacy: true },
  },
  reactionSystem: {
    0: { id: 0, label: "Low Sec", band: "lowSec" },
    1: { id: 1, label: "Null Sec / WH", band: "nullSec" },
  },
  reactionStructure: {
    0: { id: 0, label: "Medium", material: 1, time: 0, cost: 0, rigSize: 2 },
    1: {
      id: 1,
      label: "Large",
      material: 1,
      time: 0.25,
      cost: 0,
      rigSize: 3,
    },
  },
  reactionRigs: {
    0: { id: 0, label: "None", material: 0, time: 0, relatedTo: [] },
    1: {
      id: 1,
      security: { 0: 1, 1: 1.1 },
      label: "T1 - ME - All",
      material: 2.0,
      time: 0,
      relatedTo: [2],
      appliesToAll: true,
    },
    2: {
      id: 2,
      security: { 0: 1, 1: 1.1 },
      label: "T2 - ME - All",
      material: 2.4,
      time: 0,
      relatedTo: [1],
      appliesToAll: true,
    },
    3: {
      id: 3,
      security: { 0: 1, 1: 1.1 },
      label: "T1 - TE - All",
      material: 0,
      time: 0.2,
      relatedTo: [4],
      appliesToAll: true,
    },
    4: {
      id: 4,
      security: { 0: 1, 1: 1.1 },
      label: "T2 - TE - All",
      material: 0,
      time: 0.24,
      relatedTo: [3],
      appliesToAll: true,
    },
  },
  reprocessingSystem: {
    0: { id: 0, label: "High Sec", band: "hiSec" },
    1: { id: 1, label: "Low Sec", band: "lowSec" },
    2: { id: 2, label: "Null Sec / WH", band: "nullSec" },
  },
  reprocessingStructure: {
    0: {
      id: 0,
      label: "NPC Station",
      ore: 0,
      gas: 0,
      cost: 0,
      npcStation: true,
    },
    1: {
      id: 1,
      label: "Medium Refinary",
      ore: 0.02,
      gas: 4,
      cost: 0,
      rigSize: 2,
    },
    2: { id: 2, label: "Medium Other", ore: 0, gas: 0, cost: 0, rigSize: 2 },
    3: {
      id: 3,
      label: "Large Refinary",
      ore: 0.055,
      gas: 10,
      cost: 0,
      rigSize: 3,
    },
    4: { id: 4, label: "Large Other", ore: 0, gas: 0, cost: 0, rigSize: 3 },
    5: { id: 5, label: "X-Large Other", ore: 0, gas: 0, cost: 0, rigSize: 4 },
  },
  reprocessingRigs: {
    0: {
      id: 0,
      label: "None",
      value: 0,
      relatedTo: [],
      appliesTo: [],
    },
    1: {
      id: 1,
      security: { 0: 1, 1: 1.06, 2: 1.12 },
      label: "T1 - Ore",
      value: 1,
      relatedTo: [4, 7, 8],
      appliesTo: [
        reprocessingItemTypes.ore,
        reprocessingItemTypes.unrefinedMineral,
        reprocessingItemTypes.erratic,
      ],
    },
    2: {
      id: 2,
      security: { 0: 1, 1: 1.06, 2: 1.12 },
      label: "T1 - Moon",
      value: 1,
      relatedTo: [5, 7, 8],
      appliesTo: [reprocessingItemTypes.moonOre],
    },
    3: {
      id: 3,
      security: { 0: 1, 1: 1.06, 2: 1.12 },
      label: "T1 - Ice",
      value: 1,
      relatedTo: [6, 7, 8],
      appliesTo: [reprocessingItemTypes.ice],
    },
    4: {
      id: 4,
      security: { 0: 1, 1: 1.06, 2: 1.12 },
      label: "T2 - Ore",
      value: 3,
      relatedTo: [1, 7, 8],
      appliesTo: [
        reprocessingItemTypes.ore,
        reprocessingItemTypes.unrefinedMineral,
        reprocessingItemTypes.erratic,
      ],
    },
    5: {
      id: 5,
      security: { 0: 1, 1: 1.06, 2: 1.12 },
      label: "T2 - Moon ",
      value: 3,
      relatedTo: [2, 7, 8],
      appliesTo: [reprocessingItemTypes.moonOre],
    },
    6: {
      id: 6,
      security: { 0: 1, 1: 1.06, 2: 1.12 },
      label: "T2 - Ice ",
      value: 3,
      relatedTo: [3, 7, 8],
      appliesTo: [reprocessingItemTypes.ice],
    },
    7: {
      id: 7,
      security: { 0: 1, 1: 1.06, 2: 1.12 },
      label: "T1 - All",
      value: 1,
      relatedTo: [1, 2, 3, 4, 5, 6, 7, 8],
      appliesTo: [
        reprocessingItemTypes.ore,
        reprocessingItemTypes.unrefinedMineral,
        reprocessingItemTypes.erratic,
        reprocessingItemTypes.moonOre,
        reprocessingItemTypes.ice,
      ],
    },
    8: {
      id: 8,
      security: { 0: 1, 1: 1.06, 2: 1.12 },
      label: "T2 - All",
      value: 3,
      relatedTo: [1, 2, 3, 4, 5, 6, 7, 8],
      appliesTo: [
        reprocessingItemTypes.ore,
        reprocessingItemTypes.unrefinedMineral,
        reprocessingItemTypes.erratic,
        reprocessingItemTypes.moonOre,
        reprocessingItemTypes.ice,
      ],
    },
  },
  inventionStructure: {
    0: { id: 0, label: "NPC Station", time: 0, cost: 0, npcStation: true },
    1: {
      id: 1,
      label: "Medium - Engineering Complex",
      time: 0.15,
      cost: 0.03,
      rigSize: 2,
    },
    2: { id: 2, label: "Medium - Other", time: 0, cost: 0, rigSize: 2 },
    3: {
      id: 3,
      label: "Large - Engineering Complex",
      time: 0.2,
      cost: 0.04,
      rigSize: 3,
    },
    4: { id: 4, label: "Large - Other", time: 0, cost: 0, rigSize: 3 },
    5: {
      id: 5,
      label: "X-Large - Engineering Complex",
      time: 0.3,
      cost: 0.05,
      rigSize: 4,
    },
    6: { id: 6, label: "X-Large - Other", time: 0, cost: 0, rigSize: 4 },
  },
  inventionRigs: {
    0: { id: 0, label: "None", cost: 0, time: 0 },
    1: {
      id: 1,
      label: "T1 - Cost Optimization",
      cost: 0,
      time: 0.1,
      relatedTo: [2, 5, 6],
      appliesToAll: true,
    },
    2: {
      id: 2,
      label: "T2 - Cost Optimization",
      cost: 0,
      time: 0.12,
      relatedTo: [1, 5, 6],
      appliesToAll: true,
    },
    3: {
      id: 3,
      label: "T1 - Invention Accelerator",
      cost: 0.2,
      time: 0,
      relatedTo: [4, 5, 6],
      appliesToAll: true,
    },
    4: {
      id: 4,
      label: "T2 - Invention Accelerator",
      cost: 0.24,
      time: 0,
      relatedTo: [3, 5, 6],
      appliesToAll: true,
    },
    5: {
      id: 5,
      label: "T1 - All",
      cost: 0.2,
      time: 0.1,
      relatedTo: [1, 2, 3, 4, 5, 6],
      appliesToAll: true,
    },
    6: {
      id: 6,
      label: "T2 - All",
      cost: 0.24,
      time: 0.12,
      relatedTo: [1, 2, 3, 4, 5, 6],
      appliesToAll: true,
    },
  },
  inventionSystem: {
    0: { id: 0, label: "High Sec", band: "hiSec" },
    1: { id: 1, label: "Low Sec", band: "lowSec" },
    2: { id: 2, label: "Null Sec / WH", band: "nullSec" },
  },
};

/**
 * Mapping of job types to their corresponding structure options.
 *
 * @type {Object}
 * @property {Object} 1 - Manufacturing structure options
 * @property {Object} 2 - Reaction structure options
 * @property {Object} 5 - Reprocessing structure options
 * @property {Object} 4 - Invention structure options
 */
export const structureTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manStructure,
  [jobTypes.reaction]: structureOptions.reactionStructure,
  [jobTypes.reprocessing]: structureOptions.reprocessingStructure,
  [jobTypes.invention]: structureOptions.inventionStructure,
};
/**
 * Mapping of job types to their corresponding rig options.
 *
 * @type {Object}
 * @property {Object} 1 - Manufacturing rig options
 * @property {Object} 2 - Reaction rig options
 * @property {Object} 5 - Reprocessing rig options
 * @property {Object} 4 - Invention rig options
 */
export const rigTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manRigs,
  [jobTypes.reaction]: structureOptions.reactionRigs,
  [jobTypes.reprocessing]: structureOptions.reprocessingRigs,
  [jobTypes.invention]: structureOptions.inventionRigs,
};
/**
 * Mapping of job types to their corresponding system security modifiers.
 *
 * @type {Object}
 * @property {Object} 1 - Manufacturing system modifiers
 * @property {Object} 2 - Reaction system modifiers
 * @property {Object} 5 - Reprocessing system modifiers
 * @property {Object} 4 - Invention system modifiers
 */
export const systemTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manSystem,
  [jobTypes.reaction]: structureOptions.reactionSystem,
  [jobTypes.reprocessing]: structureOptions.reprocessingSystem,
  [jobTypes.invention]: structureOptions.inventionSystem,
};

/**
 * Mapping of job types to their custom structure property names.
 *
 * @type {Object}
 * @property {string} 1 - "manufacturing" (under `customStructures`)
 * @property {string} 2 - "reaction"
 * @property {string} 5 - "reprocessing"
 * @property {string} 4 - "invention"
 */
export const customStructureMap = {
  [jobTypes.manufacturing]: "manufacturing",
  [jobTypes.reaction]: "reaction",
  [jobTypes.reprocessing]: "reprocessing",
  [jobTypes.invention]: "invention",
};

/**
 * What a saved row's id is prefixed with, by the kind the row is; fixed, because every minted id
 * already carries it.
 *
 * @type {Object<number, string>}
 */
export const customStructureLocationMap = {
  [jobTypes.manufacturing]: "manStruct",
  [jobTypes.reaction]: "reacStruct",
  [jobTypes.reprocessing]: "reprocessingStruct",
  [jobTypes.invention]: "inventionStruct",
  [structureKinds.market]: "market",
};

/**
 * The solar system The Fulcrum sits in, which is the only place industry runs in
 * Zarzakh.
 *
 * @type {number}
 */
export const ZARZAKH_SYSTEM_ID = 30100000;

/**
 * The security band a setup names when it was built at The Fulcrum, kept so those
 * setups still read.
 *
 * @type {number}
 */
export const zarzakhSecurityBandID = 3;

/**
 * The null security band, which is the one Zarzakh is in: `mapSolarSystems`
 * gives it a security status of -1.0.
 *
 * @type {number}
 */
export const nullSecurityBandID = 2;

/**
 * Where a job may be run, and what that place fixes about the setup that runs there.
 *
 * @type {Array<{id: string, label: string, jobTypes: Array<number>|null,
 * when: Array<Object>, forces: Object, enlistedValues?: Object}>}
 */
export const placeConstraints = [
  {
    id: "theFulcrum",
    label: "The Fulcrum",
    jobTypes: [jobTypes.manufacturing],
    when: [
      { structureID: 4 },
      { systemID: ZARZAKH_SYSTEM_ID },
      { systemTypeID: zarzakhSecurityBandID },
    ],
    forces: {
      structureID: 4,
      systemTypeID: nullSecurityBandID,
      systemID: ZARZAKH_SYSTEM_ID,
      rigSlot1: 0,
      rigSlot2: 0,
      taxValue: 0.25,
    },
    enlistedValues: {
      factions: [pirateFactions.angelCartel, pirateFactions.guristas],
      sccSurchargeReduction: 0.9,
    },
  },
  {
    id: "npcStation",
    label: "NPC Station",
    jobTypes: null,
    when: [{ structureID: 0 }],
    forces: { rigSlot1: 0, rigSlot2: 0, taxValue: 0.25 },
  },
];

/**
 * Defines the SCC surcharge for EVE Online industry jobs.
 * Used for calculating the install cost of industry jobs.
 *
 * @type {number}
 */
export const SCC_SURCHARGE = 0.04;

/**
 * What one level of a holding faction's system upgrades takes off industry cost in
 * its own NPC stations.
 *
 * @type {number}
 */
export const MILITIA_DISCOUNT_PER_LEVEL = 0.1;

/**
 * Defines the Alpha clone tax for EVE Online industry jobs.
 * Used for calculating the install cost of industry jobs.
 *
 * @type {number}
 */
export const ALPHA_CLONE_TAX = 0.25;

/**
 * Structure type tooltip content for EVE Online structures.
 *
 * @type {JSX.Element}
 */
export const structureTypeTooltip = (
  <span>
    <p>Medium: Astrahus, Athanor, Raitaru</p>
    <p>Large: Azbel, Fortizar, Tatara</p>
    <p>X-Large: Keepstar, Sotiyo</p>
  </span>
);

/**
 * Small text format configuration for Material-UI Typography.
 *
 * @type {Object}
 * @property {string} xs - Extra small screen text size
 */
export const SMALL_TEXT_FORMAT = { xs: "caption" };
/**
 * Standard text format configuration for Material-UI Typography.
 *
 * @type {Object}
 * @property {string} xs - Extra small screen text size
 * @property {string} sm - Small screen text size
 */
export const STANDARD_TEXT_FORMAT = { xs: "caption", sm: "body2" };
/**
 * Large text format configuration for Material-UI Typography.
 *
 * @type {Object}
 * @property {string} xs - Extra small screen text size
 * @property {string} sm - Small screen text size
 */
export const LARGE_TEXT_FORMAT = { xs: "caption", sm: "body1" };

/**
 * Meta levels that require invention costs in EVE Online.
 *
 * @type {Set<number>}
 */
export const META_LEVELS_THAT_REQUIRE_INVENTION_COSTS = new Set([2, 14, 53]);
/**
 * Type IDs to ignore for invention costs in EVE Online.
 *
 * @type {Set<number>}
 */
export const TYPE_IDS_TO_IGNORE_FOR_INVENTION_COSTS = new Set([]);

/**
 * Reprocessing implant options (RX series).
 *
 * @type {Object<number, { id: number, typeID: number, label: string, value: number }>}
 */
export const reprocessingImplants = {
  0: {
    id: 0,
    typeID: 0,
    label: "None",
    value: 0,
  },
  1: {
    id: 1,
    typeID: 0,
    label: "RX-001",
    value: 0.01,
  },
  2: {
    id: 2,
    typeID: 0,
    label: "RX-002",
    value: 0.02,
  },
  3: {
    id: 3,
    typeID: 0,
    label: "RX-004",
    value: 0.04,
  },
};

/**
 * Per-job-type implant lookup (reprocessing only).
 *
 * @type {Object}
 */
export const Implants = {
  [jobTypes.reprocessing]: reprocessingImplants,
};

/**
 * Static data cache version identifier.
 *
 * @type {string}
 */
export const STATIC_DATA_CACHE = "static-data-cache-v2";

/**
 * The static data files the server publishes, by the key its metadata names them under; a test in
 * `shared/core/sde/files.go` keeps the two lists in step.
 *
 * @type {Object<string, string>}
 */
export const CACHED_DATA_FILES = {
  SEARCH_INDEX: "SEARCH_INDEX",
  FULL_ITEM_LIST: "FULL_ITEM_LIST",
  REPROCESSING_DATA: "REPROCESSING_DATA",
  RECIPE_LIST: "RECIPE_LIST",
  INVENTION_MODIFIERS: "INVENTION_MODIFIERS",
  MARKET_GROUPS: "MARKET_GROUPS",
  SOLAR_SYSTEMS: "SOLAR_SYSTEMS",
  INDUSTRY_BONUSES: "INDUSTRY_BONUSES",
};

/** The compressed-ore choices a planner's ore selection takes. */
export const compressedOreChoices = {
  prefer: "prefer",
  allow: "allow",
  avoid: "avoid",
};

/** The ways shipping is charged on ore bought: per m³, or one amount for the whole purchase. */
export const shippingModes = {
  perVolume: "perVolume",
  fixed: "fixed",
};

/**
 * The reprocessing settings a planner starts with, built fresh so no caller shares the list.
 *
 * @returns {{compressedOre: string, countLeftoversAsSold: boolean, buyOutright: boolean,
 *   shipping: {mode: string, amount: number}, neverChoose: Array<number>}}
 */
export function defaultPlannerReprocessingSettings() {
  return {
    compressedOre: compressedOreChoices.prefer,
    countLeftoversAsSold: false,
    buyOutright: false,
    shipping: { mode: shippingModes.perVolume, amount: 0 },
    neverChoose: [],
  };
}

/**
 * ESI Rate Limit Groups configuration for EVE Online API.
 *
 * @type {Object}
 * @property {Object} character - Character data endpoints
 * @property {Object} corporation - Corporation data endpoints
 * @property {Object} alliance - Alliance data endpoints
 * @property {Object} universe - Universe data endpoints
 * @property {Object} market - Market data endpoints
 * @property {Object} routes - Route calculation endpoints
 * @property {Object} sovereignty - Sovereignty data endpoints
 * @property {Object} fitting - Ship fitting endpoints
 * @property {Object} fleets - Fleet management endpoints
 * @property {Object} industry - Industry and manufacturing endpoints
 * @property {Object} notifications - Notification endpoints
 * @property {Object} ui - User interface data endpoints
 * @property {Object} location - Location and positioning endpoints
 * @property {Object} killmails - Killmail and combat data endpoints
 * @property {Object} wars - War data endpoints
 * @property {Object} assets - Asset and inventory endpoints
 * @property {Object} contracts - Contract and trading endpoints
 */
export const ESI_RATE_LIMIT_GROUPS = {
  status: {
    name: "status",
    disabled: false,
    maxTokens: 600,
    windowSize: 15 * 60 * 1000,
    description: "Server status and health endpoints",
  },

  fw: {
    name: "fw",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Factional warfare data endpoints",
  },
  incursions: {
    name: "incursions",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Incursion data endpoints",
  },
  insurance: {
    name: "insurance",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Insurance calculation endpoints",
  },
  routes: {
    name: "routes",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Route calculation endpoints",
  },
  sovereignty: {
    name: "sovereignty",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Sovereignty data endpoints",
  },

  fitting: {
    name: "fitting",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Ship fitting endpoints",
  },
  fleets: {
    name: "fleets",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Fleet management endpoints",
  },
  industry: {
    name: "industry",
    disabled: true,
    maxTokens: 600,
    windowSize: 15 * 60 * 1000,
    description: "Industry and manufacturing endpoints",
  },
  notifications: {
    name: "notifications",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Notification endpoints",
  },
  ui: {
    name: "ui",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "User interface data endpoints",
  },

  location: {
    name: "location",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Location and positioning endpoints",
  },

  killmails: {
    name: "killmails",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Killmail and combat data endpoints",
  },
  wars: {
    name: "wars",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "War data endpoints",
  },

  assets: {
    name: "assets",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Asset and inventory endpoints",
  },

  contracts: {
    name: "contracts",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Contract and trading endpoints",
  },
  universe: {
    name: "universe",
    disabled: true,
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Universe data endpoints",
  },
};

/**
 * The industry activities that carry a system cost index, as ESI's industry systems endpoint
 * reports them.
 *
 * @type {Object}
 * @property {Object} [jobTypes.manufacturing] - Manufacturing activity configuration
 * @property {number} [jobTypes.manufacturing].id - Job type ID for manufacturing
 * @property {string} [jobTypes.manufacturing].label - Display name for manufacturing
 * @property {Object} [jobTypes.reaction] - Reaction activity configuration
 * @property {number} [jobTypes.reaction].id - Job type ID for reactions
 * @property {string} [jobTypes.reaction].label - Display name for reactions
 */
export const systemIndexTypes = {
  [jobTypeMapping[jobTypes.manufacturing]]: {
    id: jobTypeMapping[jobTypes.manufacturing],
    label: "Manufacturing",
  },
  [jobTypeMapping[jobTypes.reaction]]: {
    id: jobTypeMapping[jobTypes.reaction],
    label: "Reaction",
  },
  [jobTypeMapping[jobTypes.invention]]: {
    id: jobTypeMapping[jobTypes.invention],
    label: "Invention",
  },
};
