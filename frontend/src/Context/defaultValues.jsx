/**
 * Default job status configuration for EVE Industry Planner.
 *
 * Defines the standard workflow stages for industry jobs, including their display properties
 * and API integration settings. Each status represents a different phase in the industry
 * job lifecycle from planning to completion and sale.
 *
 * @type {Array<Object>}
 * @property {number} id - Unique identifier for the status
 * @property {string} name - Display name for the status
 * @property {number} sortOrder - Order for display sorting
 * @property {boolean} expanded - Whether this status section is expanded by default
 * @property {boolean} openAPIJobs - Whether to show open API jobs for this status
 * @property {boolean} completeAPIJobs - Whether to show completed API jobs for this status
 *
 * @example
 * [
 *   { id: 0, name: "Planning", sortOrder: 0, expanded: true, openAPIJobs: false, completeAPIJobs: false },
 *   { id: 1, name: "Purchasing", sortOrder: 1, expanded: true, openAPIJobs: false, completeAPIJobs: false }
 * ]
 */
export let jobStatusDefault = [
  {
    id: 0,
    name: "Planning",
    sortOrder: 0,
    expanded: true,
    openAPIJobs: false,
    completeAPIJobs: false,
  },
  {
    id: 1,
    name: "Purchasing",
    sortOrder: 1,
    expanded: true,
    openAPIJobs: false,
    completeAPIJobs: false,
  },
  {
    id: 2,
    name: "Building",
    sortOrder: 2,
    expanded: true,
    openAPIJobs: true,
    completeAPIJobs: false,
  },
  {
    id: 3,
    name: "Complete",
    sortOrder: 3,
    expanded: true,
    openAPIJobs: false,
    completeAPIJobs: true,
  },
  {
    id: 4,
    name: "For Sale",
    sortOrder: 4,
    expanded: true,
    openAPIJobs: false,
    completeAPIJobs: false,
  },
];

/**
 * Default categories for extra costs in EVE Industry Planner.
 *
 * Defines the standard categories for additional costs that can be associated with
 * industry jobs, such as hauling services, blueprint copies, and other expenses.
 *
 * @type {Array<Object>}
 * @property {string} id - Unique identifier for the category
 * @property {string} label - Display label for the category
 * @property {boolean} permanent - Whether the category is permanent and cannot be removed
 *
 * @example
 * [
 *   { id: "0", label: "Unassigned", permanent: true },
 *   { id: "1", label: "Hauling Service", permanent: false },
 *   { id: "2", label: "Jump Freight Service", permanent: false },
 * ]
 */
export const extrasCategoriesDefault = [
  { id: "0", label: "Unassigned" },
  { id: "1", label: "Hauling Service" },
  { id: "2", label: "Jump Freight Service" },
  { id: "3", label: "Blueprint Copies" },
  { id: "4", label: "Loyal Point Costs" },
  { id: "5", label: "Other" },
];

/**
 * Permanent extras categories for EVE Industry Planner.
 *
 * Defines the categories that are permanent and cannot be removed.
 *
 * @type {Set<number>}
 * @property {string} "0" - Unassigned
 * @property {string} "5" - Other
 */

export const permanentExtrasCategories = new Set(["0", "5"]);

/**
 * Market listing types for EVE Online market data.
 *
 * Defines the two main types of market orders available in EVE Online:
 * buy orders (where players buy items) and sell orders (where players sell items).
 *
 * @type {Array<Object>}
 * @property {string} id - Unique identifier for the listing type
 * @property {string} name - Display name for the listing type
 *
 * @example
 * [
 *   { id: "buy", name: "Buy Orders" },
 *   { id: "sell", name: "Sell Orders" }
 * ]
 */
export let listingType = [
  { id: "buy", name: "Buy Orders" },
  { id: "sell", name: "Sell Orders" },
];

/**
 * Job type enumeration for EVE Online industry activities.
 *
 * Defines the different types of industry jobs available in EVE Online,
 * each representing a different manufacturing or processing activity.
 *
 * @type {Object}
 * @property {number} baseMaterial - Base material (raw materials)
 * @property {number} manufacturing - Manufacturing jobs
 * @property {number} reaction - Reaction jobs
 * @property {number} pi - Planetary Interaction jobs
 * @property {number} invention - Invention jobs
 * @property {number} reprocessing - Reprocessing jobs
 *
 * @example
 * {
 *   baseMaterial: 0,
 *   manufacturing: 1,
 *   reaction: 2,
 *   pi: 3,
 *   invention: 4,
 *   reprocessing: 5
 * }
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
 * Provides a reverse lookup from job type numeric IDs to their corresponding
 * string names for API calls and data processing.
 *
 * @type {Object}
 * @property {string} 1 - "manufacturing"
 * @property {string} 2 - "reaction"
 * @property {string} 4 - "invention"
 * @property {string} 5 - "reprocessing"
 *
 * @example
 * {
 *   1: "manufacturing",
 *   2: "reaction",
 *   4: "invention",
 *   5: "reprocessing"
 * }
 */
