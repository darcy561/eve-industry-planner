import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { blueprintOptions } from "../../Context/defaultValues";

/**
 * A select component for choosing time efficiency levels.
 * Displays time efficiency options from blueprint configuration.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.value=0] - Currently selected time efficiency value
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the efficiency value.
 * @returns {JSX.Element} Time efficiency select component
 * 
 * @example
 * <TimeEfficiencySelect 
 *   value={10}
 *   onChange={(efficiency) => setTimeEfficiency(efficiency)}
 * />
 */
function TimeEfficiencySelect({ value = 0, onChange }) {
  return (
    <FormControl
      sx={{
        "& .MuiFormHelperText-root": {
          color: (theme) => theme.palette.secondary.main,
        },
        "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
          {
            display: "none",
          },
      }}
      fullWidth
    >
      <Select
        id="time-efficiency-select"
        aria-describedby="time-efficiency-helper"
        variant="standard"
        size="small"
        value={value}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error(
              "Time Efficiency Select is missing an onChange Function"
            );
          }
        }}
      >
        {blueprintOptions.te.map((entry) => {
          return (
            <MenuItem key={entry.label} value={entry.value}>
              {entry.label}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id="time-efficiency-helper" variant="standard">
        Time Efficiency
      </FormHelperText>
    </FormControl>
  );
}

export default TimeEfficiencySelect;
