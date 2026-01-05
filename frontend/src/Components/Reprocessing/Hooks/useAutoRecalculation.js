/**
 * Auto Recalculation Hook for EVE Industry Planner.
 * 
 * Custom React hook that automatically triggers reprocessing calculations when
 * relevant state changes occur. Monitors specific state properties and triggers
 * recalculation only when appropriate conditions are met to avoid unnecessary
 * calculations and provide a smooth user experience.
 * 
 * @fileoverview Hook for automatic reprocessing recalculation
 * @author EVE Industry Planner Team
 */

import { useEffect, useRef } from "react";
import { calculateReprocessing } from "../../../Functions/Reprocessing/calculateReprocessing";

/**
 * Custom hook that automatically triggers recalculation when relevant state changes.
 * 
 * Monitors specific state properties and automatically triggers reprocessing
 * calculations when they change, but only under appropriate conditions to
 * avoid unnecessary calculations and provide optimal user experience.
 * 
 * @param {Object} pageState - Current page state object
 * @param {string} pageState.inputText - Raw input text
 * @param {boolean} pageState.isPageLoading - Page loading state
 * @param {Array} pageState.reprocessingObjects - Current reprocessing results
 * @param {Array} pageState.processedInput - Current processed input
 * @param {boolean} pageState.inputModified - Whether input has been modified
 * @param {Array} pageState.oreIDsToBeIgnored - Array of ignored ore IDs
 * @param {Object} pageState.activeSkills - Active skill levels
 * @param {Object} pageState.currentStructure - Current reprocessing structure
 * @param {string} pageState.marketLocation - Market location for pricing
 * @param {string} pageState.marketListing - Market listing type
 * @param {Object} pageState.reprocessingCalculationSettings - Calculation settings
 * @param {Object} pageActions - Page action functions
 * @param {Function} pageActions.calculateReprocessing - Function to trigger recalculation
 * 
 * @example
 * function ReprocessingPage() {
 *   const { state, actions } = useReprocessingReducer();
 *   
 *   // Automatically recalculate when relevant state changes
 *   useAutoRecalculation(state, actions);
 *   
 *   return (
 *     <div>
 *       Reprocessing UI
 *     </div>
 *   );
 * }
 */
export default function useAutoRecalculation(
  pageState,
  pageActions
) {
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip the first render to avoid unnecessary calculations on mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Only trigger recalculation if:
    // 1. We have input text
    // 2. We're not already loading (!pageState.isPageLoading)
    // 3. We have some results (meaning the reprocess button has been pressed at least once)
    // 4. Input text hasn't been modified (let user finish their changes)
    const hasResults = pageState.reprocessingObjects.length > 0 || pageState.processedInput.length > 0;

    if (pageState.inputText.trim() && !pageState.isPageLoading && hasResults && !pageState.inputModified) {
      calculateReprocessing({
        pageState,
        pageActions,
      });
    }
  }, [
    pageState.oreIDsToBeIgnored,
    pageState.activeSkills,
    pageState.currentStructure,
    pageState.marketLocation,
    pageState.marketListing,
    pageState.reprocessingCalculationSettings,
  ]);
}
