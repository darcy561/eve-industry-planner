import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { useContext, useMemo } from "react";
import { UsersContext } from "../../Context/AuthContext";
import { useHelperFunction } from "../../Hooks/GeneralHooks/useHelperFunctions";

function AssignUsersSelect({ value, onChange }) {
  const { users } = useContext(UsersContext);
  const { findParentUser } = useHelperFunction();
  const parentUser = findParentUser();

  const selectedUserHash = useMemo(() => {
    return (
      users?.find((i) => i.CharacterHash === value)?.CharacterHash ??
      parentUser?.CharacterHash ??
      ""
    );
  }, [users, value, parentUser]);

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
        id="users-select"
        aria-describedby="users-helper"
        variant="standard"
        size="small"
        value={selectedUserHash}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error("Users Select is missing an onChange Function");
          }
        }}
      >
        {users.map((entry) => {
          return (
            <MenuItem key={entry.CharacterHash} value={entry.CharacterHash}>
              {entry.CharacterName}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id="users-helper" variant="standard">
        Assigned Character
      </FormHelperText>
    </FormControl>
  );
}

export default AssignUsersSelect;
