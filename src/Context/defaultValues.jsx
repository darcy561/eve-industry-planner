export let jobArrayDefault = [];

export let userJobSnapshotDefault = [];

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

export let apiJobsDefault = [
  {
    user: "ABC123",
    data: [],
  },
];

export let defaultEsiSkills = [
  {
    user: "ABC123",
    data: {
      3395: {
        id: 3395,
        name: "Advanced Small Ship Construction",
        activeLevel: 5,
      },
      24625: {
        id: 24625,
        name: "Advanced Mass Production",
        activeLevel: 5,
      },
      45749: {
        id: 45749,
        name: "Advanced Mass Reactions",
        activeLevel: 5,
      },
      3397: {
        id: 3397,
        name: "Advanced Medium Ship Construction",
        activeLevel: 5,
      },
      24624: {
        id: 24624,
        name: "Advanced Laboratory Operation",
        activeLevel: 5,
      },
      3398: {
        id: 3398,
        name: "Advanced Large Ship Construction",
        activeLevel: 5,
      },
      3396: {
        id: 3396,
        name: "Advanced Industrial Ship Construction",
        activeLevel: 5,
      },
      3388: {
        id: 3388,
        name: "Advanced Industry",
        activeLevel: 5,
      },
      23087: {
        id: 23087,
        name: "Amarr Encryption Methods",
        activeLevel: 3,
      },
      11444: {
        id: 11444,
        name: "Amarr Starship Engineering",
        activeLevel: 5,
      },
      26253: {
        id: 26253,
        name: "Armor Rigging",
        activeLevel: 5,
      },
      26254: {
        id: 26254,
        name: "Astronautics Rigging",
        activeLevel: 5,
      },
      3446: { name: "Broker Relations", id: 3446, activeLevel: 5 },
      11454: {
        id: 11454,
        name: "Caldari Starship Engineering",
        activeLevel: 5,
      },
      21790: {
        id: 21790,
        name: "Caldari Encryption Methods",
        activeLevel: 5,
      },
      22242: {
        id: 22242,
        name: "Capital Ship Consruction",
        activeLevel: 5,
      },
      30325: {
        id: 30325,
        name: "Core Subsystem Technology",
        activeLevel: 5,
      },
      30324: {
        id: 30324,
        name: "Defensive Subsystem Technology",
        activeLevel: 5,
      },
      26255: {
        id: 26255,
        name: "Drones Rigging",
        activeLevel: 5,
      },
      26224: {
        id: 26224,
        name: "Drug Manufacturing",
        activeLevel: 5,
      },
      11448: {
        id: 11448,
        name: "Electromagnetic Physics",
        activeLevel: 5,
      },
      11453: {
        id: 11453,
        name: "Electronic Engineering",
        activeLevel: 5,
      },
      26256: {
        id: 26256,
        name: "Electronic Superiority Rigging",
        activeLevel: 5,
      },
      26258: {
        id: 26258,
        name: "Energy Weapon Rigging",
        activeLevel: 5,
      },
      23121: {
        id: 23121,
        name: "Gallente Encryption Methods",
        activeLevel: 5,
      },
      11450: {
        id: 11450,
        name: "Gallente Starship Engineering",
        activeLevel: 5,
      },
      11446: {
        id: 11446,
        name: "Graviton Physics",
        activeLevel: 5,
      },
      11433: {
        id: 11433,
        name: "High Energy Physics",
        activeLevel: 5,
      },
      26259: {
        id: 26259,
        name: "Hybrid Weapon Rigging",
        activeLevel: 5,
      },
      11443: {
        id: 11443,
        name: "Hydromagnetic Physics",
        activeLevel: 5,
      },
      3380: {
        id: 3380,
        name: "Industry",
        activeLevel: 5,
      },
      26252: {
        id: 26252,
        name: "Jury Rigging",
        activeLevel: 5,
      },
      3406: {
        id: 3406,
        name: "Laboratory Operation",
        activeLevel: 5,
      },
      11447: {
        id: 11447,
        name: "Laser Physics",
        activeLevel: 5,
      },
      26260: {
        id: 26260,
        name: "Launcher Rigging",
        activeLevel: 5,
      },
      3387: {
        id: 3387,
        name: "Mass Production",
        activeLevel: 5,
      },
      45748: {
        id: 45748,
        name: "Mass Reactions",
        activeLevel: 5,
      },
      11452: {
        id: 11452,
        name: "Mechanical Engineering",
        activeLevel: 5,
      },
      3409: {
        id: 3409,
        name: "Metallurgy",
        activeLevel: 5,
      },
      21791: {
        id: 21791,
        name: "Minmatar Encryption Methods",
        activeLevel: 5,
      },
      11445: {
        id: 11445,
        name: "Minmatar Starship Engineering",
        activeLevel: 5,
      },
      11529: {
        id: 11529,
        name: "Molecular Engineering",
        activeLevel: 5,
      },
      11442: {
        id: 11442,
        name: "Nanite Engineering",
        activeLevel: 5,
      },
      11451: {
        id: 11451,
        name: "Nuclear Physics",
        activeLevel: 5,
      },
      30327: {
        id: 30327,
        name: "Offensive Subsystem Technology",
        activeLevel: 5,
      },
      3400: {
        id: 3400,
        name: "Outpost Construction",
        activeLevel: 5,
      },
      26257: {
        id: 26257,
        name: "Projectile Weapon Rigging",
        activeLevel: 5,
      },
      30788: {
        id: 30788,
        name: "Propulsion Subsystem Technology",
        activeLevel: 5,
      },
      11441: {
        id: 11441,
        name: "Plasma Physics",
        activeLevel: 5,
      },
      11455: {
        id: 11455,
        name: "Quantum Physics",
        activeLevel: 5,
      },
      45746: {
        id: 45746,
        name: "Reactions",
        activeLevel: 5,
      },
      3403: {
        id: 3403,
        name: "Research",
        activeLevel: 5,
      },
      11449: {
        id: 11449,
        name: "Rocket Science",
        activeLevel: 5,
      },
      3402: {
        id: 3402,
        name: "Science",
        activeLevel: 5,
      },
      26261: {
        id: 26261,
        name: "Shield Rigging",
        activeLevel: 5,
      },
      3408: {
        id: 3408,
        name: "Sleeper Encryption Methods",
        activeLevel: 5,
      },
      21789: {
        id: 21789,
        name: "Sleeper Technology",
        activeLevel: 5,
      },
      20433: {
        id: 20433,
        name: "Talocan Technology",
        activeLevel: 5,
      },
      23123: {
        id: 23123,
        name: "Takmahl Technology",
        activeLevel: 5,
      },
      52308: {
        id: 52308,
        name: "Triglavian Encryption Methods",
        activeLevel: 5,
      },
      52307: {
        id: 52307,
        name: "Triglavian Quantum Engineering",
        activeLevel: 5,
      },
      55025: {
        id: 55025,
        name: "Upwell Encryption Methods",
        activeLevel: 5,
      },
      23124: {
        id: 23124,
        name: "Yan Jung Technology",
        activeLevel: 5,
      },
    },
  },
];

