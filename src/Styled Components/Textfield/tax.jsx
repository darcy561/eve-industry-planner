import { useState } from "react";
import { TextField } from "@mui/material";

function TaxPercentageTextField({ initialState, onBlur }) {
  const [inputValue, updateInputValue] = useState(initialState ?? "0");

  return (
    <TextField
      id="tax-percentage-textfield"
      aria-label="job-percentage-textfield"
      value={inputValue}
      size="small"
      variant="standard"
      helperText="Tax Percentage"
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
      onBlur={(e) => {
        if (onBlur) {
          let valueToPass =
            Math.round((Number(e.target.value) + Number.EPSILON) * 100) / 100;
          if (isNaN(valueToPass) || valueToPass < 0) {
            valueToPass = 0;
          }
          onBlur(valueToPass);
        } else {
          console.error("Tax Percentage is missing an onChange Function");
        }
      }}
    />
  );
}

export default TaxPercentageTextField;