export const jobTypeMapping = {
  [jobTypes.manufacturing]: "manufacturing",
  [jobTypes.reaction]: "reaction",
  [jobTypes.invention]: "invention",
  [jobTypes.reprocessing]: "reprocessing",
};

/**
 * Reprocessing item type enumeration.
 *
 * Defines the different types of materials that can be reprocessed in EVE Online,
 * each requiring different skills, structures, and efficiency calculations.
 *
 * @type {Object}
 * @property {number} ore - Regular asteroid ore
 * @property {number} moonOre - Moon mining ore
 * @property {number} ice - Ice mining materials
 * @property {number} gas - Gas cloud materials
 * @property {number} scrap - Scrap materials
 *
 * @example
 * {
 *   ore: 0,
 *   moonOre: 1,
 *   ice: 2,
 *   gas: 3,
 *   scrap: 4
 * }
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
 * Provides a reverse lookup from reprocessing item type numeric IDs to their
 * corresponding string names for API calls and data processing.
 *
 * @type {Object}
 * @property {string} 0 - "ore"
 * @property {string} 1 - "moonOre"
 * @property {string} 2 - "ice"
 * @property {string} 3 - "gas"
 * @property {string} 4 - "scrap"
 * @property {string} 5 - "unrefinedOre"
 *
 * @example
 * {
 *   0: "ore",
 *   1: "moonOre",
 *   2: "ice",
 *   3: "gas",
 *   4: "scrap",
 *   5: "unrefinedOre"
 * }
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
 * Defines the available Material Efficiency (ME) and Time Efficiency (TE) levels
 * for blueprints. ME reduces material requirements, while TE reduces manufacturing time.
 *
 * @type {Object}
 * @property {Array<Object>} me - Material Efficiency options (0-10)
 * @property {Array<Object>} te - Time Efficiency options (0-10, but labels show actual TE values)
 *
 * @example
 * {
 *   me: [
 *     { value: 0, label: "0" },
 *     { value: 1, label: "1" }
 *   ],
 *   te: [
 *     { value: 0, label: "0" },
 *     { value: 1, label: "2" }
 *   ]
 * }
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
 * Structure options for EVE Online industry calculations.
 *
 * Defines all available structures, rigs, and system modifiers for different
 * industry activities including manufacturing, reactions, and reprocessing.
 * Each structure type has different efficiency bonuses and requirements.
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
 *
 * @example
 * {
 *   manStructure: {
 *     0: { id: 0, label: "NPC Station", material: 0, time: 0, cost: 0, requirementID: 2 },
 *     1: { id: 1, label: "Medium", material: 1, time: 0.15, cost: 0.03 }
 *   }
 * }
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
};

/**
 * Mapping of job types to their corresponding structure options.
 *
 * Provides a lookup table to get the appropriate structure options
 * for each type of industry job.
 *
 * @type {Object}
 * @property {Object} 1 - Manufacturing structure options
 * @property {Object} 2 - Reaction structure options
 * @property {Object} 5 - Reprocessing structure options
 */
export const structureTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manStructure,
  [jobTypes.reaction]: structureOptions.reactionStructure,
  [jobTypes.reprocessing]: structureOptions.reprocessingStructure,
};
/**
 * Mapping of job types to their corresponding rig options.
 *
 * Provides a lookup table to get the appropriate rig options
 * for each type of industry job.
 *
 * @type {Object}
 * @property {Object} 1 - Manufacturing rig options
 * @property {Object} 2 - Reaction rig options
 * @property {Object} 5 - Reprocessing rig options
 */
export const rigTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manRigs,
  [jobTypes.reaction]: structureOptions.reactionRigs,
  [jobTypes.reprocessing]: structureOptions.reprocessingRigs,
};
/**
 * Mapping of job types to their corresponding system security modifiers.
 *
 * Provides a lookup table to get the appropriate system security modifiers
 * for each type of industry job.
 *
 * @type {Object}
 * @property {Object} 1 - Manufacturing system modifiers
 * @property {Object} 2 - Reaction system modifiers
 * @property {Object} 5 - Reprocessing system modifiers
 */
