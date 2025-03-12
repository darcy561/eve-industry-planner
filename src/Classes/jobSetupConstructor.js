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

class Setup {
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
    this.customStructureID = setupInstructions?.customStructureID || null;
    this.selectedCharacter =
      setupInstructions?.selectedCharacter ||
      setupInstructions?.characterToUse ||
      null;
    this.materialCount = setupInstructions?.materialCount || {};
    this.estimatedTime = setupInstructions?.estimatedTime || 0;
    this.rawTime =
      setupInstructions?.rawTime || setupInstructions?.rawTimeValue || 0;
    this.jobType = setupInstructions.jobType;
    this.appliedRequirementID = setupInstructions.appliedRequirementID || null;
  }
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
    };
  }
  calculateTime(skillsContext, usersContext) {
    //not implementated
    const character =
      usersContext.find((i) => i.CharacterHash === this.selectedCharacter) ||
      usersContext.find((i) => i.ParentUser);
    const characterSkills =
      skillsContext.find((i) => i.user === character.CharacterHash)?.data || {};

    const timeModifier = 2; // add
    const skillModifier = 2; // add

    this.estimatedInstallCost = Math.floor(
      this.rawTime * timeModifier * skillModifier * this.runCount
    );
  }

  getStructureObject() {
    return getStructureInfoFromID(this.jobType, this.structureID);
  }

  getRigObject() {
    return getRigInfoFromID(this.jobType, this.rigID);
  }
  getSystemTypeObject() {
    return getSystemTypeFromID(this.jobType, this.systemTypeID);
  }

  getObjectRequirements(getObjectFunction) {
    if (typeof getObjectFunction !== "function") {
      return null;
    }

    const requirementID = getObjectFunction.call(this)?.requirementID;

    if (requirementID == null) return null;

    return requirements[requirementID] || null;
  }
  getSystemIDRequirements() {
    const requirementID =
      systemStructureRequirements[this.systemID]?.requirementID;

    return requirementID ?? null;
  }

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
  manageRequirements(requirementID = null) {
    if (requirementID !== null) {
      this.applyRequirements(requirementID);
    } else {
      this.removeRequirements();
    }
  }
  applyRequirements(requirementID) {
    if (requirementID == null) return;

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
  removeRequirements() {
    this.appliedRequirementID = null;
  }
  updateRunCount(inputValue) {
    if (inputValue == null) return;
    this.runCount = inputValue;
  }
  updateJobCount(inputValue) {
    if (inputValue == null) return;
    this.jobCount = inputValue;
  }
  updateMEValue(inputValue) {
    if (inputValue == null) return;
    this.ME = inputValue;
  }
  updateTEValue(inputValue) {
    if (inputValue == null) return;
    this.TE = inputValue;
  }
  updateCustomStructureID(inputValue, applicationSettings) {
    if (inputValue === undefined || applicationSettings === undefined) return;

    if (inputValue == null) {
      this.customStructureID = null;
      return;
    }
    const selectedStructure =
      applicationSettings.getCustomStructureWithID(inputValue);
    if (!selectedStructure) return;

    this.customStructureID = inputValue;
    this.structureID = selectedStructure.structureType;
    this.rigID = selectedStructure.rigType;
    this.systemTypeID = selectedStructure.systemType;
    this.systemID = selectedStructure.systemID;
    this.taxValue = selectedStructure.tax;
  }
  updateSelectedCharacter(inputValue) {
    if (inputValue == null) return;
    this.selectedCharacter = inputValue;
  }
  updateStructureID(structureObject) {
    if (!structureObject) return;
    this.structureID = structureObject.id;
    this.manageRequirements(
      structureObject.hasOwnProperty("requirementID")
        ? structureObject.requirementID
        : null
    );
  }
  updateRigID(rigObject) {
    if (!rigObject || !Object.hasOwn(rigObject, "material")) return;
    this.rigID = rigObject.id;
    this.manageRequirements(
      rigObject.hasOwnProperty("requirementID") ? rigObject.requirementID : null
    );
  }
  updateSystemType(systemObject) {
    if (!systemObject || !Object.hasOwn(systemObject, "value")) return;
    this.systemTypeID = systemObject.id;
    this.manageRequirements(
      systemObject.hasOwnProperty("requirementID")
        ? systemObject.requirementID
        : null
    );
  }
  updateSystemID(inputValue) {
    if (inputValue == null) return;
    this.systemID = inputValue;
    this.manageRequirements(this.getSystemIDRequirements());
  }
  updateTaxValue(inputValue) {
    if (inputValue == null) return;
    this.taxValue = inputValue;
  }
}
export default Setup;
