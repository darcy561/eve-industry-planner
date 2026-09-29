import GLOBAL_CONFIG from "../global-config-app";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;
import {
  getStructureInfoFromID,
  getSystemTypeFromID,
} from "../Functions/Industry Facilities/getStructureInfo";
import materialQuantitiesForSetup from "../Functions/Blueprint Calculations/calculateMaterialsForSetup";
import { setupFieldsFromCustomStructure } from "../Functions/Custom Structures/customStructureSetup";
/**
 * Whether something offered as a rig is one: the app's own tables carry a flat
 * figure per axis, and the game's own rigs carry the bonuses they give.
 *
 * @param {Object} rigObject - What a picker handed back
 * @returns {boolean}
 */
function isARig(rigObject) {
  if (!rigObject || rigObject.id == null) return false;

  return (
    Object.hasOwn(rigObject, "material") ||
    Object.hasOwn(rigObject, "value") ||
    Array.isArray(rigObject.bonuses)
  );
}

/**
 * Setup class for EVE Online industry job configurations.
 *
 * The Setup class provides comprehensive job configuration capabilities:
 *
 * @class Setup
 */
class Setup {
  /**
   * Creates a new Setup instance for industry job configuration.
   *
   * @param {Object} setupInstructions - Setup configuration data
   * @param {string} [setupInstructions.id] - Unique setup identifier
   * @param {number} [setupInstructions.runCount] - Number of runs for this setup
   * @param {number} [setupInstructions.jobCount] - Number of jobs for this setup
   * @param {number} [setupInstructions.ME] - Material efficiency level
   * @param {number} [setupInstructions.TE] - Time efficiency level
   * @param {number} [setupInstructions.structureID] - Structure type ID
   * @param {number} [setupInstructions.rigSlot1] - First rig slot id
   * @param {number} [setupInstructions.rigSlot2] - Second rig slot id
   * @param {number} [setupInstructions.systemTypeID] - System type ID
   * @param {number} [setupInstructions.systemID] - System ID
   * @param {number} [setupInstructions.taxValue] - Tax as a percentage, so 2.5 means 2.5%
   * @param {string} [setupInstructions.customStructureID] - Custom structure ID
   * @param {string} [setupInstructions.selectedCharacter] - Character hash for execution
   * @param {string} [setupInstructions.characterToUse] - Alternative character property
   * @param {Object} [setupInstructions.materialCount] - Material count tracking
   * @param {number} [setupInstructions.rawTime] - Raw time value
   * @param {number} [setupInstructions.rawTimeValue] - Alternative raw time property
   * @param {number} setupInstructions.jobType - Type of job (manufacturing, reaction, etc.)
   * @param {number} [setupInstructions.alternativeSystemIndexValue] - Alternative system index
   * @param {boolean} [setupInstructions.useAlternativeSystemIndexValue] - Whether to use alternative index
   * @param {number|null} [setupInstructions.enlistedFaction] - The militia to cost against, when it is not the character's own
   * @param {number} [setupInstructions.militiaUpgradeLevel] - How far the holding faction has upgraded the system
   */
  constructor(setupInstructions) {
    this.id = setupInstructions?.id || crypto.randomUUID();
    this.runCount = setupInstructions?.runCount || 1;
    this.jobCount = setupInstructions?.jobCount || 1;
    this.ME = setupInstructions?.ME || 0;
    this.TE = setupInstructions?.TE || 0;
    this.structureID = setupInstructions?.structureID || 0;
    this.rigSlot1 = setupInstructions?.rigSlot1 || 0;
    this.rigSlot2 = setupInstructions?.rigSlot2 || 0;
    this.systemTypeID = setupInstructions?.systemTypeID || 0;
    this.systemID = setupInstructions?.systemID || DEFAULT_SYSTEM;
    this.taxValue = setupInstructions?.taxValue || 0.25;
    if (setupInstructions?.customStructureID == null) {
      this.customStructureID = "";
    } else {
      this.customStructureID = setupInstructions.customStructureID;
    }
    this.selectedCharacter =
      setupInstructions?.selectedCharacter ||
      setupInstructions?.characterToUse ||
      null;
    this.materialCount = setupInstructions?.materialCount || {};
    this.rawTime =
      setupInstructions?.rawTime || setupInstructions?.rawTimeValue || 0;
    this.jobType = setupInstructions.jobType;
    if (setupInstructions?.alternativeSystemIndexValue == null) {
      this.alternativeSystemIndexValue = 0;
    } else {
      this.alternativeSystemIndexValue =
        setupInstructions.alternativeSystemIndexValue;
    }
    this.useAlternativeSystemIndexValue =
      setupInstructions?.useAlternativeSystemIndexValue || false;
    this.enlistedFaction = setupInstructions?.enlistedFaction ?? null;
    this.militiaUpgradeLevel = setupInstructions?.militiaUpgradeLevel ?? 0;
  }

