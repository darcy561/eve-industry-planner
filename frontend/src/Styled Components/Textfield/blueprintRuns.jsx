import { useState } from "react";
import { TextField } from "@mui/material";

/**
 * A text field component for inputting blueprint run quantities.
 * Validates input to ensure only non-negative numbers are accepted.
 * Automatically sets minimum value to 1 on blur if invalid input is provided.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.initialState] - Initial value for the text field
 * @param {Function} props.onChange - Callback function called on blur. Receives the validated number value.
 * @returns {JSX.Element} Blueprint runs text field component
 * 
 * @example
 * <BlueprintRunsTextField 
 *   initialState={1}
 *   onChange={(runs) => setBlueprintRuns(runs)}
 * />
 */
function BlueprintRunsTextField({ initialState, onChange }) {
  const [inputValue, updateInputValue] = useState(initialState ?? "0");

  return (
    <TextField
      id="blueprint-runs-textfield"
      aria-label="blueprint-runs-textfield"
      value={inputValue}
      size="small"
      variant="standard"
      helperText="Blueprint Runs"
      type="number"
      sx={{
        "& .MuiFormHelperText-root": {
          color: (theme) => theme.palette.secondary.main,
        },
        "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
          {
            display: "none",
          },
      }}
      onChange={(e) => {
        const value = e.target.value;
        if (!isNaN(value) && Number(value) >= 0) {
          updateInputValue(value);
        }
      }}
      onBlur={() => {
        if (onChange) {
          let valueToPass = Number(inputValue);
          if (isNaN(valueToPass) || valueToPass <= 0) {
            valueToPass = 1;
          }
          onChange(valueToPass);
        } else {
          console.error("Blueprint Runs is missing an onChange Function");
        }
      }}
    />
  );
}

export default BlueprintRunsTextField;
