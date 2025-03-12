import {
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../Context/defaultValues";

function getStructureInfoFromID(jobType, id) {
  return structureTypeMap[jobType]?.[id] || null;
}

function getRigInfoFromID(jobType, id) {
  return rigTypeMap[jobType]?.[id] || null;
}

function getSystemTypeFromID(jobType, id) {
  return systemTypeMap[jobType]?.[id] || null;
}

export {
  getStructureInfoFromID,
  getRigInfoFromID,
  getSystemTypeFromID,
};
