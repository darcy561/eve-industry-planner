import {
  Box,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Radio,
  RadioGroup,
} from "@mui/material";
import { jobTypes } from "../../../../Context/defaultValues";

function JobTypeSelection_CustomStructures({
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
        <FormLabel>Choose Structure Type To Begin:</FormLabel>
        <RadioGroup
          row
          name="exclusive-radio-buttons"
          value={selectedJobType}
          onChange={handleChange}
        >
          <FormControlLabel
            value={jobTypes.manufacturing}
            control={<Radio />}
            label="Manufacturing"
          />
          <FormControlLabel
            value={jobTypes.reaction}
            control={<Radio />}
            label="Reaction"
          />
        </RadioGroup>
      </FormControl>
    </Grid>
  );
}

export default JobTypeSelection_CustomStructures;
