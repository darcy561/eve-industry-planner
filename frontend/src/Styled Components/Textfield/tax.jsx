import { useState } from "react";
import { TextField } from "@mui/material";
import { useHasChanged } from "../../Hooks/useHasChanged";

function formatTaxFieldInitial(initialState) {
  const n = coercePercentToNumber(initialState);
  return String(n);
}

function coercePercentToNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * A text field component for inputting tax percentages.
 * Validates input to ensure only non-negative numbers are accepted.
 * Rounds the value to 2 decimal places on blur.
 *
 * @param {Object} props - Component props
 * @param {string} [props.id] - Given where more than one of these is on the page
 *   at once, so each still labels its own control
 * @param {number} [props.max] - The highest rate this field will take. Given
 *   where a server rule caps the figure, so a reader cannot type a number the
 *   save is going to be refused for
 * @param {number} [props.initialState] - Initial value for the text field
 * @param {Function} props.onBlur - Callback function called on blur. Receives the rounded percentage value.
 * @returns {JSX.Element} Tax percentage text field component
 */
function TaxPercentageTextField({
  id = "tax-percentage-textfield",
  initialState,
  max,
  onBlur,
  variant = "standard",
  label,
  helperText = "Tax Percentage",
  sx: sxProp,
}) {
  const [inputValue, updateInputValue] = useState(() =>
    formatTaxFieldInitial(initialState),
  );
  // The field is reused as the reader moves between structures, so it shows the
  // rate of the one they are looking at rather than what they last typed
  // against another.
  if (useHasChanged(initialState)) {
    updateInputValue(formatTaxFieldInitial(initialState));
  }

  return (
    <TextField
      id={id}
      aria-label="job-percentage-textfield"
      value={inputValue}
      size="small"
      variant={variant}
      label={label}
      helperText={helperText}
      type="number"
      sx={[
        {
          "& .MuiFormHelperText-root": {
            color: (theme) => theme.palette.secondary.main,
          },
          "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
            {
              display: "none",
            },
        },
        ...(sxProp ? [sxProp] : []),
      ]}
      onChange={(e) => {
        const value = e.target.value;
        if (!isNaN(value) && Number(value) >= 0 && withinMax(value, max)) {
          updateInputValue(value);
        }
      }}
      onBlur={(e) => {
        if (onBlur) {
          let valueToPass =
            Math.round(
              (coercePercentToNumber(e.target.value) + Number.EPSILON) * 100,
            ) / 100;
          if (isNaN(valueToPass) || valueToPass < 0) {
            valueToPass = 0;
          }
          if (max !== undefined && valueToPass > max) {
            valueToPass = max;
          }
          onBlur(valueToPass);
        } else {
          console.error("Tax Percentage is missing an onChange Function");
        }
      }}
    />
  );
}

/** An empty field is still being typed into, so it is not over any ceiling yet. */
function withinMax(value, max) {
  return max === undefined || value === "" || Number(value) <= max;
}

export default TaxPercentageTextField;
