import skillsList from "../../RawData/bpSkills.json";

const requiredSkills = [
  "3385",
  "3389",
  "60381",
  "60378",
  "46153",
  "60380",
  "46156",
  "12189",
  "46155",
  "60377",
  "46152",
  "46154",
  "60379",
  "12196",
  "18025",
  "62452",
];

/**
 * Retrieves all reprocessing skills from the skills list.
 * Returns skill objects for the predefined list of reprocessing skill IDs.
 * 
 * @returns {Array<Object>} Array of reprocessing skill objects
 * 
 * @example
 * const reprocessingSkills = getAllReprocessingSkills();
 * console.log(reprocessingSkills.length); // 16 skills
 */
function getAllReprocessingSkills() {
  return requiredSkills.map((id) => skillsList[id]);
}

export default getAllReprocessingSkills;