  /**
   * Converts the setup instance to a document object for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      id: this.id,
      runCount: this.runCount,
      jobCount: this.jobCount,
      ME: this.ME,
      TE: this.TE,
      structureID: this.structureID,
      rigSlot1: this.rigSlot1,
      rigSlot2: this.rigSlot2,
      systemTypeID: this.systemTypeID,
      systemID: this.systemID,
      taxValue: this.taxValue,
      customStructureID: this.customStructureID,
      selectedCharacter: this.selectedCharacter,
      materialCount: this.materialCount,
      rawTime: this.rawTime,
      jobType: this.jobType,
      alternativeSystemIndexValue: this.alternativeSystemIndexValue,
      useAlternativeSystemIndexValue: this.useAlternativeSystemIndexValue,
      ...(this.enlistedFaction == null
        ? {}
        : { enlistedFaction: this.enlistedFaction }),
      militiaUpgradeLevel: this.militiaUpgradeLevel,
    };
  }

  /**
   * Rebuilds the material quantities this setup calls for.
   *
   * @param {Array} rawMaterialQuantities - Raw material quantities from the job
   * @param {number} [itemID] - What the job builds, which a scoped bonus is read against
   */
  recalculateMaterials(rawMaterialQuantities, itemID) {
    this.materialCount = materialQuantitiesForSetup(
      this,
      rawMaterialQuantities,
      itemID,
    );
  }

  /**
   * Gets the structure object information for this setup.
   *
   * @returns {Object|null} Structure object or null if not found
   */
  getStructureObject() {
    return getStructureInfoFromID(this.jobType, this.structureID);
  }

  /**
   * Gets the system type object information for this setup.
   *
   * @returns {Object|null} System type object or null if not found
   */
  getSystemTypeObject() {
    return getSystemTypeFromID(this.jobType, this.systemTypeID);
  }

  /**
   * Updates the run count for this setup.
   *
   * @param {number} inputValue - New run count value
   */
  updateRunCount(inputValue) {
    if (inputValue == null) return;
    this.runCount = inputValue;
  }

  /**
   * Updates the job count for this setup.
   *
   * @param {number} inputValue - New job count value
   */
  updateJobCount(inputValue) {
    if (inputValue == null) return;
    this.jobCount = inputValue;
  }

  /**
   * Updates the material efficiency (ME) value for this setup.
   *
   * @param {number} inputValue - New ME value
   */
  updateMEValue(inputValue) {
    if (inputValue == null) return;
    this.ME = inputValue;
  }

  /**
   * Updates the time efficiency (TE) value for this setup.
   *
   * @param {number} inputValue - New TE value
   */
  updateTEValue(inputValue) {
    if (inputValue == null) return;
    this.TE = inputValue;
  }

