import { customStructureLocationMap } from "../Context/defaultValues";
import uuid from "react-uuid";
import GLOBAL_CONFIG from "../global-config-app";
import DOMPurify from "dompurify";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

/** @param {unknown} value @param {number} fallback */
function coerceFiniteNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n =
    typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : fallback;
}

/** @param {unknown} value @param {number} fallback */
function coerceSystemID(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * CustomStructure class for user-defined industry structures.
 *
 * The CustomStructure class provides flexible structure management:
 *
 * @class CustomStructure
 */
class CustomStructure {
  /**
   * Creates a new CustomStructure instance.
   *
   * @param {Object} existingValue - Existing structure data or null for new structure
   * @param {string} [existingValue.id] - Structure ID
   * @param {number} [existingValue.jobType] - Job type this structure is for
   * @param {string} [existingValue.name] - Structure name
   * @param {number} [existingValue.systemType] - System type ID
   * @param {number} [existingValue.structureType] - Structure type ID
   * @param {number} [existingValue.rigType] - Rig type ID
   * @param {number} [existingValue.systemID] - System ID
   * @param {number} [existingValue.tax] - Tax rate (0-1)
   * @param {boolean} [existingValue.default] - Whether this is the default structure
   * @param {number} jobType - Job type for new structures
   */
  constructor(existingValue, jobType) {
    this.id =
      existingValue?.id ??
      `${customStructureLocationMap[existingValue?.jobType ?? jobType]
      }-${uuid()}`;
    this.jobType = existingValue?.jobType ?? jobType ?? 0;
    this.name = existingValue?.name ?? "";
    this.systemType = existingValue?.systemType ?? 0;
    this.structureType = existingValue?.structureType ?? 0;
    this.rigType = existingValue?.rigType ?? 0;
    this.systemID = coerceSystemID(
      existingValue?.systemID,
      DEFAULT_SYSTEM
    );
    this.tax = coerceFiniteNumber(existingValue?.tax, 0);
    this.default = existingValue?.default ?? false;
  }

  /**
   * Sets the structure name with input sanitisation.
   *
   * @param {string} name - Structure name to set
   */
  setName(name) {
    this.name = DOMPurify.sanitize(name, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });
  }

  /**
   * Sets the structure type ID.
   *
   * @param {number} structureType - Structure type ID
   */
  setStructureType(structureType) {
    this.structureType = structureType;
  }

  /**
   * Sets the rig type ID.
   *
   * @param {number} rigType - Rig type ID
   */
  setRigType(rigType) {
    this.rigType = rigType;
  }

  /**
   * Sets the system type ID.
   *
   * @param {number} systemType - System type ID
   */
  setSystemType(systemType) {
    this.systemType = systemType;
  }

  /**
   * Sets the system ID.
   *
   * @param {number} systemID - System ID
   */
  setSystemID(systemID) {
    this.systemID = coerceSystemID(systemID, DEFAULT_SYSTEM);
  }

  /**
   * Sets the tax rate for this structure.
   *
   * @param {number} tax - Tax rate (0-1)
   */
  setTax(tax) {
    this.tax = coerceFiniteNumber(tax, 0);
  }

  /**
   * Sets whether this structure is the default for its job type.
   *
   * @param {boolean} isDefault - Whether this is the default structure
   */
  setDefault(isDefault) {
    this.default = isDefault;
  }

  /**
   * Converts the structure to a document object for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    const sid = coerceSystemID(this.systemID, DEFAULT_SYSTEM);
    return {
      id: this.id,
      jobType: this.jobType,
      name: this.name,
      systemType: this.systemType,
      structureType: this.structureType,
      rigType: this.rigType,
      systemID: sid,
      tax: coerceFiniteNumber(this.tax, 0),
      default: this.default,
    };
  }
}

export default CustomStructure;
