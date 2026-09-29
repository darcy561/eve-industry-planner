import { useState } from "react";

import { rigsCompete } from "../Functions/Industry Facilities/rigs";

const errorText = "Cannot have the same rig or related rigs in both slots";

/**
 * The two rig slots a structure carries, refusing a rig that competes with the one
 * in the other slot and marking the slot it refused.
 *
 * @param {{rigSlot1: number, rigSlot2: number}} slots - What is fitted now
 * @param {(slot: string, rigID: number, selectedEntry: object) => void} onChoose - Applies a slot's new rig
 * @param {number} [jobType] - The kind of job, which names the rigs in the slots
 * @returns {{slot1: object, slot2: object}} A field's `error` and `onChange` per slot
 */
export default function useRigSlots(slots, onChoose, jobType) {
  const [slot1Error, setSlot1Error] = useState(false);
  const [slot2Error, setSlot2Error] = useState(false);

  const choose = (slot, setThisError, otherSlotValue) => (selectedEntry) => {
    let chosen = selectedEntry.id;

    if (selectedEntry.id === 0) {
      chosen = 0;
      setSlot1Error(false);
      setSlot2Error(false);
    } else if (rigsCompete(selectedEntry, otherSlotValue, jobType)) {
      chosen = 0;
      setThisError(true);
    } else {
      setSlot1Error(false);
      setSlot2Error(false);
    }

    onChoose(slot, chosen, selectedEntry);
  };

  return {
    slot1: {
      error: { isError: slot1Error, errorText },
      onChange: choose("rigSlot1", setSlot1Error, slots.rigSlot2),
    },
    slot2: {
      error: { isError: slot2Error, errorText },
      onChange: choose("rigSlot2", setSlot2Error, slots.rigSlot1),
    },
  };
}
