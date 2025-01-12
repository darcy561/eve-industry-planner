import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { rigTypeMap } from "../../Context/defaultValues";
import { getRigInfoFromID } from "../../Functions/Helper/getStructureInfo";

function RigTypeSelect({ value = 0, jobType = 1, onChange }) {
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
        id="rig-type-select"
        aria-describedby="rig-type-helper"
        variant="standard"
        size="small"
        value={value}
        onChange={(e) => {
          if (onChange) {
            onChange(getRigInfoFromID(jobType, e.target.value));
          } else {
            console.error("Rig Type Select is missing an onChange Function");
          }
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
      <FormHelperText id="rig-type-helper" variant="standard">
        Rig Type
      </FormHelperText>
    </FormControl>
  );
}

export default RigTypeSelect;