export const systemTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manSystem,
  [jobTypes.reaction]: structureOptions.reactionSystem,
  [jobTypes.reprocessing]: structureOptions.reprocessingSystem,
};

/**
 * Mapping of job types to their custom structure property names.
 *
 * Provides a lookup table to get the property name for custom structures
 * in user data for each type of industry job.
 *
 * @type {Object}
 * @property {string} 1 - "manufacturingStructures"
 * @property {string} 2 - "reactionStructures"
 * @property {string} 5 - "reprocessingStructures"
 */
export const customStructureMap = {
  [jobTypes.manufacturing]: "manufacturingStructures",
  [jobTypes.reaction]: "reactionStructures",
  [jobTypes.reprocessing]: "reprocessingStructures",
};

/**
 * Mapping of job types to their custom structure location property names.
 *
 * Provides a lookup table to get the property name for custom structure
 * locations in user data for each type of industry job.
 *
 * @type {Object}
 * @property {string} 1 - "manStruct"
 * @property {string} 2 - "reacStruct"
 * @property {string} 5 - "reprocessingStruct"
 */
export const customStructureLocationMap = {
  [jobTypes.manufacturing]: "manStruct",
  [jobTypes.reaction]: "reacStruct",
  [jobTypes.reprocessing]: "reprocessingStruct",
};

/**
 * System structure requirements for different job types.
 *
 * Defines the requirement IDs for structures in specific systems
 * for different types of industry jobs.
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
 * Defines the requirements for different structures and rigs,
 * including their IDs, alternative system values, and allowed job types.
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
 *
 * Defines the Alpha clone tax for EVE Online industry jobs.
 * Used for calculating the install cost of industry jobs.
 *
 * @type {number}
 */
export const ALPHA_CLONE_TAX = 0.25;

/**
 * Structure type tooltip content for EVE Online structures.
 *
 * Provides helpful information about different structure types
 * and their corresponding EVE Online structure names.
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
 * Set of ancient relic type IDs in EVE Online.
 *
 * Contains the type IDs for all ancient relics that can be found
 * in EVE Online. Used for identification and filtering purposes.
 *
 * @type {Set<number>}
 */
export const ancientRelicIDs = new Set([
  30614, 30615, 30618, 30599, 30600, 30605, 30582, 30586, 30588, 30752, 30753,
  34412, 34414, 34416, 30754, 30628, 30632, 30633, 30187, 30558, 30562,
]);

/**
 * Station ID range for EVE Online stations.
 *
 * Defines the valid range of station IDs in EVE Online.
 * Used for validation and identification of station locations.
 *
 * @type {Object}
 * @property {number} low - Lower bound of station ID range
 * @property {number} high - Upper bound of station ID range
 */
export const STATIONID_RANGE = {
  low: 60000000,
  high: 64000000,
};

/**
 * System ID range for EVE Online solar systems.
 *
 * Defines the valid range of system IDs in EVE Online.
 * Used for validation and identification of solar system locations.
 *
 * @type {Object}
 * @property {number} low - Lower bound of system ID range
 * @property {number} high - Upper bound of system ID range
 */
export const SYSTEMID_RANGE = {
  low: 30000000,
  high: 32000000,
};

/**
 * Citadel ID range for EVE Online citadels.
 *
 * Defines the valid range of citadel IDs in EVE Online.
 * Used for validation and identification of citadel locations.
 *
 * @type {Object}
 * @property {number} low - Lower bound of citadel ID range
 * @property {number} high - Upper bound of citadel ID range
 */
export const CITADELID_RANGE = {
  low: 61000000,
  high: 64000000,
};

/**
 * Small text format configuration for Material-UI Typography.
 *
 * Defines the responsive text sizing for small text elements.
 *
 * @type {Object}
 * @property {string} xs - Extra small screen text size
 */
export const SMALL_TEXT_FORMAT = { xs: "caption" };
/**
 * Standard text format configuration for Material-UI Typography.
 *
 * Defines the responsive text sizing for standard text elements.
 *
 * @type {Object}
 * @property {string} xs - Extra small screen text size
 * @property {string} sm - Small screen text size
 */
