import { getRigInfoFromID } from "./getStructureInfo";

/**
 * The bonuses two fitted rigs give, taken per axis.
 *
 * A structure carries two rig slots, and the rigs in them act on different
 * things: one may cut material waste while the other cuts build time. So the
 * slots are not ranked against each other — each axis takes the better of the
 * two independently, and a slot contributes to every axis its rig moves.
 *
 * That is why this returns an object rather than a number. A caller reads the
 * axis it prices with, and a rig that does nothing for that axis reads as zero
 * rather than as the absence of a rig.
 *
 * Only rigs that help **every** item are counted. A real rig helps one family of
 * them, and which family a stored rig applied to was never recorded, so every
 * rig that can be fitted today carries `appliesToAll`. A rig that names a family
 * instead is skipped here rather than counted for items it does not help —
 * reading it needs to know what is being built, which this does not.
 *
 * @param {number} jobType - The kind of job the slots belong to
 * @param {number} rigSlot1 - First rig slot id
 * @param {number} rigSlot2 - Second rig slot id
 * @returns {{material: number, time: number, cost: number, value: number}}
 */
export default function rigSlotBonuses(jobType, rigSlot1, rigSlot2) {
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
