import uuid from "react-uuid";
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
import calculateTimeForSetup from "../Functions/Blueprint Calculations/calculateTimeForSetup";
import calculateInstallCostfromSetup from "../Functions/Installation Costs/installCosts";
import calculateMaterialsFromSetup from "../Functions/Blueprint Calculations/calculateMaterialsForSetup";
/**
 * Setup class for EVE Online industry job configurations.
 *
 * This class represents a single setup configuration for an industry job:
 * - Structure and rig configuration for manufacturing/reaction
 * - Material efficiency (ME) and time efficiency (TE) settings
 * - System selection and tax configuration
 * - Character assignment for job execution
 * - Material count tracking and time estimation
 * - Requirement management and validation
 *
 * The Setup class provides comprehensive job configuration capabilities:
 * - Structure and rig selection with requirement validation
 * - System and tax configuration for cost optimisation
 * - Character assignment for skill-based calculations
 * - Material efficiency optimisation settings
 * - Time estimation and cost calculation
 * - Alternative system index value management
 *
 * @class Setup
 * @example
 * // Create a new setup for manufacturing
 * const setup = new Setup({
 *   jobType: jobTypes.manufacturing,
 *   runCount: 10,
 *   ME: 10,
 *   TE: 20,
 *   structureID: 12345,
 *   systemID: 30000142
 * });
 *
 * @example
 * // Update setup parameters
 * setup.updateMEValue(15);
 * setup.updateRunCount(20);
 * setup.updateSelectedCharacter('ABC123');
 *
 * @example
 * // Apply requirements
 * setup.applyRequirements('highsec_manufacturing');
 *
 * @example
 * // Get structure information
 * const structure = setup.getStructureObject();
 * const rig = setup.getRigObject();
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
   * @param {number} [setupInstructions.estimatedInstallCost] - Estimated installation cost
   * @param {string} [setupInstructions.customStructureID] - Custom structure ID
   * @param {string} [setupInstructions.selectedCharacter] - Character hash for execution
   * @param {string} [setupInstructions.characterToUse] - Alternative character property
   * @param {Object} [setupInstructions.materialCount] - Material count tracking
   * @param {number} [setupInstructions.estimatedTime] - Estimated job time
   * @param {number} [setupInstructions.rawTime] - Raw time value
   * @param {number} [setupInstructions.rawTimeValue] - Alternative raw time property
   * @param {number} setupInstructions.jobType - Type of job (manufacturing, reaction, etc.)
   * @param {number} [setupInstructions.appliedRequirementID] - Applied requirement ID
   * @param {number} [setupInstructions.alternativeSystemIndexValue] - Alternative system index
   * @param {boolean} [setupInstructions.useAlternativeSystemIndexValue] - Whether to use alternative index
   */
  constructor(setupInstructions) {
    this.id = setupInstructions?.id || uuid();
    this.runCount = setupInstructions?.runCount || 1;
    this.jobCount = setupInstructions?.jobCount || 1;
    this.ME = setupInstructions?.ME || 0;
    this.TE = setupInstructions?.TE || 0;
    this.structureID = setupInstructions?.structureID || 0;
    this.rigID = setupInstructions?.rigID || 0;
    this.systemTypeID = setupInstructions?.systemTypeID || 0;
    this.systemID = setupInstructions?.systemID || DEFAULT_SYSTEM;
    this.taxValue = setupInstructions?.taxValue || 0.25;
    this.estimatedInstallCost = setupInstructions?.estimatedInstallCost || 0;
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
    this.estimatedTime = setupInstructions?.estimatedTime || 0;
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
    return this.materialCount?.[String(typeID)]?.quantity || 0;
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
      estimatedInstallCost: this.estimatedInstallCost,
      customStructureID: this.customStructureID,
      selectedCharacter: this.selectedCharacter,
      materialCount: this.materialCount,
      estimatedTime: this.estimatedTime,
      rawTime: this.rawTime,
      jobType: this.jobType,
      appliedRequirementID: this.appliedRequirementID,
      alternativeSystemIndexValue: this.alternativeSystemIndexValue,
      useAlternativeSystemIndexValue: this.useAlternativeSystemIndexValue,
    };
  }

  /**
   * Applies the initial raw material quantities to the setup from its job.
   *
   * @param {Array} rawMaterialQuantities - The raw material quantities to apply
   */

  applyInitialRawMaterialQuantities(rawMaterialQuantities) {
    rawMaterialQuantities.forEach((material) => {
      this.materialCount[material.typeID] = {
        typeID: material.typeID,
        quantity: material.quantity,
        rawQuantity: material.quantity,
      };
    });
  }

  /**
   * Calculates the estimated time and installation cost for this setup.
   *
   * This method calculates time and cost based on character skills and modifiers:
   * - Finds the selected character or falls back to the main character
   * - Retrieves character skills for calculation
   * - Applies time and skill modifiers
   * - Calculates estimated installation cost
   *
   * @param {Array<Object>} skillsContext - Array of character skills data
   * @param {Array<Object>} usersContext - Array of user/character data
   *
   * @example
   * // Calculate time and cost for setup
   * setup.calculateTime(skillsData, usersData);
   * console.log('Estimated cost:', setup.estimatedInstallCost);
   */
  caclulateEstimatedTime(jobSkillRequirements, queryClient) {
    this.estimatedTime = calculateTimeForSetup(
      this,
      jobSkillRequirements,
      queryClient
    );
  }
  /**
   * Calculates the estimated install cost for this setup.
   *
   * @param {Object} additionalMaterialPrices - Additional material prices to use
   * @param {Object} additionalSystemIndexValues - Additional system index values to use
   * @returns {number} The estimated install cost for the setup
   */
  caclulateEstimatedInstallCost(
    additionalMaterialPrices = {},
    additionalSystemIndexValues = {}
  ) {
    this.estimatedInstallCost = calculateInstallCostfromSetup(
      this,
      additionalMaterialPrices,
      additionalSystemIndexValues
    );
  }
  /**
   * Calculates the material count for this setup.
   *
   * @returns {Object} The material count for the setup
   */
  calculateMaterialCount() {
    this.materialCount = calculateMaterialsFromSetup(this);
  }

  /**
   * Recalculates the setup with new data.
   *
   * @param {Array} jobSkillRequirements - The job skill requirements
   * @param {QueryClient} queryClient - The query client to use
   * @param {Object} additionalMaterialPrices - Additional material prices to use
   * @param {Object} additionalSystemIndexValues - Additional system index values to use
   */

  recalculate(
    jobSkillRequirements,
    queryClient,
    additionalMaterialPrices = {},
    additionalSystemIndexValues = {}
  ) {
    this.calculateMaterialCount();
    this.caclulateEstimatedTime(jobSkillRequirements, queryClient);
    this.caclulateEstimatedInstallCost(
      additionalMaterialPrices,
      additionalSystemIndexValues
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
   * This method collects requirements from structure, rig, and system type:
   * - Gets structure requirements if applicable
   * - Gets rig requirements if applicable
   * - Gets system type requirements if applicable
   * - Merges all requirements into a single object
   *
   * @returns {Object} Combined requirements object
   */
  gatherRequirements() {
    const structureRequirements = this.getObjectRequirements(
      this.getStructureObject
    );
    const rigRequirements = this.getObjectRequirements(this.getRigObject);
    const systemTypeRequirements = this.getObjectRequirements(
      this.getSystemTypeObject
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
   * This method applies a requirement configuration to the setup:
   * - Sets the applied requirement ID
   * - Updates structure ID if specified in requirements
   * - Updates rig ID if specified in requirements
   * - Updates system type ID if specified in requirements
   * - Updates system ID if specified in requirements
   * - Updates tax value if specified in requirements
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
   * This method updates the custom structure and applies its settings:
   * - Sets the custom structure ID
   * - Updates structure type from custom structure
   * - Updates rig type from custom structure
   * - Updates system type from custom structure
   * - Updates system ID from custom structure
   * - Updates tax value from custom structure
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
      structureObject.hasOwnProperty("requirementID")
        ? structureObject.requirementID
        : null
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
      rigObject.hasOwnProperty("requirementID") ? rigObject.requirementID : null
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
      systemObject.hasOwnProperty("requirementID")
        ? systemObject.requirementID
        : null
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
