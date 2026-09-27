import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
} from "@mui/material";

import { structureKinds } from "../../../../Context/defaultValues";

/**
 * The kinds a reader can save here, in the order they are offered.
 *
 * Named rather than derived from `structureKinds`, which is the wider set the
 * server also knows: the market kind is among those and is deliberately not
 * offered, because a market is saved as a market on the Market Locations tab.
 */
const KINDS = [
  { value: structureKinds.manufacturing, label: "Manufacturing" },
  { value: structureKinds.reaction, label: "Reaction" },
  { value: structureKinds.invention, label: "Invention" },
  { value: structureKinds.reprocessing, label: "Reprocessing" },
];

/**
 * Choosing what kind of structure is being saved.
 *
 * @param {{
 *   selectedJobType: number,
 *   setSelectedJobType: (jobType: number) => void,
 *   setInitialSelectionMade: (made: boolean) => void,
 * }} props
 */
function StructureKindSelection({
  selectedJobType,
  setSelectedJobType,
  setInitialSelectionMade,
}) {
  function handleChange(event) {
    setSelectedJobType(Number(event.target.value));
    setInitialSelectionMade(true);
  }

  return (
    <FormControl>
      <FormLabel>Choose what you are saving:</FormLabel>
      <RadioGroup
        row
        name="exclusive-radio-buttons"
        value={selectedJobType}
        onChange={handleChange}
      >
        {KINDS.map(({ value, label }) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio />}
            label={label}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}

export default StructureKindSelection;