  /**
   * Updates the custom structure ID and applies its configuration.
   *
   * @param {string|null} inputValue - Custom structure ID or null to clear
   * @param {Function} getCustomStructureWithID - Function to get custom structure by ID
   */
  updateCustomStructureID(inputValue, getCustomStructureWithID) {
    if (inputValue === undefined || getCustomStructureWithID === undefined)
      return;

    if (inputValue == null || inputValue === "") {
      this.customStructureID = "";
      return;
    }
    const selectedStructure = getCustomStructureWithID(inputValue);
    if (!selectedStructure) return;

    Object.assign(this, setupFieldsFromCustomStructure(selectedStructure));
  }

  /**
   * Updates the selected character for this setup.
   *
   * @param {string} inputValue - Character hash to select
   */
  updateSelectedCharacter(inputValue) {
    if (inputValue == null) return;
    this.selectedCharacter = inputValue;
  }

  /**
   * Updates the structure a setup is built in.
   *
   * @param {Object} structureObject - The chosen structure
   */
  updateStructureID(structureObject) {
    if (!structureObject) return;
    this.structureID = structureObject.id;
  }

  /**
   * Fits a rig to the first slot.
   *
   * @param {Object} rigObject - The chosen rig
   */
  updateRigID(rigObject) {
    this.updateRigSlot("rigSlot1", rigObject);
  }

  /**
   * Fits a rig to one of the two slots.
   *
   * @param {"rigSlot1"|"rigSlot2"} slot - The slot to fit it to
   * @param {Object} rigObject - The chosen rig
   */
  updateRigSlot(slot, rigObject) {
    if (!isARig(rigObject)) return;
    this[slot] = rigObject.id;
  }

  /**
   * Updates the security band a setup is built in.
   *
   * @param {Object} systemObject - The chosen security band
   */
  updateSystemType(systemObject) {
    if (!systemObject || !Object.hasOwn(systemObject, "id")) return;
    this.systemTypeID = systemObject.id;
  }

  /**
   * Updates the solar system a setup is built in.
   *
   * @param {number} inputValue - New system ID
   */
  updateSystemID(inputValue) {
    if (inputValue == null) return;
    this.systemID = inputValue;
  }

  /**
   * Updates the alternative system index value.
   *
   * @param {number|null} inputValue - Alternative system index value
   */
  updateAlternativeSystemIndexValue(inputValue) {
    if (inputValue == null) {
      this.useAlternativeSystemIndexValue = false;
      this.alternativeSystemIndexValue = 0;
      return;
    }
    this.alternativeSystemIndexValue = inputValue;
    this.useAlternativeSystemIndexValue = true;
  }

  /**
   * Updates whether to use alternative system index value.
   *
   * @param {boolean} inputValue - Whether to use alternative system index
   */
  updateUseAlternativeSystemIndexValue(inputValue) {
    this.useAlternativeSystemIndexValue = inputValue;
  }

  /**
   * Updates the tax value for this setup.
   *
   * @param {number} inputValue - New tax value (0-1)
   */
  updateTaxValue(inputValue) {
    if (inputValue == null) return;
    this.taxValue = inputValue;
  }

  /**
   * Returns the given fields to what a new setup carries, for a setup that has
   * left the place which set them.
   *
   * @param {Array<string>} fields - The fields to let go of
   */
  releaseFields(fields = []) {
    const fresh = new Setup({ jobType: this.jobType });
    for (const field of fields) {
      if (Object.hasOwn(fresh, field)) this[field] = fresh[field];
    }
  }

  /**
   * Chooses the militia this setup is costed against, or none to fall back to the
   * character's own.
   *
   * @param {number|null} inputValue - The militia's faction id
   */
  updateEnlistedFaction(inputValue) {
    this.enlistedFaction = inputValue || null;
  }

  /**
   * Records how far the holding faction has upgraded this setup's system.
   *
   * @param {number} inputValue - An upgrade level from 0 to 5
   */
  updateMilitiaUpgradeLevel(inputValue) {
    if (inputValue == null) return;
    this.militiaUpgradeLevel = Math.min(Math.max(Number(inputValue), 0), 5);
  }
}
export default Setup;
