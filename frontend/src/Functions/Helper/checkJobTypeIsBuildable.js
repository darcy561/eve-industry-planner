import { jobTypes } from "../../Context/defaultValues";

/**
 * Checks if a job type is buildable (manufacturing or reaction).
 * 
 * @param {number} inputJobType - The job type to check
 * @returns {boolean} True if the job type is buildable, false otherwise
 * 
 * @example
 * const isBuildable = checkJobTypeIsBuildable(1);
 * console.log(isBuildable); // true for manufacturing
 */
function checkJobTypeIsBuildable(inputJobType) {
  if (inputJobType === undefined || inputJobType === null) {
    console.error("Missing input type, unable to check if this is buildable.");
    return false;
  }

  return (
    inputJobType === jobTypes.manufacturing ||
    inputJobType === jobTypes.reaction
  );
}

export default checkJobTypeIsBuildable;
