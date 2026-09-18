import {
  requirements,
  systemStructureRequirements,
} from "../Context/defaultValues";
import GLOBAL_CONFIG from "../global-config-app";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;
import {
  getStructureInfoFromID,
  getRigInfoFromID,
  getSystemTypeFromID,
} from "../Functions/Helper/getStructureInfo";
import materialQuantitiesForSetup from "../Functions/Blueprint Calculations/calculateMaterialsForSetup";
import { asStringID } from "../Functions/Helper/ids";
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
   * @param {number} [setupInstructions.rigID] - Rig type ID
   * @param {number} [setupInstructions.systemTypeID] - System type ID
   * @param {number} [setupInstructions.systemID] - System ID
   * @param {number} [setupInstructions.taxValue] - Tax rate (0-1)
   * @param {string} [setupInstructions.customStructureID] - Custom structure ID
   * @param {string} [setupInstructions.selectedCharacter] - Character hash for execution
   * @param {string} [setupInstructions.characterToUse] - Alternative character property
   * @param {Object} [setupInstructions.materialCount] - Material count tracking
   * @param {number} [setupInstructions.rawTime] - Raw time value
   * @param {number} [setupInstructions.rawTimeValue] - Alternative raw time property
   * @param {number} setupInstructions.jobType - Type of job (manufacturing, reaction, etc.)
   * @param {number} [setupInstructions.appliedRequirementID] - Applied requirement ID
   * @param {number} [setupInstructions.alternativeSystemIndexValue] - Alternative system index
   * @param {boolean} [setupInstructions.useAlternativeSystemIndexValue] - Whether to use alternative index
   */
  constructor(setupInstructions) {
    this.id = setupInstructions?.id || crypto.randomUUID();
    this.runCount = setupInstructions?.runCount || 1;
    this.jobCount = setupInstructions?.jobCount || 1;
    this.ME = setupInstructions?.ME || 0;
    this.TE = setupInstructions?.TE || 0;
    this.structureID = setupInstructions?.structureID || 0;
    this.rigID = setupInstructions?.rigID || 0;
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
    if (setupInstructions?.appliedRequirementID == null) {
      this.appliedRequirementID = -1;
    } else {
      this.appliedRequirementID = setupInstructions.appliedRequirementID;
    }
    if (setupInstructions?.alternativeSystemIndexValue == null) {
      this.alternativeSystemIndexValue = 0;
    } else {
      this.alternativeSystemIndexValue =
        setupInstructions.alternativeSystemIndexValue;
    }
    this.useAlternativeSystemIndexValue =
      setupInstructions?.useAlternativeSystemIndexValue || false;
  }

  /**
   * How many of a material this setup calls for.
   *
   * @param {number} typeID - EVE type id of the material
   * @returns {number} Quantity required by this setup
   */
  materialQuantity(typeID) {
    return this.materialCount?.[asStringID(typeID)]?.quantity || 0;
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
      rigID: this.rigID,
      systemTypeID: this.systemTypeID,
      systemID: this.systemID,
      taxValue: this.taxValue,
      customStructureID: this.customStructureID,
      selectedCharacter: this.selectedCharacter,
      materialCount: this.materialCount,
      rawTime: this.rawTime,
      jobType: this.jobType,
      appliedRequirementID: this.appliedRequirementID,
      alternativeSystemIndexValue: this.alternativeSystemIndexValue,
      useAlternativeSystemIndexValue: this.useAlternativeSystemIndexValue,
    };
  }

  /**
   * Rebuilds the material quantities this setup calls for.
   *
   * @param {Array} rawMaterialQuantities - Raw material quantities from the job
   */
  recalculateMaterials(rawMaterialQuantities) {
    this.materialCount = materialQuantitiesForSetup(
      this,
      rawMaterialQuantities,
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
   * Gets the rig object information for this setup.
   *
   * @returns {Object|null} Rig object or null if not found
   */
  getRigObject() {
    return getRigInfoFromID(this.jobType, this.rigID);
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
   * Gets requirements for a specific object type.
   *
   * @param {Function} getObjectFunction - Function to get the object
   * @returns {Object|null} Requirements object or null if not found
   */
  getObjectRequirements(getObjectFunction) {
    if (typeof getObjectFunction !== "function") {
      return null;
    }

    const requirementID = getObjectFunction.call(this)?.requirementID;

    if (requirementID == null) return null;

    return requirements[requirementID] || null;
  }

  /**
   * Gets system ID requirements for this setup.
   *
   * @returns {string|null} Requirement ID or null if not found
   */
  getSystemIDRequirements() {
    const requirementID =
      systemStructureRequirements[this.systemID]?.requirementID;

    return requirementID ?? null;
  }

  /**
   * Gathers all requirements for this setup.
   *
   * @returns {Object} Combined requirements object
   */
  gatherRequirements() {
    const structureRequirements = this.getObjectRequirements(
      this.getStructureObject,
    );
    const rigRequirements = this.getObjectRequirements(this.getRigObject);
    const systemTypeRequirements = this.getObjectRequirements(
      this.getSystemTypeObject,
    );

    return {
      ...structureRequirements,
      ...rigRequirements,
      ...systemTypeRequirements,
    };
  }

  /**
   * Manages requirements for this setup.
   *
   * @param {string|null} requirementID - Requirement ID to apply or null to remove
   */
  manageRequirements(requirementID = null) {
    if (requirementID !== null) {
      this.applyRequirements(requirementID);
    } else {
      this.removeRequirements();
    }
  }

  /**
   * Applies requirements to this setup.
   *
   * @param {string} requirementID - Requirement ID to apply
   */
  applyRequirements(requirementID) {
    if (requirementID == -1) return;

    const requirementObject = requirements[requirementID];

    if (!requirementObject) return;

    this.appliedRequirementID = requirementID;

    if (Object.hasOwn(requirementObject, "structureID")) {
      this.structureID = requirementObject.structureID;
    }
    if (Object.hasOwn(requirementObject, "rigID")) {
      this.rigID = requirementObject.rigID;
    }
    if (Object.hasOwn(requirementObject, "systemTypeID")) {
      this.systemTypeID = requirementObject.systemTypeID;
    }
    if (Object.hasOwn(requirementObject, "systemID")) {
      this.systemID = requirementObject.systemID;
    }
    if (Object.hasOwn(requirementObject, "taxValue")) {
      this.taxValue = requirementObject.taxValue;
    }
  }

  /**
   * Removes applied requirements from this setup.
   */
  removeRequirements() {
    this.appliedRequirementID = -1;
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

    this.customStructureID = inputValue;
    this.structureID = selectedStructure.structureType;
    this.rigID = selectedStructure.rigType;
    this.systemTypeID = selectedStructure.systemType;
    this.systemID = selectedStructure.systemID;
    this.taxValue = selectedStructure.tax;
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
   * Updates the structure ID and manages its requirements.
   *
   * @param {Object} structureObject - Structure object with ID and optional requirementID
   */
  updateStructureID(structureObject) {
    if (!structureObject) return;
    this.structureID = structureObject.id;
    this.manageRequirements(
      Object.hasOwn(structureObject, "requirementID")
        ? structureObject.requirementID
        : null,
    );
  }

  /**
   * Updates the rig ID and manages its requirements.
   *
   * @param {Object} rigObject - Rig object with ID and optional requirementID
   */
  updateRigID(rigObject) {
    if (!rigObject || !Object.hasOwn(rigObject, "material")) return;
    this.rigID = rigObject.id;
    this.manageRequirements(
      Object.hasOwn(rigObject, "requirementID")
        ? rigObject.requirementID
        : null,
    );
  }

  /**
   * Updates the system type and manages its requirements.
   *
   * @param {Object} systemObject - System object with ID and optional requirementID
   */
  updateSystemType(systemObject) {
    if (!systemObject || !Object.hasOwn(systemObject, "value")) return;
    this.systemTypeID = systemObject.id;
    this.manageRequirements(
      Object.hasOwn(systemObject, "requirementID")
        ? systemObject.requirementID
        : null,
    );
  }

  /**
   * Updates the system ID and manages its requirements.
   *
   * @param {number} inputValue - New system ID
   */
  updateSystemID(inputValue) {
    if (inputValue == null) return;
    this.systemID = inputValue;
    this.manageRequirements(this.getSystemIDRequirements());
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
   * Toggles the use of alternative system index value.
   */
  toggleUseAlternativeSystemIndexValue() {
    this.useAlternativeSystemIndexValue = !this.useAlternativeSystemIndexValue;
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
}
export default Setup;
