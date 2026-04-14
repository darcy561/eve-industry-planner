import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleGroup, SchedulingStrategy } from "../../../../Functions/Scheduler/groupSchedulerCore";
import { calculateActiveSlotsSingleFromData } from "../../../../Functions/Helper/activeSlotTotalsCore";
import useGetAllCharacterIndustryJobs from "../../../../Hooks/EveEsi/Character/useGetAllCharacterIndustryJobs";
import useGetAllCorporationIndustryJobs from "../../../../Hooks/EveEsi/Corporation/useGetAllCorporationIndustryJobs";
import useGetAllCharacterSkills from "../../../../Hooks/EveEsi/Character/useGetAllCharacterSkills";
import { characterIndustryJobsQueryKey } from "../../../../Hooks/React Query/Character/industryJobs";
import calculateTimeForSetup from "../../../../Functions/Blueprint Calculations/calculateTimeForSetup";
import Setup from "../../../../Classes/jobSetup";
import { jobTypes } from "../../../../Context/defaultValues";

/**
 * Custom hook that schedules group jobs across available characters.
 *
 * This hook:
 * - Builds tasks from group jobs and their setups (splitting by jobCount)
 * - Precomputes per-character durations based on skills and eligibility
 * - Calls the scheduling core to produce an optimal schedule
 * - Returns the schedule result with loading/error states
 *
 * @param {Array<Object>} groupJobs - Array of Job objects from the active group
 * @param {number} [schedulingStrategy] - Scheduling strategy (from SchedulingStrategy enum). Defaults to 0 (GREEDY).
 * @param {Array<Object>} [selectedCharacterRows] - Optional `account.characters` subset (`Character` instances). If empty, returns empty schedule.
 * @returns {Object} Schedule result and metadata
 */
