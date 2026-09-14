/**
 * Fixed planner workflow stages (ids and default labels). Custom names come from
 * `application_settings.jobStatuses` on the server; display rows are built in
 * {@link ../../Functions/Helper/jobStatuses.js}.
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
 * Market listing types for EVE Online market data.
 *
 * Buy and sell orders report the best price available at a trade hub. The percentile variants
 * report the same order books with outlying quotes excluded: the 95th percentile of buy prices
 * and the 5th percentile of sell prices. Percentiles are computed over order prices without
 * volume weighting, and fall back to the best price when a book holds too few orders to be
 * meaningful.
 *
 * @type {Array<Object>}
 * @property {string} id - Unique identifier for the listing type
 * @property {string} name - Display name for the listing type
 */
export let LISTING_TYPES = [
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
      "Ignores the top few bids, so a thin book stops flattering the estimate.",
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
 * Reprocessing item type enumeration.
 *
 * @type {Object}
 * @property {number} ore - Regular asteroid ore
 * @property {number} moonOre - Moon mining ore
 * @property {number} ice - Ice mining materials
 * @property {number} gas - Gas cloud materials
 * @property {number} scrap - Scrap materials
 */
export const reprocessingItemTypes = {
  ore: 0,
  moonOre: 1,
  ice: 2,
  gas: 3,
  scrap: 4,
  unrefinedOre: 5,
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
 * @property {string} 5 - "unrefinedOre"
 */
export const reprocessingItemTypesByValue = {
  [reprocessingItemTypes.ore]: "ore",
  [reprocessingItemTypes.moonOre]: "moonOre",
  [reprocessingItemTypes.ice]: "ice",
  [reprocessingItemTypes.gas]: "gas",
  [reprocessingItemTypes.scrap]: "scrap",
  [reprocessingItemTypes.unrefinedOre]: "unrefinedOre",
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
 * What an NPC station charges to list an order, before the seller reduces it.
 * A citadel uses none of these: its owner sets the rate, and Broker Relations does
 * not reduce it.
 *
 * With the coefficients below, maximum skill and standings reach exactly 1%, so
 * the published NPC floor needs no clamp of its own. Negative standings raise the
 * rate above base, which is correct.
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
 * What every sale is taxed, before the seller reduces it.
 *
 * Accounting reduces this **multiplicatively** — `base × (1 − accounting × level)`
 * — where the broker fee above subtracts its coefficients. The two read alike and
 * do not behave alike, so applying one form to the other is the easy mistake:
 * subtracting here would give 6.95% at Accounting V instead of 3.375%.
 *
 * Tax is charged at NPC stations and citadels alike, since it has no station or
 * structure component.
 *
 * @type {Object}
 * @property {number} base - Percentage charged before any reduction
 * @property {number} accounting - Fraction of the base removed per level of Accounting
 */
export const salesTaxRates = {
  base: 7.5,
  accounting: 0.11,
};

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
 * Skills that shorten a job rather than a blueprint's own requirements.
 *
 * They are applied once as a modifier over the whole job, so the per-skill 1%
 * reduction every other required skill gives must not also be applied to them.
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
 * @property {Object} manSystem - Manufacturing system security modifiers
 * @property {Object} reactionSystem - Reaction system security modifiers
 * @property {Object} reactionStructure - Reaction structure options
 * @property {Object} reactionRigs - Reaction rig options
 * @property {Object} reprocessingSystem - Reprocessing system security modifiers
 * @property {Object} reprocessingStructure - Reprocessing structure options
 * @property {Object} reprocessingRigs - Reprocessing rig options
 * @property {Object} inventionStructure - Invention structure options
 * @property {Object} inventionRigs - Invention rig options
 * @property {Object} inventionSystem - Invention system security modifiers
 */
export const structureOptions = {
  manStructure: {
    0: {
      id: 0,
      label: "NPC Station",
      material: 0,
      time: 0,
      cost: 0,
      requirementID: 2,
    },
    1: { id: 1, label: "Medium", material: 1, time: 0.15, cost: 0.03 },
    2: { id: 2, label: "Large", material: 1, time: 0.2, cost: 0.04 },
    3: { id: 3, label: "X-Large", material: 1, time: 0.3, cost: 0.05 },
    4: {
      id: 4,
      label: "The Fulcrum",
      material: 1.06,
      time: 0.7,
      cost: 0.9,
      requirementID: 0,
    },
  },

  manRigs: {
    0: { id: 0, label: "None", material: 0, time: 0 },
    1: { id: 1, label: "T1 - ME", material: 2.0, time: 0 },
    2: { id: 2, label: "T2 - ME", material: 2.4, time: 0 },
    3: { id: 3, label: "T1 - TE", material: 0, time: 0.2 },
    4: { id: 4, label: "T2 - TE", material: 0, time: 0.24 },
    5: { id: 5, label: "T1 - ME & TE", material: 2.0, time: 0.2 },
    6: { id: 6, label: "T2 - ME & TE", material: 2.4, time: 0.24 },
    7: { id: 7, label: "T1 - ME, T2 - TE ", material: 2.0, time: 0.24 },
    8: { id: 8, label: "T2 - ME, T1 - TE", material: 2.4, time: 0.2 },
    9: { id: 9, label: "Faction", material: 3.7, time: 0.2, requirementID: 1 },
  },

  manSystem: {
    0: { id: 0, label: "High Sec", value: 1 },
    1: { id: 1, label: "Low Sec", value: 1.9 },
    2: { id: 2, label: "Null Sec / WH", value: 2.1 },
    3: {
      id: 3,
      label: "Zarzakh",
      value: 1,
      requirementID: 0,
    },
  },
  reactionSystem: {
    0: { id: 0, label: "Low Sec", value: 1 },
    1: { id: 1, label: "Null Sec / WH", value: 1.1 },
  },
  reactionStructure: {
    0: { id: 0, label: "Medium", material: 1, time: 0, cost: 0 },
    1: { id: 1, label: "Large", material: 1, time: 0.25, cost: 0 },
  },
  reactionRigs: {
    0: { id: 0, label: "None", material: 0, time: 0 },
    1: { id: 1, label: "T1 - ME", material: 2.0, time: 0 },
    2: { id: 2, label: "T2 - ME", material: 2.4, time: 0 },
    3: { id: 3, label: "T1 - TE", material: 0, time: 0.2 },
    4: { id: 4, label: "T2 - TE", material: 0, time: 0.24 },
    5: { id: 5, label: "T1 - ME & TE", material: 2.0, time: 0.2 },
    6: { id: 6, label: "T2 - ME & TE", material: 2.4, time: 0.24 },
    7: { id: 7, label: "T1 - ME, T2 - TE ", material: 2.0, time: 0.24 },
    8: { id: 8, label: "T2 - ME, T1 - TE", material: 2.4, time: 0.2 },
  },
  reprocessingSystem: {
    0: { id: 0, label: "High Sec", value: 0 },
    1: { id: 1, label: "Low Sec", value: 0.06 },
    2: { id: 2, label: "Null Sec / WH", value: 0.12 },
  },
  reprocessingStructure: {
    0: {
      id: 0,
      label: "NPC Station",
      ore: 0,
      gas: 0,
      cost: 0,
    },
    1: { id: 1, label: "Medium Refinary", ore: 0.02, gas: 4, cost: 0 },
    2: { id: 2, label: "Medium Other", ore: 0, gas: 0, cost: 0 },
    3: { id: 3, label: "Large Refinary", ore: 0.055, gas: 10, cost: 0 },
    4: { id: 4, label: "Large Other", ore: 0, gas: 0, cost: 0 },
    5: { id: 5, label: "X-Large Other", ore: 0, gas: 0, cost: 0 },
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
      label: "T1 - Ore",
      value: 1,
      relatedTo: [4, 7, 8],
      appliesTo: [
        reprocessingItemTypes.ore,
        reprocessingItemTypes.unrefinedOre,
      ],
    },
    2: {
      id: 2,
      label: "T1 - Moon",
      value: 1,
      relatedTo: [5, 7, 8],
      appliesTo: [reprocessingItemTypes.moonOre],
    },
    3: {
      id: 3,
      label: "T1 - Ice",
      value: 1,
      relatedTo: [6, 7, 8],
      appliesTo: [reprocessingItemTypes.ice],
    },
    4: {
      id: 4,
      label: "T2 - Ore",
      value: 3,
      relatedTo: [1, 7, 8],
      appliesTo: [
        reprocessingItemTypes.ore,
        reprocessingItemTypes.unrefinedOre,
      ],
    },
    5: {
      id: 5,
      label: "T2 - Moon ",
      value: 3,
      relatedTo: [2, 7, 8],
      appliesTo: [reprocessingItemTypes.moonOre],
    },
    6: {
      id: 6,
      label: "T2 - Ice ",
      value: 3,
      relatedTo: [3, 7, 8],
      appliesTo: [reprocessingItemTypes.ice],
    },
    7: {
      id: 7,
      label: "T1 - All",
      value: 1,
      relatedTo: [1, 2, 3, 4, 5, 6, 7, 8],
      appliesTo: [
        reprocessingItemTypes.ore,
        reprocessingItemTypes.unrefinedOre,
        reprocessingItemTypes.moonOre,
        reprocessingItemTypes.ice,
      ],
    },
    8: {
      id: 8,
      label: "T2 - All",
      value: 3,
      relatedTo: [1, 2, 3, 4, 5, 6, 7, 8],
      appliesTo: [
        reprocessingItemTypes.ore,
        reprocessingItemTypes.unrefinedOre,
        reprocessingItemTypes.moonOre,
        reprocessingItemTypes.ice,
      ],
    },
  },
  inventionStructure: {
    0: { id: 0, label: "NPC Station", time: 0, cost: 0 },
    1: { id: 1, label: "Medium - Engineering Complex", time: 0.15, cost: 0.03 },
    2: { id: 2, label: "Medium - Other", time: 0, cost: 0 },
    3: { id: 3, label: "Large - Engineering Complex", time: 0.2, cost: 0.04 },
    4: { id: 4, label: "Large - Other", time: 0, cost: 0 },
    5: { id: 5, label: "X-Large - Engineering Complex", time: 0.3, cost: 0.05 },
    6: { id: 6, label: "X-Large - Other", time: 0, cost: 0 },
  },
  inventionRigs: {
    0: { id: 0, label: "None", cost: 0, time: 0 },
    1: {
      id: 1,
      label: "T1 - Cost Optimization",
      cost: 0,
      time: 0.1,
      relatedTo: [2, 5, 6],
    },
    2: {
      id: 2,
      label: "T2 - Cost Optimization",
      cost: 0,
      time: 0.12,
      relatedTo: [1, 5, 6],
    },
    3: {
      id: 3,
      label: "T1 - Invention Accelerator",
      cost: 0.2,
      time: 0,
      relatedTo: [4, 5, 6],
    },
    4: {
      id: 4,
      label: "T2 - Invention Accelerator",
      cost: 0.24,
      time: 0,
      relatedTo: [3, 5, 6],
    },
    5: {
      id: 5,
      label: "T1 - All",
      cost: 0.2,
      time: 0.1,
      relatedTo: [1, 2, 3, 4, 5, 6],
    },
    6: {
      id: 6,
      label: "T2 - All",
      cost: 0.24,
      time: 0.12,
      relatedTo: [1, 2, 3, 4, 5, 6],
    },
  },
  inventionSystem: {
    0: { id: 0, label: "High Sec", value: 1 },
    1: { id: 1, label: "Low Sec", value: 1.9 },
    2: { id: 2, label: "Null Sec / WH", value: 2.1 },
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
 * Mapping of job types to their custom structure location property names.
 *
 * @type {Object}
 * @property {string} 1 - "manStruct"
 * @property {string} 2 - "reacStruct"
 * @property {string} 5 - "reprocessingStruct"
 * @property {string} 4 - "inventionStruct"
 */
export const customStructureLocationMap = {
  [jobTypes.manufacturing]: "manStruct",
  [jobTypes.reaction]: "reacStruct",
  [jobTypes.reprocessing]: "reprocessingStruct",
  [jobTypes.invention]: "inventionStruct",
};

/**
 * System structure requirements for different job types.
 *
 * @type {Object}
 * @property {Object} 30100000 - System ID requirements
 * @property {Array<number>} 30100000.allowedJobTypes - Allowed job types for this system
 * @property {number} 30100000.requirementID - Requirement ID for this system
 */
export const systemStructureRequirements = {
  30100000: {
    allowedJobTypes: [jobTypes.manufacturing],
    requirementID: 0,
  },
};

/**
 * Requirements mapping for structures and rigs.
 *
 * @type {Object}
 * @property {Object} 0 - The Fulcrum requirements
 * @property {Object} 1 - Thukker Manufacturing Rigs requirements
 * @property {Object} 2 - NPC Station requirements
 */
export const requirements = {
  0: {
    id: 0,
    rigID: 0,
    systemTypeID: 3,
    structureID: 4,
    systemID: 30100000,
    taxValue: 0.25,
    allowedJobTypes: [jobTypes.manufacturing],
    label: "The Fulcrum - Zarzak",
  },
  1: {
    id: 1,
    rigID: 9,
    alternativeSystemValue: {
      0: 0.1,
      1: 1.9,
      2: 0.1,
    },
    allowedJobTypes: [jobTypes.manufacturing],
    label: "Thukker Manufacturing Rigs",
  },
  2: {
    id: 2,
    rigID: 0,
    structureID: 0,
    taxValue: 0.25,
    label: "NPC Station",
  },
};

/**
 * Defines the SCC surcharge for EVE Online industry jobs.
 * Used for calculating the install cost of industry jobs.
 *
 * @type {number}
 */
export const SCC_SURCHARGE = 0.04;

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
 * The static data files the server publishes, by the key its metadata names them
 * under. A key that does not match one the server serves throws on first use, so
 * this list answers to `staticDataFileDefs` in `shared/core/sde/files.go`, and a
 * test there fails if the two ever disagree.
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
};

/**
 * Default reprocessing calculation settings for EVE Online.
 *
 * @type {Object}
 * @property {boolean} preferCompressed - Whether to prefer compressed ores
 * @property {number} compressionBonusMultiplier - Bonus multiplier for compressed ores
 * @property {number} valueMultiplier - Cost-effectiveness prioritisation multiplier
 * @property {number} wastePenaltyMultiplier - Penalty multiplier for excess minerals
 * @property {boolean} sellExcessMineralTypes - Whether to sell excess mineral types
 */
export const DEFAULT_REPROCESSING_CALCULATION_SETTINGS = {
  preferCompressed: true, // Whether to prefer compressed ores
  compressionBonusMultiplier: 0.25, // How much bonus to give compressed ores (higher = prefer compressed more)
  valueMultiplier: 2, // How much to prioritize cost-effectiveness (higher = prefer cheaper ores)
  wastePenaltyMultiplier: 0.1, // How much to penalize excess minerals (higher = avoid wasteful ores)
  sellExcessMineralTypes: false, // Whether to sell excess mineral types instead of keeping them
};

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
  // 13 October 2025 rollout
  status: {
    name: "status",
    disabled: false, // Disabled until 13 October 2025
    maxTokens: 600,
    windowSize: 15 * 60 * 1000,
    description: "Server status and health endpoints",
  },

  // 27 October 2025 rollout
  fw: {
    name: "fw",
    disabled: true, // Disabled until 27 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Factional warfare data endpoints",
  },
  incursions: {
    name: "incursions",
    disabled: true, // Disabled until 27 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Incursion data endpoints",
  },
  insurance: {
    name: "insurance",
    disabled: true, // Disabled until 27 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Insurance calculation endpoints",
  },
  routes: {
    name: "routes",
    disabled: true, // Disabled until 27 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Route calculation endpoints",
  },
  sovereignty: {
    name: "sovereignty",
    disabled: true, // Disabled until 27 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Sovereignty data endpoints",
  },

  // 30 October 2025 rollout
  fitting: {
    name: "fitting",
    disabled: true, // Disabled until 30 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Ship fitting endpoints",
  },
  fleets: {
    name: "fleets",
    disabled: true, // Disabled until 30 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Fleet management endpoints",
  },
  industry: {
    name: "industry",
    disabled: true, // Disabled until 30 October 2025
    maxTokens: 600,
    windowSize: 15 * 60 * 1000,
    description: "Industry and manufacturing endpoints",
  },
  notifications: {
    name: "notifications",
    disabled: true, // Disabled until 30 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Notification endpoints",
  },
  ui: {
    name: "ui",
    disabled: true, // Disabled until 30 October 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "User interface data endpoints",
  },

  // 3 November 2025 rollout
  location: {
    name: "location",
    disabled: true, // Disabled until 3 November 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Location and positioning endpoints",
  },

  // 6 November 2025 rollout
  killmails: {
    name: "killmails",
    disabled: true, // Disabled until 6 November 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Killmail and combat data endpoints",
  },
  wars: {
    name: "wars",
    disabled: true, // Disabled until 6 November 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "War data endpoints",
  },

  // 24 November 2025 rollout
  assets: {
    name: "assets",
    disabled: true, // Disabled until 24 November 2025
    maxTokens: 150,
    windowSize: 15 * 60 * 1000,
    description: "Asset and inventory endpoints",
  },

  // 27 November 2025 rollout
  contracts: {
    name: "contracts",
    disabled: true, // Disabled until 27 November 2025
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
 * System index types for EVE Online industry activities.
 *
 * Based on the EVE Online ESI API GetIndustrySystems endpoint, these represent
 * the different types of industry activities that have system cost indices.
 * Each activity type affects the cost of performing that specific industry
 * operation in a given solar system.
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