export const STANDARD_TEXT_FORMAT = { xs: "caption", sm: "body2" };
/**
 * Large text format configuration for Material-UI Typography.
 *
 * Defines the responsive text sizing for large text elements.
 *
 * @type {Object}
 * @property {string} xs - Extra small screen text size
 * @property {string} sm - Small screen text size
 */
export const LARGE_TEXT_FORMAT = { xs: "caption", sm: "body1" };

/**
 * Meta levels that require invention costs in EVE Online.
 *
 * Defines which meta levels require invention costs to be calculated.
 * Used for determining when invention costs should be applied to items.
 *
 * @type {Set<number>}
 */
export const META_LEVELS_THAT_REQUIRE_INVENTION_COSTS = new Set([2, 14, 53]);
/**
 * Type IDs to ignore for invention costs in EVE Online.
 *
 * Defines which type IDs should be excluded from invention cost calculations.
 * Currently empty but available for future exclusions.
 *
 * @type {Set<number>}
 */
export const TYPE_IDS_TO_IGNORE_FOR_INVENTION_COSTS = new Set([]);

/**
 * Default values for Firebase Remote Config.
 *
 * Defines the default configuration values used by Firebase Remote Config
 * for application settings and feature flags.
 *
 * @type {Object}
 * @property {string} app_version_number - Application version number
 * @property {boolean} maintenance_mode - Whether maintenance mode is enabled
 * @property {boolean} enable_upcoming_changes_page - Whether to show upcoming changes page
 */
export const REMOTE_CONFIG_DEFAULT_VALUES = {
  app_version_number: __APP_VERSION__,
  maintenance_mode: false,
  enable_upcoming_changes_page: false,
};

/**
 * Implants configuration for EVE Online industry activities.
 *
 * Defines the available implants and their bonuses for different
 * industry activities, particularly reprocessing.
 *
 * @type {Object}
 * @property {Object} 5 - Reprocessing implants (keyed by jobTypes.reprocessing)
 * @property {Object} 5.0 - No implant option
 * @property {Object} 5.1 - RX-001 implant (+1% bonus)
 * @property {Object} 5.2 - RX-002 implant (+2% bonus)
 * @property {Object} 5.3 - RX-004 implant (+4% bonus)
 */
export const Implants = {
  [jobTypes.reprocessing]: {
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
  },
};

/**
 * Static data cache version identifier.
 *
 * Defines the version string for static data caching to ensure
 * proper cache invalidation when data structures change.
 *
 * @type {string}
 */
export const STATIC_DATA_CACHE = "static-data-cache-v1";

/**
 * Cached data file names for EVE Industry Planner.
 *
 * Defines the filenames for cached data files used by the application.
 * These files contain compressed JSON data for various EVE Online
 * game data including items, recipes, and reprocessing information.
 *
 * @type {Object}
 * @property {string} SEARCH_INDEX - Search index file name
 * @property {string} FULL_ITEM_LIST - Complete item list file name
 * @property {string} REPROCESSING_DATA - Reprocessing data file name
 * @property {string} RECIPE_LIST - Recipe list file name
 */
export const CACHED_DATA_FILES = {
  SEARCH_INDEX: "search-index.json.gz",
  FULL_ITEM_LIST: "all-items.json.gz",
  REPROCESSING_DATA: "reprocessing-data.json.gz",
  RECIPE_LIST: "recipe-list.json.gz",
};

/**
 * Default reprocessing calculation settings for EVE Online.
 *
 * Defines the default preferences and multipliers used in reprocessing
 * calculations to optimize ore selection and mineral output.
 *
 * @type {Object}
 * @property {boolean} preferCompressed - Whether to prefer compressed ores
 * @property {number} compressionBonusMultiplier - Bonus multiplier for compressed ores
 * @property {number} valueMultiplier - Cost-effectiveness prioritization multiplier
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
 * Defines the rate limiting configuration for different ESI endpoint groups
 * based on EVE Online's ESI rate limiting rollout schedule. Each group has
 * specific token limits and window sizes for API requests.
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
 *
 * @example
 * {
 *   character: {
 *     name: 'character',
 *     disabled: true,
 *     maxTokens: 150,
 *     windowSize: 15 * 60 * 1000,
 *     description: 'Character data endpoints'
 *   }
 * }
 *
 * Based on EVE Online's ESI rate limiting rollout schedule
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
 *
 * @example
 * {
 *   1: { id: 1, label: "Manufacturing" },
 *   2: { id: 2, label: "Reaction" }
 * }
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
};
