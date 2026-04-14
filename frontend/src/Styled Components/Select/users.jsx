import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore";

/**
 * A select component for choosing which character is assigned (from `account.characters`).
 * Automatically selects the main character if no specific character is chosen.
 *
 * @param {Object} props - Component props
 * @param {string} props.value - Selected character hash (`CharacterHash`)
 * @param {Function} props.onChange - Called with the selected character hash
 * @param {string} [props.formHelperText] - Custom helper text below the select
 * @returns {JSX.Element} Character assignment select
 * 
 * @example
 * <AssignUsersSelect 
 *   value={selectedUserHash}
 *   onChange={(hash) => setSelectedUser(hash)}
 *   formHelperText="Choose assigned character"
 * />
 */
function AssignUsersSelect({ value, onChange, formHelperText }) {
  const characters = useUsersStore((state) => state.account.characters);
  const mainCharacterHash = useUsersStore(
    (state) => state.account.mainCharacterHash
  );

  const selectedUserHash = useMemo(() => {
    return (
      characters?.find((i) => i.CharacterHash === value)?.CharacterHash ??
      mainCharacterHash ??
      ""
    );
  }, [characters, value, mainCharacterHash]);

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
        id="characters-select"
        aria-describedby="characters-helper"
        variant="standard"
        size="small"
        value={selectedUserHash}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error("Character select is missing an onChange handler");
          }
        }}
      >
        {characters.map(({ CharacterHash, CharacterName }) => {
          return (
            <MenuItem key={CharacterHash} value={CharacterHash}>
              {CharacterName}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id="characters-helper" variant="standard">
        {formHelperText ? formHelperText : "Assigned Character"}
      </FormHelperText>
    </FormControl>
  );
}

export default AssignUsersSelect;
