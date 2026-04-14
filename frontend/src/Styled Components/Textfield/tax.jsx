import { useState, useEffect } from "react";
import { TextField } from "@mui/material";

function formatTaxFieldInitial(initialState) {
  const n = coercePercentToNumber(initialState);
  return String(n);
}

function coercePercentToNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  const n =
    typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * A text field component for inputting tax percentages.
 * Validates input to ensure only non-negative numbers are accepted.
 * Rounds the value to 2 decimal places on blur.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.initialState] - Initial value for the text field
 * @param {Function} props.onBlur - Callback function called on blur. Receives the rounded percentage value.
 * @returns {JSX.Element} Tax percentage text field component
 * 
 * @example
 * <TaxPercentageTextField 
 *   initialState={0}
 *   onBlur={(tax) => setTaxPercentage(tax)}
 * />
 */
function TaxPercentageTextField({ initialState, onBlur }) {
  const [inputValue, updateInputValue] = useState(() =>
    formatTaxFieldInitial(initialState)
  );

  useEffect(() => {
    updateInputValue(formatTaxFieldInitial(initialState));
  }, [initialState]);

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
            Math.round(
              (coercePercentToNumber(e.target.value) + Number.EPSILON) * 100
            ) / 100;
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
