import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { blueprintOptions } from "../../Context/defaultValues";

/**
 * A select component for choosing material efficiency levels.
 * Displays material efficiency options from blueprint configuration.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.value=0] - Currently selected material efficiency value
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the efficiency value.
 * @returns {JSX.Element} Material efficiency select component
 * 
 * @example
 * <MaterialEfficiencySelect 
 *   value={10}
 *   onChange={(efficiency) => setMaterialEfficiency(efficiency)}
 * />
 */
function MaterialEfficiencySelect({ value = 0, onChange }) {
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
        id="material-efficiency-select"
        aria-describedby="material-efficiency-helper"
        variant="standard"
        size="small"
        value={value}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error(
              "Material Efficiency Select is missing an onChange Function"
            );
          }
        }}
      >
        {blueprintOptions.me.map((entry) => {
          return (
            <MenuItem key={entry.label} value={entry.value}>
              {entry.label}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id="material-efficiency-helper" variant="standard">
        Material Efficiency
      </FormHelperText>
    </FormControl>
  );
}

export default MaterialEfficiencySelect;
