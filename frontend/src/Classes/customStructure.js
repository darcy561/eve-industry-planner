import { customStructureLocationMap } from "../Context/defaultValues";
import GLOBAL_CONFIG from "../global-config-app";
import DOMPurify from "dompurify";
import coerceFiniteNumber from "../Functions/Helper/coerceFiniteNumber";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

/**
 * A structure a user has described so their jobs can be costed in it: where it
 * is, what it is, what rig it carries, and what it charges.
 *
 * Every value arrives from a text field or a stored document, so the class
 * settles each one as it is set — a name is sanitised, a tax or a system id
 * that is not a number falls back — and {@link CustomStructure#toDocument}
 * writes the fields as they stand.
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
      `${
        customStructureLocationMap[existingValue?.jobType ?? jobType]
      }-${crypto.randomUUID()}`;
    this.jobType = existingValue?.jobType ?? jobType ?? 0;
    this.name = existingValue?.name ?? "";
    this.systemType = existingValue?.systemType ?? 0;
    this.structureType = existingValue?.structureType ?? 0;
    this.rigType = existingValue?.rigType ?? 0;
    this.systemID = coerceFiniteNumber(existingValue?.systemID, DEFAULT_SYSTEM);
    this.tax = coerceFiniteNumber(existingValue?.tax, 0);
    this.default = existingValue?.default ?? false;
  }

  /**
   * Sets the structure name. The name is what a user typed, so it is sanitised
   * here rather than at each place that collects it.
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
    this.systemID = coerceFiniteNumber(systemID, DEFAULT_SYSTEM);
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
    return {
      id: this.id,
      jobType: this.jobType,
      name: this.name,
      systemType: this.systemType,
      structureType: this.structureType,
      rigType: this.rigType,
      systemID: this.systemID,
      tax: this.tax,
      default: this.default,
    };
  }
}

export default CustomStructure;
