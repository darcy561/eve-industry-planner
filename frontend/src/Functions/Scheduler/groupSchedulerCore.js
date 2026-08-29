/**
 * Group job scheduling core.
 *
 * This module contains a pure function that schedules a set of tasks across
 * multiple characters with limited activity slots, while respecting
 * parent/child (precedence) constraints.
 *
 * It is intentionally framework-agnostic so it can be used from both React
 * hooks and non-React code.
 */

import { selectSlotGreedyStrategy } from "./greedySlotSelection";
import { selectSlotPackedStrategy } from "./packedSlotSelection";

/**
 * Scheduling strategy types.
 * @readonly
 * @enum {number}
 */
export const SchedulingStrategy = {
    /** Default greedy strategy: earliest end time, prefer slot reuse, prefer character reuse */
    GREEDY: 0,
    /** Packed strategy: prioritise slot reuse to minimise total slots used */
    PACKED: 1,
    // Future strategies can be added here:
    // BALANCED: 2,
};

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
 * @typedef {Object} SchedulerCharacter
 * @property {string} characterHash - Character identifier.
 * @property {Object} slots - Slot counts by activity type.
 * @property {number} [slots.manufacturing]
 * @property {number} [slots.reaction]
 * @property {number} [slots.science]
 */

/**
 * @typedef {Object} ScheduledTask
 * @property {string} id
 * @property {string} jobID
 * @property {string} [setupID]
 * @property {"manufacturing"|"reaction"|"science"} activityType
 * @property {string} characterHash
 * @property {number} slotIndex
 * @property {number} startTime
 * @property {number} endTime
 * @property {string[]} parentIds
 */

/**
 * Schedules a set of tasks across characters with limited slots.
 *
 * Heuristic:
 * - Respect all parent/child constraints (DAG-based).
 * - Always start tasks as early as possible given dependencies.
 * - Prefer characters that are already used for the activity type when
 *   there are ties, to keep schedules compact.
 *
 * @param {Object} params
 * @param {SchedulerTask[]} params.tasks
 * @param {SchedulerCharacter[]} params.characters
 * @param {number} [params.startTime=0] - Base start time for the schedule.
 * @param {(task: SchedulerTask, characterHash: string) => number | null} [params.getDuration]
 *  Optional duration resolver. When provided, it will be used as the single
 *  source of truth for per-character durations. When omitted, the scheduler
 *  will fall back to `task.durationByCharacter[characterHash]` and skip
 *  characters with no duration entry.
 * @param {number} [params.schedulingStrategy=0] - Scheduling strategy.
 *  Options: 0 (GREEDY, default). Future strategies can be added.
 *
 * @returns {{
 *   tasks: ScheduledTask[],
 *   unscheduledTaskIds: string[],
 *   unscheduledTaskReasons: Record<string, string>,
 *   makespan: number
 * }}
 */
