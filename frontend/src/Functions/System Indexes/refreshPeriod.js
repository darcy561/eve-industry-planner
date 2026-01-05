import GLOBAL_CONFIG from "../../global-config-app";

const { DEFAULT_SYSTEMINDEX_REFRESH_PERIOD } = GLOBAL_CONFIG;

/**
 * Determines if a system index object requires refresh based on its last updated timestamp.
 * Compares the last updated time against the configured refresh period.
 * 
 * @param {Object} systemIndexObject - System index object with lastUpdated property
 * @returns {boolean} True if the system index requires refresh, false otherwise
 * 
 * @example
 * const needsRefresh = doesSystemIndexRequireRefresh(systemIndex);
 * if (needsRefresh) {
 *   console.log("System index needs refresh");
 * }
 */
function doesSystemIndexRequireRefresh(systemIndexObject) {
  const chosenRefreshPoint =
    Date.now() - DEFAULT_SYSTEMINDEX_REFRESH_PERIOD * 60 * 60 * 1000;
  if (systemIndexObject.lastUpdated <= chosenRefreshPoint) {
    return true;
  }
  return false;
}

export default doesSystemIndexRequireRefresh;
