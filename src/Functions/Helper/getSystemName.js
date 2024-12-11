import systemData from "../../RawData/systems.json";

function getSystemNameFromID(systemID) {
  const missingValue = "Unknown System";
  if (!systemID) return missingValue;

  return systemData.find((i) => i.id === systemID)?.name || missingValue;
}

export default getSystemNameFromID;