export function useGroupScheduler(
  groupJobs = [],
  schedulingStrategy = SchedulingStrategy.GREEDY,
  selectedCharacterRows = null
) {
  const queryClient = useQueryClient();

  // "All" ESI hooks (full account), then we narrow to selectedCharacterRows
  const allCharacterIndustryJobs = useGetAllCharacterIndustryJobs();
  const allCorporationIndustryJobs = useGetAllCorporationIndustryJobs();
  const allCharacterSkills = useGetAllCharacterSkills();

  // Combine loading and error states from all hooks
  const queriesLoading = allCharacterIndustryJobs.isLoading || 
                         allCorporationIndustryJobs.isLoading || 
                         allCharacterSkills.isLoading;
  
  const queriesError = allCharacterIndustryJobs.error ||
                       allCorporationIndustryJobs.error ||
                       allCharacterSkills.error;

  const scheduleResult = useMemo(() => {
    if (!groupJobs || groupJobs.length === 0) {
      return {
        schedule: { tasks: [], unscheduledTaskIds: [], makespan: 0 },
        isLoading: false,
        isError: false,
      };
    }

    if (!selectedCharacterRows || selectedCharacterRows.length === 0) {
      return {
        schedule: { tasks: [], unscheduledTaskIds: [], makespan: 0 },
        isLoading: false,
        isError: false,
      };
    }

    // If queries are still loading, return early
    if (queriesLoading) {
      return {
        schedule: { tasks: [], unscheduledTaskIds: [], makespan: 0 },
        isLoading: true,
        isError: false,
      };
    }

    // If there's an error, return early
    if (queriesError) {
      return {
        schedule: { tasks: [], unscheduledTaskIds: [], makespan: 0 },
        isLoading: false,
        isError: true,
        error: queriesError,
      };
    }

    // Get all data from hooks
    const allCorpJobsByCorp = allCorporationIndustryJobs.data || {};
    const allSkillsByChar = allCharacterSkills.data || {};

    // Build active slot data and skills per character from hook data
    const activeCharSlots = [];
    const characterSkillsByHash = {};

    for (const characterRow of selectedCharacterRows) {
      const { CharacterHash, CharacterID } = characterRow;

      // Get character-specific industry jobs from query cache
      // The "all" hook deduplicates and loses characterHash, so we get it from cache
      const charJobsQueryKey = [characterIndustryJobsQueryKey, CharacterHash];
      const charJobsCache = queryClient.getQueryData(charJobsQueryKey);
      const userIndJobs = charJobsCache?.data || [];

      // Corporation jobs are grouped by corporation ID, need to filter by installer_id
      const userCorpIndJobs = [];
      for (const [corpId, jobs] of Object.entries(allCorpJobsByCorp)) {
        if (Array.isArray(jobs)) {
          userCorpIndJobs.push(...jobs.filter((job) => job.installer_id === CharacterID));
        }
      }

      // Skills are already grouped by characterHash, so we can filter directly
      const userSkills = allSkillsByChar[CharacterHash] || {};

      const slotSummary = calculateActiveSlotsSingleFromData(
        characterRow,
        userSkills,
        userIndJobs,
        userCorpIndJobs
      );

      if (slotSummary) {
        activeCharSlots.push(slotSummary);
        characterSkillsByHash[CharacterHash] = userSkills;
      }
    }

    if (!activeCharSlots || activeCharSlots.length === 0) {
      return {
        schedule: { tasks: [], unscheduledTaskIds: [], makespan: 0 },
        isLoading: false,
        isError: false,
        error: "No characters with available slots",
      };
    }

    // Build character resources for scheduler
    const characters = activeCharSlots.map((char) => ({
      characterHash: char.characterHash,
      slots: {
        manufacturing: char.manufacturingSlots || 0,
        reaction: char.reactionSlots || 0,
        science: char.scienceSlots || 0,
      },
    }));

    // Build tasks from jobs and setups
    const tasks = [];
    const taskIdToJobId = {};
    const jobIdToTaskIds = {};

    for (const job of groupJobs) {
      if (!job.build || !job.build.setup) continue;

      const jobTaskIds = [];

      // Process each setup in this job
      for (const [setupId, setup] of Object.entries(job.build.setup)) {
        if (!setup || !setup.jobType) continue;

        // Map jobType to activityType
        let activityType;
        if (job.jobType === jobTypes.manufacturing) {
          activityType = "manufacturing";
        } else if (job.jobType === jobTypes.reaction) {
          activityType = "reaction";
        } else {
          // Skip non-manufacturing/reaction jobs for now
          continue;
        }

        // Split by jobCount: create one task per "slot"
        const jobCount = Number(setup.jobCount || 1);
        for (let slotIndex = 0; slotIndex < jobCount; slotIndex++) {
          const taskId = `${job.jobID}-${setupId}-${slotIndex}`;
          taskIdToJobId[taskId] = job.jobID;
          jobTaskIds.push(taskId);

          tasks.push({
            id: taskId,
            jobID: job.jobID,
            setupID: setupId,
            activityType,
            itemID: job.itemID, // Material type ID for parallel execution tracking
            parentIds: [], // Will be populated below
            setup, // Keep reference for duration calculation
            job, // Keep reference for skill requirements
          });
        }
      }

      if (jobTaskIds.length > 0) {
        jobIdToTaskIds[job.jobID] = jobTaskIds;
      }
    }

    // Build dependency relationships at task level.
    // For a given job J:
    // - J.build.childJobs lists jobs that PRODUCE the materials J needs.
    // - Those child jobs must all complete before J can start.
    //
    // Therefore: ALL tasks from J depend on ALL tasks from each of its child jobs.
    for (const job of groupJobs) {
      if (!job.build || !job.build.childJobs) continue;
      if (!jobIdToTaskIds[job.jobID]) continue;

      const parentTaskIds = jobIdToTaskIds[job.jobID]; // tasks for the consumer job J

      // Gather all child job IDs (producers) for this job
      const allChildJobIDs = Object.values(job.build.childJobs || {}).flat();
      if (allChildJobIDs.length === 0) continue;

      // For each child job, collect all its task IDs
      const allChildTaskIds = [];
      for (const childJobId of allChildJobIDs) {
        const childTaskIds = jobIdToTaskIds[childJobId];
        if (childTaskIds && childTaskIds.length > 0) {
          allChildTaskIds.push(...childTaskIds);
        }
      }

      if (allChildTaskIds.length === 0) continue;

      // Deduplicate child task IDs
      const uniqueChildTaskIds = [...new Set(allChildTaskIds)];

      // All tasks for job J depend on all tasks from its child jobs
      for (const parentTaskId of parentTaskIds) {
        const parentTask = tasks.find((t) => t.id === parentTaskId);
        if (!parentTask) continue;

        const existingParents = new Set(parentTask.parentIds || []);
        for (const depId of uniqueChildTaskIds) {
          existingParents.add(depId);
        }
        parentTask.parentIds = Array.from(existingParents);
      }
    }

    // Precompute durationByCharacter for each task
    // Also track which tasks have no eligible characters (skill issues)
    const durationByCharacter = {};
    const tasksWithNoEligibleCharacters = new Set();

    for (const task of tasks) {
      const { setup, job } = task;
      durationByCharacter[task.id] = {};
      let hasEligibleCharacter = false;

      // Check each character for eligibility and compute duration
      for (const char of activeCharSlots) {
        const characterHash = char.characterHash;
        const userSkills = characterSkillsByHash[characterHash] || {};

        // Check skill eligibility
        const canRun = checkSkillEligibility(job.skills || [], userSkills);
        if (!canRun) {
          // Character cannot run this job - no duration entry
          continue;
        }

        // Compute duration for this character
        // Create a temporary Setup instance with this character
        const tempSetup = new Setup({
          ...setup.toDocument(),
          selectedCharacter: characterHash,
        });

        const duration = calculateTimeForSetup(
          tempSetup,
          job.skills || [],
          queryClient
        );

        if (duration && duration > 0) {
          durationByCharacter[task.id][characterHash] = duration;
          hasEligibleCharacter = true;
        }
      }

      // Track tasks with no eligible characters
      if (!hasEligibleCharacter) {
        tasksWithNoEligibleCharacters.add(task.id);
      }
    }

    // Call scheduler
    const schedule = scheduleGroup({
      tasks: tasks.map((t) => ({
        id: t.id,
        jobID: t.jobID,
        setupID: t.setupID,
        activityType: t.activityType,
        parentIds: t.parentIds,
      })),
      characters,
      startTime: 0,
      getDuration: (task, characterHash) => {
        return durationByCharacter[task.id]?.[characterHash] ?? null;
      },
      schedulingStrategy,
    });

    // Enhance unscheduled task reasons with skill information
    const enhancedReasons = { ...schedule.unscheduledTaskReasons };
    for (const taskId of schedule.unscheduledTaskIds) {
      if (tasksWithNoEligibleCharacters.has(taskId)) {
        enhancedReasons[taskId] = "No characters have the required skills for this job";
      } else if (!enhancedReasons[taskId]) {
        enhancedReasons[taskId] = "No available slots or scheduling constraints";
      }
    }

    return {
      schedule: {
        ...schedule,
        unscheduledTaskReasons: enhancedReasons,
      },
      isLoading: false,
      isError: false,
    };
  }, [groupJobs, queryClient, selectedCharacterRows, schedulingStrategy, queriesLoading, queriesError, allCharacterIndustryJobs, allCorporationIndustryJobs, allCharacterSkills]);

  // Combine loading and error states
  // Loading: queries are loading OR schedule is being calculated (scheduleResult.isLoading)
  const isLoading = queriesLoading || scheduleResult.isLoading;
  const isError = scheduleResult.isError || !!queriesError;
  const error = scheduleResult.error || queriesError;

  return {
    schedule: scheduleResult.schedule,
    isLoading,
    isError,
    error,
  };
}

/**
 * Checks if a character has the required skills to run a job.
 *
 * @param {Array<Object>} requiredSkills - Array of { typeID, level }
 * @param {Object} userSkills - Character skills map
 * @returns {boolean} True if character can run the job
 */
function checkSkillEligibility(requiredSkills, userSkills) {
  if (!requiredSkills || requiredSkills.length === 0) return true;

  for (const reqSkill of requiredSkills) {
    const charSkill = userSkills[reqSkill.typeID];
    if (!charSkill || !charSkill.activeLevel) return false;
    if (charSkill.activeLevel < reqSkill.level) return false;
  }

  return true;
}

