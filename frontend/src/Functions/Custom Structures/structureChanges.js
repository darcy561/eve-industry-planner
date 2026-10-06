import {
  fieldsForKind,
  structureFromDocument,
  updateStructure,
} from "./customStructure";
import {
  customStructureFieldsFromSetup,
  setupFieldsFromCustomStructure,
} from "./customStructureSetup";
import {
  fieldsReleasedBy,
  forcedFieldsFor,
} from "../Industry Facilities/placeConstraints";
import {
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../Context/defaultValues";
import GLOBAL_CONFIG from "../../global-config-app";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

/**
 * What a new structure of a kind starts as: the first option in each picker the kind carries.
 *
 * @param {number} jobType
 * @returns {object}
 */
export function blankStructure(jobType) {
  const seed = { jobType };
  const fields = fieldsForKind(jobType);

  if (fields.built) {
    seed.structureType = structureTypeMap[jobType]?.[0]?.id ?? 0;
    seed.systemType = systemTypeMap[jobType]?.[0]?.id ?? 0;
    seed.tax = 0;
  }
  if (fields.rigSlots) {
    seed.rigSlot1 = rigTypeMap[jobType]?.[0]?.id ?? 0;
    seed.rigSlot2 = rigTypeMap[jobType]?.[0]?.id ?? 0;
  }
  if (fields.systemID) seed.systemID = DEFAULT_SYSTEM;

  return structureFromDocument(seed);
}

/**
 * A structure read as the setup fields the place rules are written against.
 *
 * @param {object} structure
 * @returns {object}
 */
export function structureAsSetup(structure) {
  return {
    ...setupFieldsFromCustomStructure(structure),
    jobType: structure.jobType,
  };
}

/**
 * A structure with changes applied: fields its place stops deciding go back to their blank values,
 * then whatever its new place fixes is applied over what the reader chose.
 *
 * @param {object} current - The structure as it stands
 * @param {object} changes - The fields the reader changed
 * @returns {object} A new structure
 */
export function changeStructure(current, changes) {
  const before = structureAsSetup(current);
  const after = setupFieldsFromCustomStructure({ ...current, ...changes });
  const letGo = new Set();
  for (const [field, value] of Object.entries(after)) {
    if (before[field] === value) continue;
    for (const name of fieldsReleasedBy(before, field, value)) letGo.add(name);
  }
  const blank = blankStructure(current.jobType);
  const released = Object.fromEntries(
    Object.keys(
      customStructureFieldsFromSetup(
        Object.fromEntries([...letGo].map((name) => [name, null])),
      ),
    ).map((name) => [name, blank[name]]),
  );

  const draft = updateStructure(current, { ...released, ...changes });
  return updateStructure(
    draft,
    customStructureFieldsFromSetup(forcedFieldsFor(structureAsSetup(draft))),
  );
}
