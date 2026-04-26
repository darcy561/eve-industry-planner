import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { rigTypeMap } from "../../Context/defaultValues";
import { getRigInfoFromID } from "../../Functions/Helper/getStructureInfo";

/**
 * A select component for choosing rig types based on job type.
 * Displays available rig types for the specified job type with error handling.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.value=0] - Currently selected rig type ID
 * @param {number} [props.jobType=1] - Job type to determine which rigs to show
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the rig info object.
 * @param {Object} [props.error] - Error state object with isError boolean and errorText string
 * @returns {JSX.Element} Rig type select component
 * 
 * @example
 * <RigTypeSelect 
 *   value={selectedRigId}
 *   jobType={1}
 *   onChange={(rig) => setRigType(rig)}
 *   error={{ isError: false, errorText: "" }}
 * />
 */
function RigTypeSelect({
  value = 0,
  jobType = 1,
  onChange,
  error = { isError: false, errorText: "" },
  selectVariant = "standard",
  menuProps = {},
  customFormStyling = {},
  customSelectStyling = {},
  customHelperTextStyling = {},
}) {
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
        ...customFormStyling,
      }}
      error={error.isError}
      fullWidth
    >
      <Select
        id="rig-type-select"
        aria-describedby="rig-type-helper"
        variant={selectVariant}
        size="small"
        value={value}
        error={error.isError}
        MenuProps={menuProps}
        onChange={(e) => {
          if (onChange) {
            onChange(getRigInfoFromID(jobType, e.target.value));
          } else {
            console.error("Rig Type Select is missing an onChange Function");
          }
        }}
        sx={{
          color: error.isError ? "error.main" : "inherit",
          "& .MuiSelect-icon": {
            color: error.isError ? "error.main" : "inherit",
          },
          ...customSelectStyling,
        }}
      >
        {Object.values(rigTypeMap[jobType]).map((entry) => {
          return (
            <MenuItem key={entry.id} value={entry.id}>
              {entry.label}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText
        id="rig-type-helper"
        variant="standard"
        sx={{
          color: error.isError ? "error.main" : "secondary.main",
          ...customHelperTextStyling,
        }}
      >
        {error.isError ? error.errorText : "Rig Type"}
      </FormHelperText>
    </FormControl>
  );
}

export default RigTypeSelect;