export function scheduleGroup({
    tasks = [],
    characters = [],
    startTime = 0,
    getDuration,
    schedulingStrategy = SchedulingStrategy.GREEDY,
}) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return { tasks: [], unscheduledTaskIds: [], unscheduledTaskReasons: {}, makespan: 0 };
    }

    if (!Array.isArray(characters) || characters.length === 0) {
        const ids = tasks.map((t) => t.id);
        const reasons = {};
        ids.forEach(id => {
            reasons[id] = "No characters available";
        });
        return { tasks: [], unscheduledTaskIds: ids, unscheduledTaskReasons: reasons, makespan: 0 };
    }

    // Normalise characters: ensure slot counts are non-negative integers.
    const charOrder = characters.map((c) => c.characterHash);
    const activityTypes = /** @type {const} */ ([
        "manufacturing",
        "reaction",
        "science",
    ]);

    /** @type {Record<string, Record<string, number[]>>} */
    const nextFreeTimes = {};
    /** @type {Record<string, boolean>} */
    const characterUsedForActivity = {};
    /** @type {Record<string, Set<string>>} */
    const characterJobsByJobID = {};
    /** @type {Record<number, Set<string>>} */
    const characterMaterialsByItemID = {}; // Track which characters run tasks for each material (itemID)
    /** @type {Record<string, Set<string>>} */
    const characterTasksByParentSet = {}; // Track which characters run tasks with same parent requirements

    for (const char of characters) {
        const { characterHash, slots = {} } = char;
        if (!nextFreeTimes[characterHash]) {
            nextFreeTimes[characterHash] = {};
        }
        for (const activity of activityTypes) {
            const count = Math.max(0, Number(slots[activity] || 0));
            nextFreeTimes[characterHash][activity] = Array(count).fill(startTime);
        }
    }

    // Build task lookup, parent counts and children adjacency.
    /** @type {Record<string, SchedulerTask>} */
    const taskById = {};
    /** @type {Record<string, number>} */
    const remainingParents = {};
    /** @type {Record<string, string[]>} */
    const childrenById = {};

    for (const task of tasks) {
        if (!task.id) continue;
        // Ensure parentIds is an array and use it from the task
        const parentIds = Array.isArray(task.parentIds) ? task.parentIds : [];
        taskById[task.id] = {
            ...task,
            parentIds, // Ensure parentIds is always an array
        };
        remainingParents[task.id] = parentIds.length;
        for (const parentId of parentIds) {
            if (!parentId) continue; // Skip invalid parent IDs
            if (!childrenById[parentId]) childrenById[parentId] = [];
            childrenById[parentId].push(task.id);
        }
    }

    /** @type {Record<string, number>} */
    const endTimes = {};
    /** @type {Record<string, number>} */
    const startTimes = {}; // Track when tasks start (for gap detection)

    /** @type {string[]} */
    const readyQueue = [];
    for (const [id, count] of Object.entries(remainingParents)) {
        if (count === 0) readyQueue.push(id);
    }

    /** @type {ScheduledTask[]} */
    const scheduled = [];

    // Choose scheduling strategy based on enum value.
    const pickSlot = getSchedulingStrategyFunction(schedulingStrategy);

    // Helper function to get task duration for sorting (longest first)
    const getTaskDurationForSorting = (taskId) => {
        const task = taskById[taskId];
        if (!task) return 0;

        // Try to get duration from getDuration callback or durationByCharacter
        if (typeof getDuration === "function") {
            // We need a character to get duration, so use the first available character
            // This is just for sorting, so approximate is fine
            for (const char of characters) {
                const duration = getDuration(task, char.characterHash);
                if (duration != null && duration > 0) {
                    return duration;
                }
            }
        } else if (task.durationByCharacter) {
            // Use the maximum duration across characters (approximate)
            const durations = Object.values(task.durationByCharacter).filter(d => d > 0);
            if (durations.length > 0) {
                return Math.max(...durations);
            }
        }
        return 0;
    };

    // Main scheduling loop: process tasks when all parents are done.
    while (readyQueue.length > 0) {
        // Sort ready queue by task duration (longest first) for both greedy and packed strategies
        // This helps schedule longer tasks first, leaving gaps that can be filled
        if (readyQueue.length > 1) {
            readyQueue.sort((a, b) => {
                const durationA = getTaskDurationForSorting(a);
                const durationB = getTaskDurationForSorting(b);
                return durationB - durationA; // Descending order (longest first)
            });
        }

        const taskId = readyQueue.shift();
        if (!taskId) continue;
        const task = taskById[taskId];
        if (!task) continue;

        // Double-check that all parents have completed
        const parentIds = task.parentIds || [];
        const allParentsComplete = parentIds.every(parentId => {
            const parentEnd = endTimes[parentId];
            return parentEnd !== undefined && parentEnd !== null;
        });

        if (!allParentsComplete && parentIds.length > 0) {
            // This shouldn't happen if the dependency graph is correct, but skip to be safe
            continue;
        }

        const { activityType } = task;
        if (!activityType) {
            // Skip zero-duration or malformed tasks but keep graph moving.
            endTimes[taskId] = startTime;
            propagateChildren(taskId, remainingParents, childrenById, readyQueue);
            continue;
        }

        const depsEndTime = parentIds.reduce((max, parentId) => {
            const parentEnd = endTimes[parentId] ?? startTime;
            return parentEnd > max ? parentEnd : max;
        }, startTime);

        // Get child task start times (when tasks that depend on this task will start)
        // This helps identify gaps before children start - we want to finish before they start
        // Only include children that have actually been scheduled (have a startTime)
        const childTaskIds = childrenById[taskId] || [];
        const childStartTimes = childTaskIds.length > 0
            ? childTaskIds
                .map(childId => startTimes[childId]) // Only use startTimes, not endTimes or fallback
                .filter(startTime => startTime !== undefined && startTime !== null) // Only scheduled children
            : [];
        const earliestParentStart = childStartTimes.length > 0
            ? Math.min(...childStartTimes)
            : null; // null means no child scheduled yet

        // Create a key for tasks with the same parent requirements
        // Tasks with the same parents should run in parallel
        const taskParentSetKey = parentIds.length > 0
            ? [...parentIds].sort().join(',')
            : 'no-parents';

        const assignment = pickSlot({
            task,
            activityType,
            depsEndTime,
            earliestParentStart, // When the earliest parent will start (null if not scheduled)
            scheduledTasks: scheduled, // All currently scheduled tasks for gap detection
            parentSetKey: taskParentSetKey, // Key identifying tasks with same parent requirements
            nextFreeTimes,
            characterUsedForActivity,
            charOrder,
            getDuration,
            characterJobsByJobID,
            characterMaterialsByItemID,
            characterTasksByParentSet,
        });

        if (!assignment) {
            // No available slots for this activity across all characters.
            // Do not propagate children; they will remain blocked.
            continue;
        }

        const { characterHash, slotIndex, startTime: sTime, endTime: eTime } =
            assignment;

        // Update slot availability and record result.
        nextFreeTimes[characterHash][activityType][slotIndex] = eTime;
        characterUsedForActivity[`${characterHash}:${activityType}`] = true;
        endTimes[taskId] = eTime;
        startTimes[taskId] = sTime; // Track start time for gap detection

        // Track which characters are running tasks from each job
        if (task.jobID) {
            if (!characterJobsByJobID[task.jobID]) {
                characterJobsByJobID[task.jobID] = new Set();
            }
            characterJobsByJobID[task.jobID].add(characterHash);
        }

        // Track which characters are running tasks for each material (itemID)
        // This is used for parallel execution of tasks producing the same material
        if (task.itemID) {
            if (!characterMaterialsByItemID[task.itemID]) {
                characterMaterialsByItemID[task.itemID] = new Set();
            }
            characterMaterialsByItemID[task.itemID].add(characterHash);
        }

        // Track which characters are running tasks with the same parent requirements
        // Tasks with the same parents should run in parallel to finish together
        // Use the same parentSetKey we created earlier
        if (!characterTasksByParentSet[taskParentSetKey]) {
            characterTasksByParentSet[taskParentSetKey] = new Set();
        }
        characterTasksByParentSet[taskParentSetKey].add(characterHash);

        scheduled.push({
            id: task.id,
            jobID: task.jobID,
            setupID: task.setupID,
            activityType,
            characterHash,
            slotIndex,
            startTime: sTime,
            endTime: eTime,
            parentIds: task.parentIds || [],
        });

        // Unblock children.
        propagateChildren(taskId, remainingParents, childrenById, readyQueue);
    }

    const scheduledIds = new Set(scheduled.map((t) => t.id));
    const unscheduledTaskIds = Object.keys(taskById).filter(
        (id) => !scheduledIds.has(id)
    );

    // Build reasons for unscheduled tasks
    const unscheduledTaskReasons = {};
    for (const taskId of unscheduledTaskIds) {
        const task = taskById[taskId];
        if (!task) continue;

        // Check if task has any eligible characters (duration entries)
        let hasEligibleCharacter = false;
        if (typeof getDuration === "function") {
            for (const char of characters) {
                const duration = getDuration(task, char.characterHash);
                if (duration != null && duration > 0) {
                    hasEligibleCharacter = true;
                    break;
                }
            }
        } else if (task.durationByCharacter) {
            hasEligibleCharacter = Object.values(task.durationByCharacter).some(d => d > 0);
        }

        if (!hasEligibleCharacter) {
            unscheduledTaskReasons[taskId] = "No characters have the required skills for this job";
        } else {
            // Task has eligible characters but couldn't be scheduled - likely slot availability
            unscheduledTaskReasons[taskId] = "No available slots or scheduling constraints";
        }
    }

    const makespan = scheduled.reduce(
        (max, t) => (t.endTime > max ? t.endTime : max),
        startTime
    );

    return {
        tasks: scheduled,
        unscheduledTaskIds,
        unscheduledTaskReasons,
        makespan,
    };
}

/**
 * Returns the scheduling strategy function for the given strategy.
 *
 * @param {number} strategy - Strategy identifier (from SchedulingStrategy enum)
 * @returns {Function} Slot selection function
 */
function getSchedulingStrategyFunction(strategy) {
    switch (strategy) {
        case SchedulingStrategy.GREEDY:
        default:
            return selectSlotGreedyStrategy;
        case SchedulingStrategy.PACKED:
            return selectSlotPackedStrategy;
        // Future strategies can be added here:
        // case SchedulingStrategy.BALANCED:
        //     return selectSlotBalancedStrategy;
    }
}

/**
 * Decrements remaining parent counts for children and enqueues those that
 * now have zero remaining parents.
 *
 * @param {string} taskId
 * @param {Record<string, number>} remainingParents
 * @param {Record<string, string[]>} childrenById
 * @param {string[]} readyQueue
 */
function propagateChildren(taskId, remainingParents, childrenById, readyQueue) {
    const children = childrenById[taskId];
    if (!children || children.length === 0) return;

    for (const childId of children) {
        if (remainingParents[childId] === undefined) continue;
        remainingParents[childId] -= 1;
        if (remainingParents[childId] === 0) {
            readyQueue.push(childId);
        }
    }
}

