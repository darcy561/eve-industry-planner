/**
 * Greedy slot selection strategy for task scheduling.
 *
 * This strategy prioritizes:
 * 1. Earliest end time (minimise makespan)
 * 2. Slots already in use (packing preference - minimise slot count)
 * 3. Characters already used for this activity (minimise character count)
 * 4. Characters running tasks from the same job (grouping preference, if multiple slots available)
 * 5. Earlier characters in order (stable tie-breaker)
 *
 * This is a balanced approach that aims to minimise overall completion time
 * while also trying to use fewer slots and characters when possible.
 */

/**
 * @typedef {Object} SchedulerTask
 * @property {string} id - Unique task ID.
 * @property {string} jobID - Owning job ID.
 * @property {string} [setupID] - Optional setup ID within the job.
 * @property {"manufacturing"|"reaction"|"science"} activityType - Activity type.
 * @property {Object<string, number>} [durationByCharacter] - Optional map of
 * characterHash -> duration in seconds. If omitted, a duration resolver
 * must be provided when calling the scheduler.
 * @property {string[]} [parentIds] - IDs of tasks that must complete first.
 */

/**
 * Finds the best character slot for a task using the greedy strategy.
 *
 * @param {Object} params
 * @param {SchedulerTask} params.task - The task to schedule
 * @param {"manufacturing"|"reaction"|"science"} params.activityType - Activity type
 * @param {number} params.depsEndTime - Earliest time all dependencies complete
 * @param {Record<string, Record<string, number[]>>} params.nextFreeTimes - Next free time for each character/slot
 * @param {Record<string, boolean>} params.characterUsedForActivity - Track which characters are used for each activity
 * @param {string[]} params.charOrder - Stable character order for tie-breaking
 * @param {(task: SchedulerTask, characterHash: string) => number | null} [params.getDuration] - Duration resolver
 * @param {Record<string, Set<string>>} [params.characterJobsByJobID={}] - Track which characters run tasks for each job
 *
 * @returns {{
 *   characterHash: string,
 *   slotIndex: number,
 *   startTime: number,
 *   endTime: number
 * } | null} Best slot assignment, or null if no valid slot found
 */
export function selectSlotGreedyStrategy({
    task,
    activityType,
    depsEndTime,
    earliestParentStart = null, // Not used in greedy, but kept for interface consistency
    scheduledTasks = [], // Not used in greedy, but kept for interface consistency
    parentSetKey = '', // Not used in greedy, but kept for interface consistency
    nextFreeTimes,
    characterUsedForActivity,
    charOrder,
    getDuration,
    characterJobsByJobID = {},
    characterMaterialsByItemID = {}, // Not used in greedy, but kept for interface consistency
    characterTasksByParentSet = {}, // Not used in greedy, but kept for interface consistency
}) {
    let best = null;

    // Helper to evaluate a particular character.
    function evaluateCharacter(characterHash) {
        const activitySlots =
            nextFreeTimes[characterHash] &&
            nextFreeTimes[characterHash][activityType];
        if (!activitySlots || activitySlots.length === 0) return;

        const baseDuration =
            typeof getDuration === "function"
                ? getDuration(task, characterHash)
                : task.durationByCharacter &&
                    task.durationByCharacter[characterHash] != null
                    ? task.durationByCharacter[characterHash]
                    : null;

        if (baseDuration == null || baseDuration <= 0) return;

        for (let slotIndex = 0; slotIndex < activitySlots.length; slotIndex++) {
            const slotFreeTime = activitySlots[slotIndex];
            const startTime = Math.max(depsEndTime, slotFreeTime);
            const endTime = startTime + baseDuration;
            const usedKey = `${characterHash}:${activityType}`;
            const alreadyUsed = !!characterUsedForActivity[usedKey];
            const charPos = charOrder.indexOf(characterHash);

            // Check if this character is already running tasks from the same job
            // Only prefer same-job grouping if the character has multiple free slots available
            const sameJobCharacters = characterJobsByJobID[task.jobID] || new Set();
            const runningSameJob = sameJobCharacters.has(characterHash);
            const availableSlots = activitySlots.filter(slot => slot <= startTime).length;
            const hasMultipleFreeSlots = availableSlots > 1;

            // Check if this slot is already in use (has tasks scheduled)
            // A slot is "in use" if its free time is greater than 0 (the global start time)
            // This means the slot has been used for previous tasks, so we're packing into it
            // We prefer packing into used slots to minimise the total number of slots used
            const slotInUse = slotFreeTime > 0;

            const candidate = {
                characterHash,
                slotIndex,
                startTime,
                endTime,
                alreadyUsed,
                runningSameJob: runningSameJob && hasMultipleFreeSlots, // Only prefer if multiple slots available
                slotInUse, // Track if we're reusing a slot that already has tasks
                charPos: charPos === -1 ? Number.MAX_SAFE_INTEGER : charPos,
            };

            if (!best) {
                best = candidate;
                continue;
            }

            if (candidate.endTime < best.endTime) {
                best = candidate;
            } else if (candidate.endTime === best.endTime) {
                // First, prefer slots that are already in use (packing preference)
                // This minimizes the number of slots used by reusing slots with existing tasks
                if (candidate.slotInUse && !best.slotInUse) {
                    best = candidate;
                } else if (candidate.slotInUse === best.slotInUse) {
                    // Then, prefer characters already used for this activity (minimise character count)
                    if (candidate.alreadyUsed && !best.alreadyUsed) {
                        best = candidate;
                    } else if (candidate.alreadyUsed === best.alreadyUsed) {
                        // Then, prefer characters already running tasks from the same job (grouping preference)
                        // This helps group tasks from the same material/job together
                        if (candidate.runningSameJob && !best.runningSameJob) {
                            best = candidate;
                        } else if (candidate.runningSameJob === best.runningSameJob) {
                            // Finally, prefer earlier characters in the order (stable tie-breaker)
                            if (candidate.charPos < best.charPos) {
                                best = candidate;
                            }
                        }
                    }
                }
            }
        }
    }

    // Evaluate all characters in stable order.
    for (const characterHash of charOrder) {
        evaluateCharacter(characterHash);
    }

    if (!best) return null;

    return {
        characterHash: best.characterHash,
        slotIndex: best.slotIndex,
        startTime: best.startTime,
        endTime: best.endTime,
    };
}

