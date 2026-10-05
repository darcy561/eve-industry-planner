import { copyOfJob } from "../jobDocument";
import Group from "../../../Classes/group";

/**
 * Copies taken on first use, so a change can be built without touching what the planner holds.
 *
 * @template T
 * @param {(id: string) => T | null | undefined} find - Reads the planner's own object
 * @param {(source: T) => T} copy
 */
function workingCopies(find, copy) {
  const held = new Map();
  return {
    /** @param {string} id @returns {T | null} The copy, taken now if it was not already */
    get(id) {
      if (held.has(id)) return held.get(id);
      const source = find(id);
      if (!source) return null;
      const copied = copy(source);
      held.set(id, copied);
      return copied;
    },
    /** @param {string} id @returns {T | undefined} The copy, only if one was already taken */
    taken(id) {
      return held.get(id);
    },
    /** @returns {Array<T>} Every copy taken */
    all() {
      return [...held.values()];
    },
  };
}

/**
 * Working copies of planner jobs, each taken the first time it is asked for.
 *
 * @param {(jobID: string) => object | null | undefined} find
 */
export function workingJobs(find) {
  return workingCopies(find, copyOfJob);
}

/**
 * Working copies of planner groups, each taken the first time it is asked for.
 *
 * @param {(groupID: string) => object | null | undefined} find
 */
export function workingGroups(find) {
  return workingCopies(find, (source) => new Group(source.toDocument()));
}
