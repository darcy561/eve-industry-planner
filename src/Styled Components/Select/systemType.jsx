import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { systemTypeMap } from "../../Context/defaultValues";
import { getSystemTypeFromID } from "../../Functions/Helper/getStructureInfo";

function SystemTypeSelect({ value = 0, jobType = 1, onChange }) {
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
        id="system-type-select"
        aria-describedby="system-type-helper"
        variant="standard"
        size="small"
        value={value}
        onChange={(e) => {
          if (onChange) {
            onChange(getSystemTypeFromID(jobType, e.target.value));
          } else {
            console.error("System Type Select is missing an onChange Function");
          }
        }}
      >
        {Object.values(systemTypeMap[jobType]).map((entry) => {
          return (
            <MenuItem key={entry.id} value={entry.id}>
              {entry.label}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id="system-type-helper" variant="standard">
        System Type
      </FormHelperText>
    </FormControl>
  );
}

export default SystemTypeSelect;
