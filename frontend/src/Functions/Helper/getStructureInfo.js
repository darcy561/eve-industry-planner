import {
  Implants,
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../Context/defaultValues";

/**
 * Retrieves structure information by job type and structure ID.
 * 
 * @param {number} jobType - The job type (manufacturing, research, etc.)
 * @param {number} id - The structure ID
 * @returns {Object|null} Structure information object or null if not found
 * 
 * @example
 * const structureInfo = getStructureInfoFromID(1, 0);
 * console.log(structureInfo); // { id: 0, label: "Station", ... }
 */
function getStructureInfoFromID(jobType, id) {
  return structureTypeMap[jobType]?.[id] || null;
}

/**
 * Retrieves rig information by job type and rig ID.
 * 
 * @param {number} jobType - The job type (manufacturing, research, etc.)
 * @param {number} id - The rig ID
 * @returns {Object|null} Rig information object or null if not found
 * 
 * @example
 * const rigInfo = getRigInfoFromID(1, 0);
 * console.log(rigInfo); // { id: 0, label: "No Rig", ... }
 */
function getRigInfoFromID(jobType, id) {
  return rigTypeMap[jobType]?.[id] || null;
}

/**
 * Retrieves system type information by job type and system type ID.
 * 
 * @param {number} jobType - The job type (manufacturing, research, etc.)
 * @param {number} id - The system type ID
 * @returns {Object|null} System type information object or null if not found
 * 
 * @example
 * const systemTypeInfo = getSystemTypeFromID(1, 0);
 * console.log(systemTypeInfo); // { id: 0, label: "High Sec", ... }
 */
function getSystemTypeFromID(jobType, id) {
  return systemTypeMap[jobType]?.[id] || null;
}

/**
 * Retrieves implant information by job type and implant ID.
 * 
 * @param {number} jobType - The job type (manufacturing, research, etc.)
 * @param {number} id - The implant ID
 * @returns {Object|null} Implant information object or null if not found
 * 
 * @example
 * const implantInfo = getImplantFromID(1, 0);
 * console.log(implantInfo); // { id: 0, label: "No Implant", ... }
 */
function getImplantFromID(jobType, id) {
  return Implants[jobType]?.[id] || null;
}

export {
  getStructureInfoFromID,
  getRigInfoFromID,
  getSystemTypeFromID,
  getImplantFromID,
};
