import { jobTypes, reprocessingItemTypes } from "../Context/defaultValues";
import {
  getRigInfoFromID,
  getStructureInfoFromID,
} from "../Functions/Helper/getStructureInfo";
import uuid from "react-uuid";
import { customStructureLocationMap } from "../Context/defaultValues";
import DOMPurify from "dompurify";

/**
 * ReprocessingStructure class for EVE Online reprocessing facility configurations.
 * 
 * This class represents a reprocessing structure configuration for:
 * - Ore, gas, ice, and moon ore reprocessing
 * - Structure and rig configuration for optimal yields
 * - System type and implant bonuses
 * - Tax rate and default structure management
 * - Reprocessing efficiency calculations
 * 
 * The ReprocessingStructure class provides comprehensive reprocessing management:
 * - Structure type selection for different reprocessing types
 * - Dual rig slot configuration for maximum efficiency
 * - System type and implant bonus integration
 * - Tax rate configuration for cost calculation
 * - Default structure designation
 * - Reprocessing yield calculation methods
 * 
 * @class ReprocessingStructure
 * @example
 * // Create a new reprocessing structure
 * const structure = new ReprocessingStructure({
 *   name: 'My Reprocessing Facility',
 *   structureType: 12345,
 *   rigSlot1: 67890,
 *   rigSlot2: 11111
 * });
 * 
 * @example
 * // Calculate reprocessing yields
 * const oreYield = structure.findStructureValueFromReprocessingItemType(reprocessingItemTypes.ore);
 * const rigYield = structure.findRigValueFromReprocessingItemType(reprocessingItemTypes.ore);
 * 
 * @example
 * // Update structure configuration
 * structure.setStructureType(54321);
 * structure.setRigSlot1(22222);
 * structure.setTax(0.05);
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
      `${customStructureLocationMap[jobTypes.reprocessing]}-${uuid()}`;
    this.jobType = jobTypes.reprocessing;
    this.name = existingValue?.name ?? "";
    this.structureType = existingValue?.structureType ?? 0;
    this.systemType = existingValue?.systemType ?? 0;
    this.rigSlot1 = existingValue?.rigSlot1 ?? 0;
    this.rigSlot2 = existingValue?.rigSlot2 ?? 0;
    this.implant = existingValue?.implant ?? 0;
    this.default = existingValue?.default ?? false;
    this.tax = existingValue?.tax ?? 0;
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
   * Sets the structure name with input sanitization.
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
    this.tax = tax;
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
   * Finds the maximum rig value applicable to a specific reprocessing item type.
   * 
   * This method calculates the rig bonus for a specific item type:
   * - Checks both rig slots for applicable rigs
   * - Returns the maximum rig value that applies to the item type
   * - Returns 0 if no rigs apply to the item type
   * 
   * @param {number} itemType - Reprocessing item type (ore, gas, ice, moon ore)
   * @returns {number} Maximum rig value applicable to the item type
   * 
   * @example
   * // Get rig bonus for ore reprocessing
   * const oreRigBonus = structure.findRigValueFromReprocessingItemType(reprocessingItemTypes.ore);
   */
  findRigValueFromReprocessingItemType(itemType = 0) {
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
   * Finds the structure value applicable to a specific reprocessing item type.
   * 
   * This method calculates the structure bonus for a specific item type:
   * - Returns ore bonus for ore, moon ore, and ice
   * - Returns gas bonus for gas
   * - Returns 0 for other item types
   * 
   * @param {number} itemType - Reprocessing item type (ore, gas, ice, moon ore)
   * @returns {number} Structure value applicable to the item type
   * 
   * @example
   * // Get structure bonus for ore reprocessing
   * const oreStructureBonus = structure.findStructureValueFromReprocessingItemType(reprocessingItemTypes.ore);
   */
  findStructureValueFromReprocessingItemType(itemType = 0) {
    const structureObject = getStructureInfoFromID(
      jobTypes.reprocessing,
      this.structureType
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
