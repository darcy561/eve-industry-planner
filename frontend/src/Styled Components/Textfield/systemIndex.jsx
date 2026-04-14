import { useState } from "react";
import { TextField } from "@mui/material";
import findSystemIndexForJob from "../../Functions/Helper/findSystemIndexValue";

/**
 * A text field component for inputting system index values.
 * Supports three value sources in priority order:
 * 1. Alternative system index value (when useAlternativeSystemIndexValue is true)
 * 2. Predefined system index value (if available for the system and job type)
 * 3. Calculated system index value (from world data)
 * 
 * The field is disabled when not using alternative values, showing read-only calculated/predefined values.
 * When enabled, allows manual input of custom system index values with validation for non-negative numbers.
 * 
 * @param {Object} props - Component props
 * @param {number} props.inputSystemID - EVE Online system ID to calculate index for
 * @param {number} props.jobType - Job type for index calculation (maps to jobTypeMapping)
 * @param {Function} props.onChange - Callback function called on blur. Receives the numeric value.
 * @param {number} [props.alternativeSystemIndexValue=0] - Alternative system index value to use when enabled
 * @param {boolean} [props.useAlternativeSystemIndexValue=false] - Whether to use alternative value instead of calculated/predefined
 * @param {Object} [props.alternativeSystemIndexData={}] - Alternative location for  system index data to pass to the world data lookup
 * @returns {JSX.Element} System index text field component
 * 
 * @example
 * <SystemIndexTextField 
 *   inputSystemID={30000142}
 *   jobType={1}
 *   onChange={(index) => setSystemIndex(index)}
 *   useAlternativeSystemIndexValue={true}
 *   alternativeSystemIndexValue={{
 *      30000142:{
 *        "manufacturing": 0.5,
 *      }
 *    }
 * />
 */
export default function SystemIndexTextField({ inputSystemID, jobType, onChange, alternativeSystemIndexValue = 0, useAlternativeSystemIndexValue = false, alternativeSystemIndexData = {} }) {
    const [inputValue, updateInputValue] = useState(findSystemIndexForJob(inputSystemID, jobType, useAlternativeSystemIndexValue, alternativeSystemIndexValue, alternativeSystemIndexData) * 100);
    const [valueError, setValueError] = useState("");

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

                // Allow empty string for clearing the field
                if (inputValue === '') {
                    updateInputValue('');
                    setValueError('');
                    return;
                }

                // Convert to number and validate range
                const numericValue = parseFloat(inputValue);

                // Check for validation errors
                if (isNaN(numericValue)) {
                    setValueError('Please enter a valid number');
                    return;
                }

                if (numericValue < 0) {
                    setValueError('Value must be at least 0');
                    return;
                }

                if (numericValue > 100) {
                    setValueError('Value must be no more than 100');
                    return;
                }

                // Valid input
                updateInputValue(inputValue);
                setValueError('');
            }}
            onBlur={() => {
                if (onChange && !valueError) {
                    const numericValue = inputValue === '' ? 0 : Number(inputValue);
                    // Save the value divided by 100
                    onChange(numericValue / 100);
                }
            }}
            slotProps={{
                htmlInput: {
                    step: "0.01",
                    min: "0",
                    max: "100",
                }
            }}
        />
    );
}