import Group from "../Classes/group";

/**
 * The data the Edit Job integration tests drive the page with.
 *
 * Kept here rather than in each test file so that a shape only has to be right
 * once: several of these are what a panel reads to decide whether to draw a row
 * at all, and a thin one passes by drawing nothing.
 */

export const character = {
  CharacterHash: "hash-main",
  CharacterName: "Pilot",
  CharacterID: 91000001,
};

export const JITA_IV = 60003760;
/** A player structure, so a job's facility is a different place from the station holding it. */
export const ABBEY_RAITARU = 1035466617946;
export const AMARR_VIII = 60008494;
export const TRITANIUM = 34;
export const RIFTER = 587;

/** An industry job as ESI reports one. */
export function esiIndustryJob(job_id, { runs = 1 } = {}) {
  return {
    job_id,
    installer_id: character.CharacterID,
    blueprint_type_id: 1000,
    product_type_id: RIFTER,
    runs,
    activity_id: 1,
    status: "active",
    cost: 1000,
    start_date: "2026-01-01T00:00:00Z",
    end_date: "2026-01-02T00:00:00Z",
    // ESI reports both: the facility the job runs in, and the station it sits in. `linkedESIJob`
    // stores the facility as the linked row's `station_id`, so the two are not interchangeable.
    facility_id: ABBEY_RAITARU,
    station_id: JITA_IV,
  };
}

/** An industry job already linked to the job being edited, as it stores it. */
export function linkedIndustryJob(job_id, { runs = 3 } = {}) {
  return {
    job_id,
    runs,
    CharacterHash: character.CharacterHash,
    station_id: JITA_IV,
    activity_id: 1,
    cost: 1000,
    end_date: "2026-01-02T00:00:00Z",
    product_type_id: RIFTER,
  };
}

/** A market order as ESI reports one. */
export function esiMarketOrder(
  order_id,
  { volume_remain = 2, price = 500 } = {},
) {
  return {
    order_id,
    type_id: RIFTER,
    location_id: JITA_IV,
    region_id: 10000002,
    price,
    volume_total: 10,
    volume_remain,
    issued: "2026-01-01T00:00:00Z",
    duration: 90,
    is_buy_order: false,
    CharacterHash: character.CharacterHash,
  };
}

/** A sale ESI reported, as the job stores it once linked. */
export function linkedTransaction(
  transaction_id,
  { order_id = 700001, location_id = JITA_IV } = {},
) {
  return {
    transaction_id,
    order_id,
    journal_ref_id: 900001,
    type_id: RIFTER,
    quantity: 2,
    unit_price: 500,
    amount: 1000,
    date: "2026-01-03T00:00:00Z",
    location_id,
    is_corp: false,
    CharacterHash: character.CharacterHash,
    tax: 50,
  };
}

/** Another job on the planner, as the linking panels read one. */
export function plannerJob(
  jobID,
  name,
  { itemID = TRITANIUM, builtFrom = [] } = {},
) {
  return {
    jobID,
    name,
    itemID,
    groupID: null,
    setupCount: 1,
    totalSetupCount: 1,
    totalQuantityProduced: 10,
    build: {
      setup: { one: {} },
      materials: builtFrom.map((typeID) => ({ typeID })),
    },
  };
}

/**
 * One of the job's build setups, carrying what the setup card reads: the panel
 * looks its structure and system up in maps keyed on the setup's own job type,
 * so a setup without one resolves to nothing and the card throws.
 */
export function setupFixture(id) {
  return {
    id,
    jobType: 1,
    structureID: 0,
    rigID: 0,
    systemID: 0,
    selectedCharacter: "builder",
    rawTime: 10000,
    TE: 0,
    runCount: 1,
    jobCount: 1,
    materialCount: {},
  };
}

/** What the blueprint says the job makes and takes. A new setup is built from it. */
export function blueprintRawData() {
  return {
    products: [{ quantity: 1 }],
    materials: [{ typeID: TRITANIUM, quantity: 10 }],
    time: 100,
  };
}

/**
 * The store as the Edit Job page reads it.
 *
 * @param {Object} [options]
 * @param {Group} [options.group] - The group the job belongs to.
 * @param {Array<Object>} [options.plannerJobs] - Other jobs on the planner.
 */
export function editJobStore({
  group = new Group({ groupID: "group-1" }),
  plannerJobs = [],
} = {}) {
  return {
    jobData: {
      activeGroupID: group.groupID,
      groupArray: [group],
      jobArray: plannerJobs,
      actions: {
        findJobInJobArray: (id) =>
          plannerJobs.find((job) => job.jobID === id) ?? null,
        updateModifiedGroups: () => {},
        queueJobGroupWritesAndSchedule: () => {},
      },
    },
    account: {
      isLoggedIn: true,
      actions: {
        getMainCharacterHash: () => character.CharacterHash,
        findCharacterById: () => character,
        findCharacterByHash: () => character,
        getCorporation: () => null,
      },
    },
    worldData: {
      marketData: {},
      actions: {
        findMarketData: () => ({ jita: { sell: 5, buy: 4 } }),
        findSystemIndex: () => ({ manufacturing: 0.01 }),
      },
    },
    applicationSettings: {
      extrasCategories: [{ id: 0, name: "Other" }],
      actions: {
        getCurrentLocale: () => "en-GB",
        findPredefinedSystemIndex: () => 0.01,
        getDefaultCustomStructureWithJobType: () => null,
      },
    },
  };
}

/* The store and lock mocks each test file installs are identical and cannot move
 * here: `vi.mock` factories are hoisted above the imports, so a factory that
 * called anything imported would read it before it exists. They stay inline. */

/**
 * The places the Edit Job panels name, for a test that renders one.
 *
 * Passed to {@link renderOverEditJob} as `locationNames`, which seeds them into the query cache the
 * real hook reads — so the panels find them already resolved and ask ESI for nothing.
 */
export const editJobLocationNames = {
  [JITA_IV]: "Jita IV",
  [ABBEY_RAITARU]: "Abbey Raitaru",
};
