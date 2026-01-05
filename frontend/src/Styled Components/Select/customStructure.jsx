import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { customStructureMap } from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";

/**
 * A select component for choosing custom structures based on job type.
 * Displays structures available for the specified job type from user settings.
 * Includes a "Clear" option when a value is selected.
 * 
 * @param {Object} props - Component props
 * @param {string} props.value - Currently selected structure ID
 * @param {number} props.jobType - Job type to determine which structures to show
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the structure ID.
 * @returns {JSX.Element} Custom structure select component
 * 
 * @example
 * <CustomStructureSelect 
 *   value={selectedStructureId}
 *   jobType={1}
 *   onChange={(structureId) => setStructure(structureId)}
 * />
 */
function CustomStructureSelect({ value, jobType, onChange }) {
  const structures = useUsersStore(
    (state) => state.applicationSettings[customStructureMap[jobType]]
  );
  
  // Validate that the current value exists in the available options
  const validValue = structures.some(structure => structure.id === value) ? value : "";
  
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
        id="custom-structure-select"
        aria-describedby="custom-structure-helper"
        variant="standard"
        size="small"
        value={validValue}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error(
              "Custom Structure Select is missing an onChange Function"
            );
          }
        }}
      >
        {validValue && (
          <MenuItem key="clear" value={null}>
            Clear
          </MenuItem>
        )}
        {structures.map((entry) => {
          return (
            <MenuItem key={entry.id} value={entry.id}>
              {entry.name}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id="custom-structure-helper" variant="standard">
        Custom Structure Used
      </FormHelperText>
    </FormControl>
  );
}

export default CustomStructureSelect;
