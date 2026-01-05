/**
 * Packed slot selection strategy for task scheduling.
 *
 * This strategy fills gaps in existing slots and ensures parallel execution:
 * 1. If parent is scheduled: Check used slots for gaps that fit before parent starts
 * 2. If no gaps fit: Use new slot, ensuring it finishes before parent starts
 * 3. If parent isn't scheduled: Find first available space
 * 4. Ensure tasks with same parent requirements run in parallel (finish together)
 *
 * Priority order:
 * 1. Avoid sequential execution for tasks with same material (itemID) - prefer parallel
 * 2. If parent scheduled: Prefer gaps in used slots that fit before parent starts
 * 3. If no gaps: Use new slot, finish before parent starts
 * 4. If parent not scheduled: Find first available space
 * 5. Ensure tasks with same parents finish together
 *
 * Key behaviors:
 * - Tasks for same material run in parallel (different slots)
 * - Fill gaps in existing slots when possible
 * - Child tasks finish just before parents start
 */

/**
 * @typedef {Object} SchedulerTask
 * @property {string} id - Unique task ID.
 * @property {string} jobID - Owning job ID.
 * @property {string} [setupID] - Optional setup ID within the job.
 * @property {"manufacturing"|"reaction"|"science"} activityType - Activity type.
 * @property {number} [itemID] - Material/item type ID (for parallel execution tracking).
 * @property {Object<string, number>} [durationByCharacter] - Optional map of
 * characterHash -> duration in seconds. If omitted, a duration resolver
 * must be provided when calling the scheduler.
 * @property {string[]} [parentIds] - IDs of tasks that must complete first.
 */

/**
 * Finds the best character slot for a task using the packed strategy.
 *
 * @param {Object} params
 * @param {SchedulerTask} params.task - The task to schedule
 * @param {"manufacturing"|"reaction"|"science"} params.activityType - Activity type
 * @param {number} params.depsEndTime - Earliest time all dependencies complete
 * @param {number|null} params.earliestParentStart - When earliest parent will start (null if not scheduled)
 * @param {Array<Object>} params.scheduledTasks - Currently scheduled tasks for gap detection
 * @param {Record<string, Record<string, number[]>>} params.nextFreeTimes - Next free time for each character/slot
 * @param {Record<string, boolean>} params.characterUsedForActivity - Track which characters are used for each activity
 * @param {string[]} params.charOrder - Stable character order for tie-breaking
 * @param {(task: SchedulerTask, characterHash: string) => number | null} [params.getDuration] - Duration resolver
 * @param {Record<string, Set<string>>} [params.characterJobsByJobID={}] - Track which characters run tasks for each job
 * @param {Record<number, Set<string>>} [params.characterMaterialsByItemID={}] - Track which characters run tasks for each material (itemID)
 * @param {string} [params.parentSetKey] - Key identifying tasks with same parent requirements
 * @param {Record<string, Set<string>>} [params.characterTasksByParentSet={}] - Track which characters run tasks with same parent requirements
 *
 * @returns {{
 *   characterHash: string,
 *   slotIndex: number,
 *   startTime: number,
 *   endTime: number
 * } | null} Best slot assignment, or null if no valid slot found
 */
