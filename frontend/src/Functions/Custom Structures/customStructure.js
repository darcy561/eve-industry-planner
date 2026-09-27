import DOMPurify from "dompurify";

import {
  customStructureLocationMap,
  structureKinds,
} from "../../Context/defaultValues";
import GLOBAL_CONFIG from "../../global-config-app";
import coerceFiniteNumber from "../Helper/coerceFiniteNumber";
import coerceTaxPercentage from "./coerceTaxPercentage";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

/**
 * The fields a kind of structure carries beyond the ones every kind has.
 *
 * @type {Object<number, {built?: boolean, rigSlots?: boolean, implant?: boolean,
 * systemID?: boolean}>}
 */
const fieldsByJobType = {
  [structureKinds.manufacturing]: {
    built: true,
    rigSlots: true,
    systemID: true,
  },
  [structureKinds.reaction]: { built: true, rigSlots: true, systemID: true },
  [structureKinds.reprocessing]: { built: true, rigSlots: true, implant: true },
  [structureKinds.invention]: { built: true, rigSlots: true },
};

/**
 * Which optional fields a kind of structure carries.
 *
 * @param {number} jobType - One of `structureKinds`
 * @returns {{built?: boolean, rigSlots?: boolean, implant?: boolean,
 * systemID?: boolean}}
 */
export function fieldsForKind(jobType) {
  return fieldsByJobType[jobType] ?? {};
}

/**
 * A name as it is safe to store, from what a reader typed.
 *
 * @param {string} name - The name to settle
 * @returns {string}
 */
function settledName(name) {
  return DOMPurify.sanitize(name ?? "", {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * A structure a reader has described so their jobs can be costed in it, read
 * from a stored row or built empty for a kind.
 *
 * @param {Object} [row] - Stored structure data, or nothing for a new one
 * @param {string} [row.id] - Structure id
 * @param {number} [row.jobType] - One of `structureKinds`
 * @param {string} [row.name] - Structure name
 * @param {number} [row.systemType] - System security type id
 * @param {number} [row.structureType] - Structure type id
 * @param {number} [row.tax] - Tax as a percentage, so 2.5 means 2.5%
 * @param {boolean} [row.default] - Whether this is its kind's default
 * @param {number} [row.rigSlot1] - First rig slot id
 * @param {number} [row.rigSlot2] - Second rig slot id
 * @param {number} [row.implant] - Implant id, on the kinds that have one
 * @param {number} [row.systemID] - System id, on the kinds that have one
 * @param {number} [jobType] - The kind, for a new structure that does not name its own
 * @returns {Object} The structure, carrying the fields its kind uses
 */
export function structureFromDocument(row, jobType) {
  const kind = row?.jobType ?? jobType ?? 0;
  const fields = fieldsForKind(kind);

  const structure = {
    jobType: kind,
    id: row?.id ?? `${customStructureLocationMap[kind]}-${crypto.randomUUID()}`,
    name: row?.name ?? "",
    default: row?.default ?? false,
  };

  if (fields.built) {
    structure.systemType = row?.systemType ?? 0;
    structure.structureType = row?.structureType ?? 0;
    structure.tax = coerceTaxPercentage(row?.tax);
  }
  if (fields.rigSlots) {
    structure.rigSlot1 = row?.rigSlot1 ?? 0;
    structure.rigSlot2 = row?.rigSlot2 ?? 0;
  }
  if (fields.implant) {
    structure.implant = row?.implant ?? 0;
  }
  if (fields.systemID) {
    structure.systemID = coerceFiniteNumber(row?.systemID, DEFAULT_SYSTEM);
  }

  return structure;
}

/**
 * A structure with the named fields changed, settling the ones that arrive from
 * a text field.
 *
 * @param {Object} structure - The structure to change
 * @param {Object} changes - The fields to change, by name
 * @returns {Object} A new structure; the one passed in is unchanged
 */
export function updateStructure(structure, changes) {
  const settled = { ...changes };

  if ("name" in settled) settled.name = settledName(settled.name);
  if ("tax" in settled) settled.tax = coerceTaxPercentage(settled.tax);
  if ("systemID" in settled) {
    settled.systemID = coerceFiniteNumber(settled.systemID, DEFAULT_SYSTEM);
  }

  return { ...structure, ...settled };
}

/**
 * What a structure stores: the fields its kind uses, and none of the rest.
 *
 * @param {Object} structure - The structure to store
 * @returns {Object} Document object ready for storage
 */
export function structureToDocument(structure) {
  const fields = fieldsForKind(structure.jobType);

  return {
    id: structure.id,
    jobType: structure.jobType,
    name: structure.name,
    default: structure.default,
    ...(fields.built
      ? {
          systemType: structure.systemType,
          structureType: structure.structureType,
          tax: structure.tax,
        }
      : {}),
    ...(fields.rigSlots
      ? { rigSlot1: structure.rigSlot1, rigSlot2: structure.rigSlot2 }
      : {}),
    ...(fields.implant ? { implant: structure.implant } : {}),
    ...(fields.systemID ? { systemID: structure.systemID } : {}),
  };
}
