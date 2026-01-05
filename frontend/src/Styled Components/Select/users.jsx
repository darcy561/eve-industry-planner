import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore";

/**
 * A select component for choosing assigned users/characters.
 * Displays a dropdown with all available users from the user store.
 * Automatically selects the parent user if no specific user is chosen.
 * 
 * @param {Object} props - Component props
 * @param {string} props.value - Currently selected user's character hash
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the character hash.
 * @param {string} [props.formHelperText] - Custom helper text to display below the select
 * @returns {JSX.Element} Assign users select component
 * 
 * @example
 * <AssignUsersSelect 
 *   value={selectedUserHash}
 *   onChange={(hash) => setSelectedUser(hash)}
 *   formHelperText="Choose assigned character"
 * />
 */
function AssignUsersSelect({ value, onChange, formHelperText }) {
  const users = useUsersStore((state) => state.users.userArray);
  const parentUser = useUsersStore((state) =>
    state.users.actions.findParentUser()
  );

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
        {users.map(({ CharacterHash, CharacterName }) => {
          return (
            <MenuItem key={CharacterHash} value={CharacterHash}>
              {CharacterName}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id="users-helper" variant="standard">
        {formHelperText ? formHelperText : "Assigned Character"}
      </FormHelperText>
    </FormControl>
  );
}

export default AssignUsersSelect;
