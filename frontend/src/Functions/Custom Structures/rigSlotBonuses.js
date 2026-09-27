import { getRigInfoFromID } from "./getStructureInfo";

/**
 * The bonuses two fitted rigs give, each axis taking the better of the two slots
 * and counting only the rigs that help every item.
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
