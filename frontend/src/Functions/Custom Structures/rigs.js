import { rigTypeMap } from "../../Context/defaultValues";

/**
 * One rig, read from the table its kind keeps.
 *
 * @param {number} jobType - The kind of job the rig is fitted for
 * @param {number} id - The rig id
 * @returns {Object|null} The rig, or null when the kind or the id is unknown
 */
export function getRigInfoFromID(jobType, id) {
  return rigTypeMap[jobType]?.[id] || null;
}

/**
 * The bonuses two fitted rigs give, each axis taking the better of the two slots
 * and counting only the rigs that help every item.
 *
 * @param {number} jobType - The kind of job the slots belong to
 * @param {number} rigSlot1 - First rig slot id
 * @param {number} rigSlot2 - Second rig slot id
 * @returns {{material: number, time: number, cost: number, value: number}}
 */
export function rigSlotBonuses(jobType, rigSlot1, rigSlot2) {
  const rigs = [
    getRigInfoFromID(jobType, rigSlot1),
    getRigInfoFromID(jobType, rigSlot2),
  ];

  const best = { material: 0, time: 0, cost: 0, value: 0 };
  for (const rig of rigs) {
    if (!rig?.appliesToAll) continue;
    for (const axis of Object.keys(best)) {
      best[axis] = Math.max(best[axis], rig[axis] ?? 0);
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
 * being fitted: the same rig, or one that names the other in its `relatedTo`.
 *
 * @param {Object} rig - The rig being chosen
 * @param {number} otherSlotRigID - What the other slot holds
 * @returns {boolean}
 */
export function rigsCompete(rig, otherSlotRigID) {
  if (!rig || rig.id === 0) return false;
  return (
    rig.id === otherSlotRigID ||
    Boolean(rig.relatedTo?.includes(otherSlotRigID))
  );
}
