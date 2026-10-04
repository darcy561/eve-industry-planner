import { useState } from "react";
import { TextField } from "@mui/material";
import findSystemIndexForJob from "../../Functions/Helper/findSystemIndexValue";
import { useHasChanged } from "../../Hooks/useHasChanged";

/**
 * The index as a percentage, without the noise a hundredth of a decimal leaves
 * behind when a stored share is multiplied back up.
 *
 * @param {number} share
 * @returns {number}
 */
function asPercentage(share) {
  return Math.round(share * 1e8) / 1e6;
}

/**
 * The system index a setup is costed against: the reader's own figure where they
 * state one, else the index the server holds for the system.
 *
 * @param {Object} props - Component props
 * @param {number} props.inputSystemID - The system the index is read for
 * @param {number} props.jobType - The kind of job the index is read for
 * @param {Function} props.onChange - Given the share, on blur
 * @param {number} [props.alternativeSystemIndexValue=0] - The reader's own figure
 * @param {boolean} [props.useAlternativeSystemIndexValue=false] - Whether to use it
 * @param {Object} [props.alternativeSystemIndexData={}] - Indexes to read before the store's
 * @returns {JSX.Element}
 */
export default function SystemIndexTextField({
  inputSystemID,
  jobType,
  onChange,
  alternativeSystemIndexValue = 0,
  useAlternativeSystemIndexValue = false,
  alternativeSystemIndexData = {},
}) {
  const settled = asPercentage(
    findSystemIndexForJob(
      inputSystemID,
      jobType,
      useAlternativeSystemIndexValue,
      alternativeSystemIndexValue,
      alternativeSystemIndexData,
    ),
  );

  const [inputValue, updateInputValue] = useState(settled);
  const [valueError, setValueError] = useState("");

  if (useHasChanged(settled)) {
    updateInputValue(settled);
  }

  return (
    <TextField
      id="system-index-textfield"
      aria-label="system-index-textfield"
      disabled={!useAlternativeSystemIndexValue}
      value={inputValue}
      size="small"
      variant="standard"
      helperText={valueError || "System Index Value (0-100)"}
      error={!!valueError}
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
        const inputValue = e.target.value;

        if (inputValue === "") {
          updateInputValue("");
          setValueError("");
          return;
        }

        const numericValue = parseFloat(inputValue);

        if (isNaN(numericValue)) {
          setValueError("Please enter a valid number");
          return;
        }

        if (numericValue < 0) {
          setValueError("Value must be at least 0");
          return;
        }

        if (numericValue > 100) {
          setValueError("Value must be no more than 100");
          return;
        }

        updateInputValue(inputValue);
        setValueError("");
      }}
      onBlur={() => {
        if (onChange && !valueError) {
          const numericValue = inputValue === "" ? 0 : Number(inputValue);
          onChange(numericValue / 100);
        }
      }}
      slotProps={{
        htmlInput: {
          step: "0.01",
          min: "0",
          max: "100",
        },
      }}
    />
  );
}
