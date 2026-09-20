import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Radio,
  RadioGroup,
} from "@mui/material";

import { structureKinds } from "../../../../Context/defaultValues";

/**
 * The kinds a reader can save, in the order they are offered.
 *
 * Named here rather than derived from `structureKinds` so the wording and the
 * order are a choice: a reader meets the places they build in before the place
 * they sell at.
 */
const KINDS = [
  { value: structureKinds.manufacturing, label: "Manufacturing" },
  { value: structureKinds.reaction, label: "Reaction" },
  { value: structureKinds.invention, label: "Invention" },
  { value: structureKinds.reprocessing, label: "Reprocessing" },
  { value: structureKinds.market, label: "Market" },
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
    <Grid container>
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
    </Grid>
  );
}

export default StructureKindSelection;
