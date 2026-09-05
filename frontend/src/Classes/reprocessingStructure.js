import { jobTypes, reprocessingItemTypes } from "../Context/defaultValues";
import {
  getRigInfoFromID,
  getStructureInfoFromID,
} from "../Functions/Helper/getStructureInfo";
import { customStructureLocationMap } from "../Context/defaultValues";
import DOMPurify from "dompurify";
import coerceFiniteNumber from "../Functions/Helper/coerceFiniteNumber";

/**
 * ReprocessingStructure class for EVE Online reprocessing facility configurations.
 *
 * The ReprocessingStructure class provides comprehensive reprocessing management:
 *
 * @class ReprocessingStructure
 */
class ReprocessingStructure {
  /**
   * Creates a new ReprocessingStructure instance.
   *
   * @param {Object} existingValue - Existing structure data or null for new structure
   * @param {string} [existingValue.id] - Structure ID
   * @param {string} [existingValue.name] - Structure name
   * @param {number} [existingValue.structureType] - Structure type ID
   * @param {number} [existingValue.systemType] - System type ID
   * @param {number} [existingValue.rigSlot1] - First rig slot ID
   * @param {number} [existingValue.rigSlot2] - Second rig slot ID
   * @param {number} [existingValue.implant] - Implant ID
   * @param {boolean} [existingValue.default] - Whether this is the default structure
   * @param {number} [existingValue.tax] - Tax rate (0-1)
   */
  constructor(existingValue) {
    this.id =
      existingValue?.id ??
      `${customStructureLocationMap[jobTypes.reprocessing]}-${crypto.randomUUID()}`;
    this.jobType = jobTypes.reprocessing;
    this.name = existingValue?.name ?? "";
    this.structureType = existingValue?.structureType ?? 0;
    this.systemType = existingValue?.systemType ?? 0;
    this.rigSlot1 = existingValue?.rigSlot1 ?? 0;
    this.rigSlot2 = existingValue?.rigSlot2 ?? 0;
    this.implant = existingValue?.implant ?? 0;
    this.default = existingValue?.default ?? false;
    this.tax = coerceFiniteNumber(existingValue?.tax, 0);
  }

  /**
   * Sets the structure type ID.
   *
   * @param {number} id - Structure type ID
   */
  setStructureType(id) {
    this.structureType = id;
  }

  /**
   * Sets the system type ID.
   *
   * @param {number} id - System type ID
   */
  setSystemType(id) {
    this.systemType = id;
  }

  /**
   * Sets the first rig slot ID.
   *
   * @param {number} id - Rig slot 1 ID
   */
  setRigSlot1(id) {
    this.rigSlot1 = id;
  }

  /**
   * Sets the second rig slot ID.
   *
   * @param {number} id - Rig slot 2 ID
   */
  setRigSlot2(id) {
    this.rigSlot2 = id;
  }

  /**
   * Sets the implant ID.
   *
   * @param {number} id - Implant ID
   */
  setImplant(id) {
    this.implant = id;
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
   * Sets the tax rate for this structure.
   *
   * @param {number} tax - Tax rate (0-1)
   */
  setTax(tax) {
    this.tax = coerceFiniteNumber(tax, 0);
  }

  /**
   * Sets whether this structure is the default for reprocessing.
   *
   * @param {boolean} isDefault - Whether this is the default structure
   */
  setDefault(isDefault) {
    this.default = isDefault;
  }

  /**
   * The bonus this structure's rigs give an item type. Two rigs can be fitted
   * and only those that apply count, so the better of them is the one used.
   *
   * @param {number} itemType - Reprocessing item type (ore, gas, ice, moon ore)
   * @returns {number} The rig bonus, or 0 when none applies
   */
  rigBonusFor(itemType = 0) {
    const rigObjects = [
      getRigInfoFromID(jobTypes.reprocessing, this.rigSlot1),
      getRigInfoFromID(jobTypes.reprocessing, this.rigSlot2),
    ];
    let maxValue = 0;

    for (const rig of rigObjects) {
      if (rig && rig.appliesTo?.includes(itemType)) {
        maxValue = Math.max(rig.value, maxValue);
      }
    }
    return maxValue;
  }

  /**
   * The bonus the structure itself gives an item type.
   *
   * @param {number} itemType - Reprocessing item type (ore, gas, ice, moon ore)
   * @returns {number} The structure bonus, or 0 when it gives none
   */
  structureBonusFor(itemType = 0) {
    const structureObject = getStructureInfoFromID(
      jobTypes.reprocessing,
      this.structureType,
    );
    if (!structureObject) return 0;

    if (
      itemType === reprocessingItemTypes.ore ||
      itemType === reprocessingItemTypes.moonOre ||
      itemType === reprocessingItemTypes.ice
    ) {
      return structureObject.ore;
    }
    if (itemType === reprocessingItemTypes.gas) {
      return structureObject.gas;
    }
    return 0;
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
      structureType: this.structureType,
      systemType: this.systemType,
      rigSlot1: this.rigSlot1,
      rigSlot2: this.rigSlot2,
      implant: this.implant,
      tax: this.tax,
      default: this.default,
    };
  }
}

export default ReprocessingStructure;