export let defaultEsiJobs = [
  {
    user: "ABC123",
    data: [],
  },
];

export let defaultEsiOrders = [
  {
    user: "ABC123",
    data: [],
  },
];

export let defaultEsiHistOrders = [
  {
    user: "ABC123",
    data: [],
  },
];

export let defaultEsiBlueprints = [
  {
    user: "ABC123",
    data: [],
  },
];

export let defaultEsiTransactions = [
  {
    user: "ABC123",
    data: [],
  },
];

export let defaultEsiJournal = [
  {
    user: "ABC123",
    data: [],
  },
];
export let defaultEsiAssets = [];

export let defaultEsiStandings = [
  {
    user: "ABC123",
    data: [],
  },
];

export let usersDefault = [
  {
    accountID: "LoggedOutUser",
    CharacterID: 94800326,
    CharacterHash: "ABC123",
    CharacterName: "Example Character",
    ParentUser: true,
    linkedJobs: new Set([477723892, 4777240090]),
    linkedOrders: new Set([6161413749, 6161414065]),
    linkedTrans: new Set([
      5763852213, 5763860401, 5763883247, 5763890268, 5762870250, 5762760174,
      5764179431,
    ]),
    settings: {
      layout: {
        hideTutorials: false,
      },
      editJob: {
        defaultMarket: "jita",
        defaultOrders: "sell",
        hideCompleteMaterials: false,
        citadelBrokersFee: 1,
      },
      structures: {
        manufacturing: [],
        reaction: [],
      },
    },
  },
];

