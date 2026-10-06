import { useMemo } from "react";
import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";

/**
 * The reader's saved structures of one kind to choose from, with Clear once one is chosen and a
 * marker for a chosen structure that no longer exists.
 *
 * @param {Object} props
 * @param {string} props.value - The chosen structure's id
 * @param {number} props.jobType - Which kind of structure is offered
 * @param {Function} props.onChange - Receives the chosen structure's id
 * @param {"standard"|"outlined"} [props.selectVariant]
 * @param {object} [props.menuProps]
 * @param {object} [props.customFormStyling]
 * @param {object} [props.customHelperTextStyling]
 */
function CustomStructureSelect({
  value,
  jobType,
  onChange,
  selectVariant = "standard",
  menuProps = {},
  customFormStyling = {},
  customHelperTextStyling = {},
}) {
  const allStructures = useUsersStore(
    (state) => state.applicationSettings.customStructures,
  );
  const structures = useMemo(
    () =>
      (allStructures ?? []).filter(
        (structure) => structure.jobType === jobType,
      ),
    [allStructures, jobType],
  );

  const hasSelectedValue = Boolean(value);
  const validValue = structures.some((structure) => structure.id === value)
    ? value
    : "";
  const isOrphanedReference = hasSelectedValue && !validValue;

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
        id="custom-structure-select"
        aria-describedby="custom-structure-helper"
        variant={selectVariant}
        size="small"
        MenuProps={menuProps}
        value={validValue}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error(
              "Custom Structure Select is missing an onChange Function",
            );
          }
        }}
      >
        {hasSelectedValue && (
          <MenuItem key="clear" value="">
            Clear
          </MenuItem>
        )}
        {isOrphanedReference && (
          <MenuItem key="missing" value={value} disabled>
            (missing structure)
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
      <FormHelperText
        id="custom-structure-helper"
        variant="standard"
        sx={customHelperTextStyling}
      >
        Custom Structure Used
      </FormHelperText>
    </FormControl>
  );
}

export default CustomStructureSelect;
