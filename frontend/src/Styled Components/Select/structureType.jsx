import {
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
  Tooltip,
} from "@mui/material";
import {
  structureTypeMap,
  structureTypeTooltip,
} from "../../Context/defaultValues";
import { getStructureInfoFromID } from "../../Functions/Helper/getStructureInfo";

/**
 * A select component for choosing structure types based on job type.
 * Displays available structure types for the specified job type with tooltip.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.value=0] - Currently selected structure type ID
 * @param {number} [props.jobType=1] - Job type to determine which structures to show
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the structure info object.
 * @returns {JSX.Element} Structure type select component
 * 
 * @example
 * <StructureTypeSelect 
 *   value={selectedStructureId}
 *   jobType={1}
 *   onChange={(structure) => setStructureType(structure)}
 * />
 */
function StructureTypeSelect({
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
    <Tooltip title={structureTypeTooltip} arrow placement="top">
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
          id="structure-type-select"
          aria-describedby="structure-type-helper"
          variant={selectVariant}
          size="small"
          value={value}
          MenuProps={menuProps}
          onChange={(e) => {
            if (onChange) {
              onChange(getStructureInfoFromID(jobType, e.target.value));
            } else {
              console.error(
                "Structure Type Select is missing an onChange Function"
              );
            }
          }}
          sx={customSelectStyling}
        >
          {Object.values(structureTypeMap[jobType]).map((entry) => {
            return (
              <MenuItem key={entry.id} value={entry.id}>
                {entry.label}
              </MenuItem>
            );
          })}
        </Select>
        <FormHelperText
          id="structure-type-helper"
          variant="standard"
          sx={customHelperTextStyling}
        >
          Structure Type
        </FormHelperText>
      </FormControl>
    </Tooltip>
  );
}

export default StructureTypeSelect;