export let apiOrdersDefault = [];

export let eveIDsDefault = {
  60008494: {
    category: "station",
    id: 60008494,
    name: "Amarr VIII (Oris) - Emperor Family Academy",
  },
  10000043: {
    category: "region",
    id: 10000043,
    name: "Domain",
  },
};

export const applicationSettingsdefault = {
  hideTutorials: false,
  defaultMarket: "jita",
  defaultOrders: "sell",
  hideCompleteMaterials: false,
  citadelBrokersFee: 1,
  structures: {
    manufacturing: [],
    reaction: [],
  },
};

export let listingType = [
  { id: "buy", name: "Buy Orders" },
  { id: "sell", name: "Sell Orders" },
];

export let jobTypes = {
  baseMaterial: 0,
  manufacturing: 1,
  reaction: 2,
  pi: 3,
};
export const jobTypeMapping = {
  [jobTypes.manufacturing]: "manufacturing",
  [jobTypes.reaction]: "reaction",
};

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
export const structureOptions = {
  manStructure: {
    0: {
      id: 0,
      label: "NPC Station",
      material: 0,
      time: 0,
      cost: 0,
      requirements: {
        taxValue: 0.25,
        rigID: 0,
      },
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
      requirements: {
        rigID: 0,
        systemTypeID: 3,
        systemID: 30100000,
        taxValue: 0.25,
      },
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
  },

  manSystem: {
    0: { id: 0, label: "High Sec", value: 1 },
    1: { id: 1, label: "Low Sec", value: 1.9 },
    2: { id: 2, label: "Null Sec / WH", value: 2.1 },
    3: {
      id: 3,
      label: "Zarzakh",
      value: 1,
      requirements: {
        rigID: 0,
        structureID: 4,
        systemID: 30100000,
        taxValue: 0.25,
      },
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
};

export const structureTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manStructure,
  [jobTypes.reaction]: structureOptions.reactionStructure,
};
export const rigTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manRigs,
  [jobTypes.reaction]: structureOptions.reactionRigs,
};
export const systemTypeMap = {
  [jobTypes.manufacturing]: structureOptions.manSystem,
  [jobTypes.reaction]: structureOptions.reactionSystem,
};

export const customStructureMap = {
  [jobTypes.manufacturing]: "manufacturingStructures",
  [jobTypes.reaction]: "reactionStructures",
};

export const customStructureLocationMap = {
  [jobTypes.manufacturing]: "manStruct",
  [jobTypes.reaction]: "reacStruct",
}

export const systemStructureRequirements = {
  30100000: {
    rigID: 0,
    systemTypeID: 3,
    structureID: 4,
    systemID: 30100000,
    taxValue: 0.25,
    allowedJobTypes: [jobTypes.manufacturing],
  },
};

export const structureTypeTooltip = (
  <span>
    <p>Medium: Astrahus, Athanor, Raitaru</p>
    <p>Large: Azbel, Fortizar, Tatara</p>
    <p>X-Large: Keepstar, Sotiyo</p>
  </span>
);

export const ancientRelicIDs = new Set([
  30614, 30615, 30618, 30599, 30600, 30605, 30582, 30586, 30588, 30752, 30753,
  34412, 34414, 34416, 30754, 30628, 30632, 30633, 30187, 30558, 30562,
]);

export const STATIONID_RANGE = {
  low: 60000000,
  high: 64000000,
};

export const SYSTEMID_RANGE = {
  low: 30000000,
  high: 32000000,
};

export const TWO_DECIMAL_PLACES = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

export const ZERO_DECIMAL_PLACES = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
};

export const ZERO_TWO_DECIMAL_PLACES = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
};

export const SMALL_TEXT_FORMAT = { xs: "caption" };
export const STANDARD_TEXT_FORMAT = { xs: "caption", sm: "body2" };
export const LARGE_TEXT_FORMAT = { xs: "caption", sm: "body1" };

export const META_LEVELS_THAT_REQUIRE_INVENTION_COSTS = new Set([2, 14, 53]);
export const TYPE_IDS_TO_IGNORE_FOR_INVENTION_COSTS = new Set([]);

export const REMOTE_CONFIG_DEFAULT_VALUES = {
  app_version_number: __APP_VERSION__,
  maintenance_mode: false,
  enable_upcoming_changes_page: false,
  useSettingsV2: true,
};
