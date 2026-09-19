import { getRigInfoFromID } from "./getStructureInfo";

/**
 * How a setup's two rig slots read on a card.
 *
 * Names both fitted rigs, or the one that is fitted, or "None" when neither is.
 * An empty slot is left unsaid rather than printed as "None" beside a rig, so a
 * structure carrying one rig reads as carrying one rig.
 *
 * @param {number} jobType - The kind of job the slots belong to
 * @param {number} rigSlot1 - First rig slot id
 * @param {number} rigSlot2 - Second rig slot id
 * @returns {string}
 */
export default function rigSlotLabel(jobType, rigSlot1, rigSlot2) {
  const labels = [rigSlot1, rigSlot2]
    .map((id) => getRigInfoFromID(jobType, id))
    .filter((rig) => rig && rig.id !== 0)
    .map((rig) => rig.label);

  if (labels.length === 0) {
    return getRigInfoFromID(jobType, 0)?.label ?? "None";
  }
  return labels.join(", ");
}
