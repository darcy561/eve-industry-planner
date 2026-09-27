import { useState } from "react";

import { updateStructure } from "../Functions/Custom Structures/customStructure";

const errorText = "Cannot have the same rig or related rigs in both slots";

/**
 * The two rig slots a structure carries, and the rule that they cannot hold
 * rigs competing for the same purpose.
 *
 * @param {object} structure - The structure being edited
 * @param {(structure: object) => void} onChange - Called with the structure a slot moved on
 * @returns {{slot1: object, slot2: object}} A field's `error` and `onChange` per slot
 */
export default function useRigSlots(structure, onChange) {
  const [slot1Error, setSlot1Error] = useState(false);
  const [slot2Error, setSlot2Error] = useState(false);

  const choose = (slot, setThisError, otherSlotValue) => (selectedEntry) => {
    let chosen = selectedEntry.id;

    if (selectedEntry.id === 0) {
      chosen = 0;
      setSlot1Error(false);
      setSlot2Error(false);
    } else if (
      otherSlotValue === selectedEntry.id ||
      selectedEntry.relatedTo?.includes(otherSlotValue)
    ) {
      chosen = 0;
      setThisError(true);
    } else {
      setSlot1Error(false);
      setSlot2Error(false);
    }

    onChange(updateStructure(structure, { [slot]: chosen }));
  };

  return {
    slot1: {
      error: { isError: slot1Error, errorText },
      onChange: choose("rigSlot1", setSlot1Error, structure.rigSlot2),
    },
    slot2: {
      error: { isError: slot2Error, errorText },
      onChange: choose("rigSlot2", setSlot2Error, structure.rigSlot1),
    },
  };
}
