import { useState } from "react";
import { TextField } from "@mui/material";

function JobSlotsTextField({ initialState, onChange }) {
  const [inputValue, updateInputValue] = useState(initialState ?? "0");

  return (
    <TextField
      id="job-slots-textfield"
      aria-label="job-slots-textfield"
      value={inputValue}
      size="small"
      variant="standard"
      helperText="Job Slots"
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
          console.error("Job Slots is missing an onChange Function");
        }
      }}
    />
  );
}

export default JobSlotsTextField;
