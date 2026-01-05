import calculateInstallCostfromSetup from "../Helper/calculateInstallCostfromSetup";
/**
 * Recalculates installation costs for jobs using new market data and system index data.
 * Updates the estimatedInstallCost property for all setup configurations in the jobs.
 * 
 * @param {Array|Object} inputJobs - Job object or array of job objects to recalculate
 * @param {Object} newMarketData - New market data to use for calculations
 * @param {Object} newSystemIndexData - New system index data to use for calculations
 * @returns {void}
 * 
 * @example
 * recalculateInstallCostsWithNewData(
 *   jobArray,
 *   marketData,
 *   systemIndexData
 * );
 */
function recalculateInstallCostsWithNewData(
  inputJobs,
  newMarketData,
  newSystemIndexData
) {
  const jobsArray = Array.isArray(inputJobs) ? inputJobs : [inputJobs];
  if (
    (!newMarketData || Object.keys(newMarketData).length === 0) &&
    (!newSystemIndexData || Object.keys(newSystemIndexData).length === 0)
  ) {
    return;
  }
  jobsArray.forEach((job) => {
    Object.values(job.build.setup).forEach((setup) => {
      setup.estimatedInstallCost = calculateInstallCostfromSetup(
        setup,
        newMarketData,
        newSystemIndexData
      );
    });
  });
}

export default recalculateInstallCostsWithNewData;
