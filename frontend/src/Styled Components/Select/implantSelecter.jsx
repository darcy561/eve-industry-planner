import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { Implants } from "../../Context/defaultValues";
import { getSystemTypeFromID } from "../../Functions/Helper/getStructureInfo";

/**
 * A select component for choosing implants based on job type.
 * Displays available implants for the specified job type from the Implants configuration.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.value=0] - Currently selected implant ID
 * @param {number} [props.jobType=1] - Job type to determine which implants to show
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the implant object.
 * @returns {JSX.Element} Implant select component
 * 
 * @example
 * <ImplantSelect 
 *   value={selectedImplantId}
 *   jobType={1}
 *   onChange={(implant) => setImplant(implant)}
 * />
 */
function ImplantSelect({
  value = 0,
  jobType = 1,
  onChange,
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
      fullWidth
    >
      <Select
        id="implant-type-select"
        aria-describedby="implant-type-helper"
        variant={selectVariant}
        size="small"
        value={value}
        MenuProps={menuProps}
        onChange={(e) => {
          if (onChange) {
            onChange(Implants[jobType][e.target.value]);
          } else {
            console.error(
              "Implant Type Select is missing an onChange Function"
            );
          }
        }}
        sx={customSelectStyling}
      >
        {Object.values(Implants[jobType]).map((entry) => {
          return (
            <MenuItem key={entry.id} value={entry.id}>
              {entry.label}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText
        id="implant-type-helper"
        variant="standard"
        sx={customHelperTextStyling}
      >
        Implant Type
      </FormHelperText>
    </FormControl>
  );
}

export default ImplantSelect;
