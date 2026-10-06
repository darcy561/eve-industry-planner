import { settledSetup } from "./placeConstraints";

const FACILITY_FIELDS = [
  "customStructureID",
  "structureID",
  "systemTypeID",
  "systemID",
  "rigSlot1",
  "rigSlot2",
  "taxValue",
];

/**
 * Where a setup builds, as the place settles it: the saved structure, size, security, system, both
 * rigs and the facility tax, with a key two setups at the same facility share.
 *
 * @param {object} setup
 * @returns {{key: string} & Record<string, *>}
 */
export function facilityOf(setup) {
  const settled = settledSetup(setup) ?? {};
  const facility = Object.fromEntries(
    FACILITY_FIELDS.map((field) => [field, settled[field] ?? null]),
  );
  return {
    ...facility,
    key: FACILITY_FIELDS.map((field) => facility[field] ?? "").join("|"),
  };
}

/**
 * The facility most of a job's setups build at, how many share it, and which setups depart from it;
 * a tie goes to the facility of the earliest setup.
 *
 * @param {Array<object>} setups - In the order they are listed
 * @returns {{facility: ReturnType<typeof facilityOf> | null, sharedBy: number, departs: (setup: object) => boolean}}
 */
export function sharedFacility(setups) {
  const counts = new Map();
  const facilities = new Map();
  for (const setup of setups) {
    const facility = facilityOf(setup);
    facilities.set(setup.id, facility);
    counts.set(facility.key, (counts.get(facility.key) ?? 0) + 1);
  }

  let shared = null;
  for (const setup of setups) {
    const facility = facilities.get(setup.id);
    if (!shared || counts.get(facility.key) > counts.get(shared.key)) {
      shared = facility;
    }
  }

  return {
    facility: shared,
    sharedBy: shared ? counts.get(shared.key) : 0,
    departs: (setup) => facilities.get(setup.id)?.key !== shared?.key,
  };
}