export function selectSlotPackedStrategy({
    task,
    activityType,
    depsEndTime,
    earliestParentStart = null,
    scheduledTasks = [],
    parentSetKey = '',
    nextFreeTimes,
    characterUsedForActivity,
    charOrder,
    getDuration,
    characterJobsByJobID = {},
    characterMaterialsByItemID = {},
    characterTasksByParentSet = {},
}) {
    // We need to know the global start time to identify new slots
    // Since slots are initialized with startTime, a slot is "new" if slotFreeTime equals the minimum value
    // We'll find the minimum slot free time across all characters to determine what "new" means
    let minSlotFreeTime = Infinity;
    for (const characterHash of charOrder) {
        const activitySlots = nextFreeTimes[characterHash]?.[activityType];
        if (activitySlots) {
            for (const freeTime of activitySlots) {
                if (freeTime < minSlotFreeTime) {
                    minSlotFreeTime = freeTime;
                }
            }
        }
    }
    // If no slots found, default to 0
    if (minSlotFreeTime === Infinity) minSlotFreeTime = 0;
    
    // Build a map of scheduled tasks by character/slot for gap detection
    // Format: characterHash -> slotIndex -> [{startTime, endTime}, ...]
    const scheduledBySlot = {};
    for (const scheduledTask of scheduledTasks) {
        if (scheduledTask.activityType !== activityType) continue;
        const { characterHash, slotIndex, startTime, endTime } = scheduledTask;
        if (!scheduledBySlot[characterHash]) scheduledBySlot[characterHash] = {};
        if (!scheduledBySlot[characterHash][slotIndex]) {
            scheduledBySlot[characterHash][slotIndex] = [];
        }
        scheduledBySlot[characterHash][slotIndex].push({ startTime, endTime });
    }
    
    // Sort tasks in each slot by start time for gap detection
    for (const charHash in scheduledBySlot) {
        for (const slotIdx in scheduledBySlot[charHash]) {
            scheduledBySlot[charHash][slotIdx].sort((a, b) => a.startTime - b.startTime);
        }
    }
    
    let best = null;
    let evaluatedCount = 0;
    let skippedCount = 0;
    const skipReasons = {};

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

        if (baseDuration == null || baseDuration <= 0) {
            skipReasons['no_duration'] = (skipReasons['no_duration'] || 0) + 1;
            return;
        }

        for (let slotIndex = 0; slotIndex < activitySlots.length; slotIndex++) {
            const slotFreeTime = activitySlots[slotIndex];
            const usedKey = `${characterHash}:${activityType}`;
            const alreadyUsed = !!characterUsedForActivity[usedKey];
            const charPos = charOrder.indexOf(characterHash);

            // Check if this character is already running tasks for the same material (itemID)
            // Tasks for the same material should run in parallel, not sequentially
            const sameMaterialCharacters = task.itemID ? (characterMaterialsByItemID[task.itemID] || new Set()) : new Set();
            const runningSameMaterial = sameMaterialCharacters.has(characterHash);

            // Check if this character is already running tasks with the same parent requirements
            // Tasks with the same parents should run in parallel to finish together
            const sameParentSetCharacters = parentSetKey ? (characterTasksByParentSet[parentSetKey] || new Set()) : new Set();
            const runningSameParentSet = sameParentSetCharacters.has(characterHash);

            // Check if this slot is already in use (has tasks scheduled)
            const slotInUse = slotFreeTime > minSlotFreeTime;
            const isNewSlot = slotFreeTime === minSlotFreeTime;
            
            // For parallel execution: if this character is already running tasks for the same material
            // OR tasks with the same parent requirements, prefer NEW slots (not in use) so they run in parallel
            const wouldBeSequential = (runningSameMaterial || runningSameParentSet) && slotInUse;
            
            // Find gaps in this slot if it has scheduled tasks
            let gapFit = null;
            
            if (scheduledBySlot[characterHash]?.[slotIndex]) {
                // Slot has scheduled tasks - look for gaps
                const slotTasks = scheduledBySlot[characterHash][slotIndex];
                
                // Check gap before first task
                if (slotTasks.length > 0 && slotTasks[0].startTime > depsEndTime) {
                    const gapStart = Math.max(depsEndTime, slotFreeTime);
                    const gapEnd = slotTasks[0].startTime;
                    const gapSize = gapEnd - gapStart;
                    
                    if (gapSize >= baseDuration) {
                        const gapEndTime = gapStart + baseDuration;
                        // If parent is scheduled, gap must finish before parent starts
                        // If parent not scheduled (null or 0), any gap that fits is fine
                        if (earliestParentStart === null || earliestParentStart === 0 || gapEndTime <= earliestParentStart) {
                            gapFit = { startTime: gapStart, endTime: gapEndTime };
                        }
                    }
                }
                
                // Check gaps between tasks
                if (!gapFit) {
                    for (let i = 0; i < slotTasks.length - 1; i++) {
                        const gapStart = slotTasks[i].endTime;
                        const gapEnd = slotTasks[i + 1].startTime;
                        const gapSize = gapEnd - gapStart;
                        
                        if (gapSize >= baseDuration && gapStart >= depsEndTime) {
                            const gapEndTime = gapStart + baseDuration;
                            // If parent is scheduled, gap must finish before parent starts
                            // If parent not scheduled (null or 0), any gap that fits is fine
                            if (earliestParentStart === null || earliestParentStart === 0 || gapEndTime <= earliestParentStart) {
                                gapFit = { startTime: gapStart, endTime: gapEndTime };
                                break;
                            }
                        }
                    }
                }
            }
            
            // Determine start and end time
            let startTime, endTime;
            if (gapFit) {
                // Use the gap
                startTime = gapFit.startTime;
                endTime = gapFit.endTime;
            } else {
                // No gap found - use standard scheduling
                startTime = Math.max(depsEndTime, slotFreeTime);
                endTime = startTime + baseDuration;
                
                // If parent is scheduled, ensure we finish before parent starts
                // Note: earliestParentStart === 0 means no parent scheduled (treat as null)
                if (earliestParentStart !== null && earliestParentStart > 0) {
                    // Check if we can finish before parent starts
                    if (endTime > earliestParentStart) {
                        // Try to start earlier to finish before parent
                        const latestStart = earliestParentStart - baseDuration;
                        if (latestStart >= depsEndTime && latestStart >= slotFreeTime) {
                            // We can start earlier and finish in time
                            startTime = latestStart;
                            endTime = startTime + baseDuration;
                        } else {
                            // Can't finish before parent with this slot
                            skipReasons['cant_finish_before_parent'] = (skipReasons['cant_finish_before_parent'] || 0) + 1;
                            continue;
                        }
                    }
                }
            }
            
            // Calculate how close the end time is to when parent needs it
            // Note: earliestParentStart === 0 means no parent scheduled (treat as null)
            const targetTime = (earliestParentStart !== null && earliestParentStart > 0) ? earliestParentStart : depsEndTime;
            const endTimeDistanceFromTarget = Math.abs(endTime - targetTime);

            evaluatedCount++;
            
            const candidate = {
                characterHash,
                slotIndex,
                startTime,
                endTime,
                endTimeDistanceFromTarget, // How close end time is to when parent needs it
                alreadyUsed,
                slotInUse,
                isNewSlot, // Slot hasn't been used yet
                wouldBeSequential, // Would run sequentially with same material task (bad for parallel)
                fillsGap: gapFit !== null, // Fills a gap in existing slot (good for slot efficiency)
                charPos: charPos === -1 ? Number.MAX_SAFE_INTEGER : charPos,
            };

            if (!best) {
                best = candidate;
                continue;
            }

            // PRIMARY: Avoid sequential execution for tasks with same material (itemID)
            // Tasks for the same material should run in parallel, not sequentially
            // BUT: Only reject if we have other options. If this is the only candidate, accept it.
            if (candidate.wouldBeSequential && !best.wouldBeSequential) {
                // Current best is better (allows parallel execution)
                continue;
            } else if (!candidate.wouldBeSequential && best.wouldBeSequential) {
                // Candidate is better (allows parallel execution)
                best = candidate;
            } else {
                // Both have same sequential/parallel status
                // SECONDARY: If parent is scheduled, prefer filling gaps in existing slots
                // This minimizes slot usage by using gaps before parents start
                // Note: earliestParentStart === 0 means no parent scheduled (treat as null)
                if (earliestParentStart !== null && earliestParentStart > 0) {
                    if (candidate.fillsGap && !best.fillsGap) {
                        best = candidate;
                    } else if (candidate.fillsGap === best.fillsGap) {
                        // TERTIARY: Prefer finishing closer to when parent needs it (finish together)
                        if (candidate.endTimeDistanceFromTarget < best.endTimeDistanceFromTarget) {
                            best = candidate;
                        } else if (candidate.endTimeDistanceFromTarget === best.endTimeDistanceFromTarget) {
                            // If end times are equally close, prefer earlier end time
                            if (candidate.endTime < best.endTime) {
                                best = candidate;
                            } else if (candidate.endTime === best.endTime) {
                                // QUATERNARY: Prefer characters already used for this activity
                                if (candidate.alreadyUsed && !best.alreadyUsed) {
                                    best = candidate;
                                } else if (candidate.alreadyUsed === best.alreadyUsed) {
                                    // FINAL: Prefer earlier characters in order (stable tie-breaker)
                                    if (candidate.charPos < best.charPos) {
                                        best = candidate;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Parent not scheduled - prefer first available space (earliest end time)
                    if (candidate.endTime < best.endTime) {
                        best = candidate;
                    } else if (candidate.endTime === best.endTime) {
                        // QUATERNARY: Prefer characters already used for this activity
                        if (candidate.alreadyUsed && !best.alreadyUsed) {
                            best = candidate;
                        } else if (candidate.alreadyUsed === best.alreadyUsed) {
                            // FINAL: Prefer earlier characters in order (stable tie-breaker)
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

    if (!best) {
        // Calculate some diagnostic info
        const hasValidParentStart = earliestParentStart !== null && earliestParentStart > 0;
        const canFinishBeforeParent = hasValidParentStart ? (depsEndTime + Math.min(...Object.values(task.durationByCharacter || {}).filter(d => d > 0))) <= earliestParentStart : true;
        
        console.warn(`[PackedStrategy] No slot found for task ${task.id}`, {
            taskId: task.id,
            jobID: task.jobID,
            activityType,
            depsEndTime,
            earliestParentStart,
            hasValidParentStart,
            canFinishBeforeParent,
            evaluatedCount,
            skippedCount,
            skipReasons,
            parentIds: task.parentIds,
            itemID: task.itemID,
            availableCharacters: charOrder.length,
            minDuration: Math.min(...Object.values(task.durationByCharacter || {}).filter(d => d > 0), Infinity),
        });
        return null;
    }

    return {
        characterHash: best.characterHash,
        slotIndex: best.slotIndex,
        startTime: best.startTime,
        endTime: best.endTime,
    };
}

