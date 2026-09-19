import { useState } from "react";

const errorText = "Cannot have the same rig or related rigs in both slots";

/**
 * The two rig slots a structure carries, and the rule that they cannot hold
 * rigs competing for the same purpose.
 *
 * Two rigs conflict when they are the same rig, or when one names the other in
 * its `relatedTo` — a structure fitted with two ore rigs gets the benefit of
 * one, so offering it is a way of recording a structure the reader does not
 * have. A conflicting choice clears that slot and marks it rather than silently
 * keeping the old value, so the reader can see their choice was refused.
 *
 * @param {object} structure - The structure being edited
 * @param {(structure: object) => void} onChange - Called with the structure after a slot moves
 * @returns {{slot1: object, slot2: object}} A field's `error` and `onChange` per slot
 */
export default function useRigSlots(structure, onChange) {
  const [slot1Error, setSlot1Error] = useState(false);
  const [slot2Error, setSlot2Error] = useState(false);

  const choose = (setSlot, setThisError, otherSlotValue) => (selectedEntry) => {
    if (selectedEntry.id === 0) {
      setSlot(0);
      setSlot1Error(false);
      setSlot2Error(false);
    } else if (
      otherSlotValue === selectedEntry.id ||
      selectedEntry.relatedTo?.includes(otherSlotValue)
    ) {
      setSlot(0);
      setThisError(true);
    } else {
      setSlot(selectedEntry.id);
      setSlot1Error(false);
      setSlot2Error(false);
    }
    onChange(structure);
  };

  return {
    slot1: {
      error: { isError: slot1Error, errorText },
      onChange: choose(
        (id) => structure.setRigSlot1(id),
        setSlot1Error,
        structure.rigSlot2,
      ),
    },
    slot2: {
      error: { isError: slot2Error, errorText },
      onChange: choose(
        (id) => structure.setRigSlot2(id),
        setSlot2Error,
        structure.rigSlot1,
      ),
    },
  };
}
