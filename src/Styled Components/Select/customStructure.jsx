import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { useContext } from "react";
import { ApplicationSettingsContext } from "../../Context/LayoutContext";
import { customStructureMap } from "../../Context/defaultValues";

function CustomStructureSelect({ value, jobType, onChange }) {
  const { applicationSettings } = useContext(ApplicationSettingsContext);
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
        value={value ?? ""}
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
        {value && (
          <MenuItem key="clear" value={null}>
            Clear
          </MenuItem>
        )}
        {applicationSettings[customStructureMap[jobType]].map((entry) => {
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
