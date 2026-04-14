import useUsersStore from "../../Zustand/usersStore";
import { getCachedCharacterSkills } from "../EveEsi/Character/useGetCharacterSkills";
import { getCachedCharacterIndustryJobs } from "../EveEsi/Character/useGetCharacterIndustryJobs";
import { getCachedCorporationIndustryJobs } from "../EveEsi/Corporation/useGetCorporationIndustryJobs";
import useGetAllCharacterIndustryJobs from "../EveEsi/Character/useGetAllCharacterIndustryJobs";
import useGetAllCharacterSkills from "../EveEsi/Character/useGetAllCharacterSkills";
import useGetAllCorporationIndustryJobs from "../EveEsi/Corporation/useGetAllCorporationIndustryJobs";
import { calculateActiveSlotsSingleFromData } from "../../Functions/Helper/activeSlotTotalsCore";

/**
 * Custom hook that calculates active industry slot totals for characters.
 * 
 * This hook provides functions to:
 * - Calculate active slots for individual characters
 * - Calculate active slots for multiple characters
 * - Track manufacturing, reaction, and science slot usage
 * - Include both character and corporation industry jobs
 * - Calculate total available slots based on character skills
 * 
 * The hook considers EVE Online industry activities:
 * - Manufacturing (activity_id: 1)
 * - Science (activity_ids: 3, 4, 5, 8)
 * - Reaction (activity_id: 9)
 * 
 * @returns {Object} Object containing slot calculation functions
 * @returns {Function} returns.calculateActiveSlotsSingle - Calculates slots for a single character
 * @returns {Function} returns.calculateActiveSlotsMultiple - Calculates slots for all characters
 * 
 * @example
 * function SlotTracker() {
 *   const { calculateActiveSlotsSingle, calculateActiveSlotsMultiple } = useActiveSlotTotals();
 * 
 *   const slotSummary = calculateActiveSlotsSingle(character, queryClient);
 *   console.log(`Manufacturing: ${slotSummary.activeManufacturingJobs}/${slotSummary.manufacturingSlots}`);
 * 
 *   return <div>Slot tracking interface</div>;
 * }
 */
export function useActiveSlotTotals() {
  const {
    isLoading: characterIndustryJobsLoading,
    isError: characterIndustryJobsError,
    error: characterIndustryJobsErrorObject,
  } = useGetAllCharacterIndustryJobs();

  const {
    isLoading: characterSkillsLoading,
    isError: characterSkillsError,
    error: characterSkillsErrorObject,
  } = useGetAllCharacterSkills();

  const {
    isLoading: corpIndustryJobsLoading,
    isError: corpIndustryJobsError,
    error: corpIndustryJobsErrorObject,
  } = useGetAllCorporationIndustryJobs();

  const isLoading =
    characterIndustryJobsLoading ||
    characterSkillsLoading ||
    corpIndustryJobsLoading;
  const isError =
    characterIndustryJobsError ||
    characterSkillsError ||
    corpIndustryJobsError;
  const error =
    characterIndustryJobsErrorObject ||
    characterSkillsErrorObject ||
    corpIndustryJobsErrorObject;

  /**
   * Calculates active industry slots for every character in `account.characters`.
   *
   * @param {Object} queryClient - React Query client for data access
   * @returns {Array<Object>} Slot calculation results per character
   *
   * @private
   */
  function calculateActiveSlotsMultiple(queryClient) {
    const characters = useUsersStore.getState().account.characters;

    let returnArray = [];
    for (const character of characters) {
      returnArray.push(calculateActiveSlotsSingle(character, queryClient));
    }
    return returnArray;
  }

  /**
   * Calculates active industry slots for a single character.
   *
   * @param {Object} character - Character row (`Character` instance)
   * @param {Object} queryClient - React Query client for data access
   * @returns {Object} Object containing slot information for the character
   * @returns {string} returns.characterHash - Character hash identifier
   * @returns {number} returns.activeManufacturingJobs - Number of active manufacturing jobs
   * @returns {number} returns.manufacturingSlots - Total available manufacturing slots
   * @returns {number} returns.activeReactionSlots - Number of active reaction jobs
   * @returns {number} returns.reactionSlots - Total available reaction slots
   * @returns {number} returns.activeScienceSlots - Number of active science jobs
   * @returns {number} returns.scienceSlots - Total available science slots
   * @returns {boolean} returns.corpJobsPresent - Whether corporation jobs are present
   * 
   * @private
   */
  function calculateActiveSlotsSingle(character, queryClient) {
    const { CharacterHash, CharacterID } = character;

    const userIndJobs =
      getCachedCharacterIndustryJobs(queryClient, CharacterHash)?.data || [];

    const userCorpIndJobs =
      Object.entries(
        getCachedCorporationIndustryJobs(queryClient, CharacterHash)?.data || {}
      )
        .filter(([, job]) => job.installer_id === CharacterID)
        .map(([, job]) => job) || [];

    const userSkills =
      getCachedCharacterSkills(queryClient, CharacterHash)?.data || {};

    return calculateActiveSlotsSingleFromData(
      character,
      userSkills,
      userIndJobs,
      userCorpIndJobs
    );
  }

  return {
    isLoading,
    isError,
    error,
    calculateActiveSlotsSingle,
    calculateActiveSlotsMultiple,
  };
}
