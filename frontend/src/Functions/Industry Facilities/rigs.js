import { jobTypeMapping, rigTypeMap } from "../../Context/defaultValues";
import { getSystemTypeFromID } from "./getStructureInfo";
import {
  readIndustryBonuses,
  readItemFamilyFacts,
  sourceBonusFor,
} from "./industryBonuses";

const SECURITY_SCALED_AXES = new Set(["material"]);

/**
 * One rig, from the table its kind keeps or from the rigs the game publishes.
 *
 * @param {number} jobType - The kind of job the rig is fitted for
 * @param {number} id - The rig id
 * @returns {Object|null} The rig, or null when the kind or the id is unknown
 */
export function getRigInfoFromID(jobType, id) {
  const legacy = rigTypeMap[jobType]?.[id];
  if (legacy) return legacy;

  return readIndustryBonuses()?.sources?.[id] ?? null;
}

/**
 * What one rig gives on one axis for the item being built: a legacy rig's flat
 * figure, or the published figure for the family that item is in.
 *
 * @param {Object} rig - The fitted rig
 * @param {string} axis - material, time, cost or value
 * @param {number} jobType - The kind of job
 * @param {Object|null} item - The group and category of what is being built
 * @param {Object|null} catalogue - The published bonus catalogue
 * @returns {number}
 */
function rigFigureFor(rig, axis, jobType, item, catalogue) {
  if (rig.appliesToAll) return rig[axis] ?? 0;
  if (!rig.bonuses) return 0;

  return sourceBonusFor(
    rig,
    jobTypeMapping[jobType],
    axis,
    item,
    catalogue?.families,
  );
}

/**
 * How much of its bonus a rig gives in one security band, from the multipliers the
 * rig carries. A rig that names no band gives its bonus unscaled.
 *
 * @param {Object|null} rig - The fitted rig
 * @param {number} systemTypeID - The security band the job runs in
 * @param {number} [jobType] - The kind of job, which names the band
 * @returns {number}
 */
export function rigSecurityMultiplier(rig, systemTypeID, jobType) {
  if (rig?.security == null) return 1;

  const band = getSystemTypeFromID(jobType, systemTypeID)?.band;
  return rig.security[systemTypeID] ?? rig.security[band] ?? 1;
}

/**
 * The bonuses two fitted rigs give, each axis taking the better of the two slots
 * and counting only the rigs that help every item.
 *
 * @param {number} jobType - The kind of job the slots belong to
 * @param {number} rigSlot1 - First rig slot id
 * @param {number} rigSlot2 - Second rig slot id
 * @param {number} [systemTypeID=0] - The security band the job runs in
 * @param {number} [itemID] - What is being built, which a published rig is read against
 * @returns {{material: number, time: number, cost: number, value: number}}
 */
export function rigSlotBonuses(
  jobType,
  rigSlot1,
  rigSlot2,
  systemTypeID = 0,
  itemID,
) {
  const rigs = [
    getRigInfoFromID(jobType, rigSlot1),
    getRigInfoFromID(jobType, rigSlot2),
  ];
  const catalogue = readIndustryBonuses();
  const item = readItemFamilyFacts(itemID);

  const best = { material: 0, time: 0, cost: 0, value: 0 };
  for (const rig of rigs) {
    if (!rig) continue;
    const multiplier = rigSecurityMultiplier(rig, systemTypeID, jobType);
    for (const axis of Object.keys(best)) {
      const scale = SECURITY_SCALED_AXES.has(axis) ? multiplier : 1;
      const figure = rigFigureFor(rig, axis, jobType, item, catalogue);
      best[axis] = Math.max(best[axis], figure * scale);
    }
  }
  return best;
}

/**
 * How a setup's two rig slots read on a card: both fitted rigs, the one that is
 * fitted, or "None" when neither is.
 *
 * @param {number} jobType - The kind of job the slots belong to
 * @param {number} rigSlot1 - First rig slot id
 * @param {number} rigSlot2 - Second rig slot id
 * @returns {string}
 */
export function rigSlotLabel(jobType, rigSlot1, rigSlot2) {
  const labels = [rigSlot1, rigSlot2]
    .map((id) => getRigInfoFromID(jobType, id))
    .filter((rig) => rig && rig.id !== 0)
    .map((rig) => rig.label);

  if (labels.length === 0) {
    return getRigInfoFromID(jobType, 0)?.label ?? "None";
  }
  return labels.join(", ");
}

/**
 * Whether a rig competes with the one in the other slot, which is what stops both
 * being fitted: the same rig, one it names in `relatedTo`, or one of its group.
 *
 * @param {Object} rig - The rig being chosen
 * @param {number} otherSlotRigID - What the other slot holds
 * @param {number} [jobType] - The kind of job, which names the other slot's rig
 * @returns {boolean}
 */
export function rigsCompete(rig, otherSlotRigID, jobType) {
  if (!rig || rig.id === 0) return false;
  if (rig.id === otherSlotRigID) return true;
  if (rig.relatedTo?.includes(otherSlotRigID)) return true;

  const other = getRigInfoFromID(jobType, otherSlotRigID);
  if (!other || other.id === 0) return false;
  if (rig.groupID && rig.groupID === other.groupID) return true;

  return sharesABonusedAxis(rig, other);
}

/**
 * The axes a rig gives anything on, whether it carries flat figures or the
 * bonuses the game publishes.
 *
 * @param {Object} rig - A fitted rig
 * @returns {Set<string>}
 * @private
 */
function bonusedAxes(rig) {
  if (rig.bonuses) {
    return new Set(rig.bonuses.map((bonus) => bonus.axis));
  }
  return new Set(
    ["material", "time", "cost", "value"].filter((axis) => rig[axis]),
  );
}

/**
 * Whether one of the app's own rigs and one of the game's overlap, which they do
 * on any axis they both give something on, because the app's own help everything.
 *
 * @param {Object} rig - The rig being chosen
 * @param {Object} other - What the other slot holds
 * @returns {boolean}
 * @private
 */
function sharesABonusedAxis(rig, other) {
  if (Boolean(rig.appliesToAll) === Boolean(other.appliesToAll)) return false;

  const mine = bonusedAxes(rig);
  return [...bonusedAxes(other)].some((axis) => mine.has(axis));
}
