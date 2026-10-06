import { readReprocessingItems } from "../Static/reprocessing";
import { reprocessingItemTypes } from "../../Context/defaultValues";
import {
  reprocessingEfficiencySkillID,
  reprocessingSkillID,
} from "./engine/reprocessingSetup";

/** The two skills every reprocessing yield reads, whatever is reprocessed. */
const SKILLS_EVERY_YIELD_READS = [
  reprocessingSkillID,
  reprocessingEfficiencySkillID,
];

/**
 * Every skill a reprocessing yield can read: the two every yield reads, then each processing skill
 * the reprocessing file names, in the order the file first names them.
 *
 * @returns {Array<number>}
 */
export function allReprocessingSkillIDs() {
  return skillsOf(Object.values(readReprocessingItems() ?? {}));
}

/**
 * The skills the yield of these items reads: the two every yield reads, then each item's own
 * processing skill once.
 *
 * @param {Array<number|string>} typeIDs - reprocessable items
 * @returns {Array<number>}
 */
export function reprocessingSkillIDsFor(typeIDs) {
  const entries = readReprocessingItems() ?? {};
  return skillsOf(
    typeIDs.map((typeID) => entries[String(typeID)]).filter(Boolean),
  );
}

/** The kinds of item a setup always states a yield for, pasted or not. */
const KINDS_ALWAYS_YIELDED = [
  reprocessingItemTypes.ore,
  reprocessingItemTypes.moonOre,
  reprocessingItemTypes.ice,
];

/**
 * The kinds of item to state a yield for, with the processing skills each reads: the pasted items'
 * own skills, or every skill of a kind that is always shown but not pasted.
 *
 * @param {Array<number|string>} typeIDs - reprocessable items
 * @returns {Array<{itemType: number, skillIDs: Array<number>}>}
 */
export function yieldKindsFor(typeIDs) {
  const entries = readReprocessingItems() ?? {};
  const every = Object.values(entries);
  const pasted = typeIDs
    .map((typeID) => entries[String(typeID)])
    .filter(Boolean);
  const kinds = new Set([
    ...KINDS_ALWAYS_YIELDED,
    ...pasted.map((entry) => entry.itemType),
  ]);

  return Object.values(reprocessingItemTypes)
    .filter((itemType) => kinds.has(itemType))
    .map((itemType) => {
      const own = pasted.filter((entry) => entry.itemType === itemType);
      const source = own.length > 0 ? own : every;
      return {
        itemType,
        skillIDs: [
          ...new Set(
            source
              .filter((entry) => entry.itemType === itemType)
              .map((entry) => entry.reprocessingSkill)
              .filter(Boolean),
          ),
        ],
      };
    })
    .filter(({ skillIDs }) => skillIDs.length > 0);
}

/**
 * The item kind a processing skill raises the yield of, from the first item the file has naming it.
 *
 * @param {number} skillID
 * @returns {number|undefined}
 */
export function itemTypeRaisedBy(skillID) {
  return Object.values(readReprocessingItems() ?? {}).find(
    (entry) => entry.reprocessingSkill === skillID,
  )?.itemType;
}

/**
 * The two every yield reads, then each entry's processing skill once.
 *
 * @param {Array<{reprocessingSkill?: number}>} entries
 * @returns {Array<number>}
 */
function skillsOf(entries) {
  const skills = new Set(SKILLS_EVERY_YIELD_READS);
  for (const { reprocessingSkill } of entries) {
    if (reprocessingSkill) skills.add(reprocessingSkill);
  }
  return [...skills];
}
