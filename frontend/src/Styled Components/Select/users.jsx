import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore";

/**
 * The account's characters to choose from, showing the main character until one is chosen.
 *
 * @param {Object} props
 * @param {string} props.value - The chosen character's `CharacterHash`
 * @param {Function} props.onChange - Receives the chosen character's hash
 * @param {string} [props.formHelperText] - The line beneath the select
 * @param {"standard"|"outlined"} [props.selectVariant]
 * @param {object} [props.menuProps]
 * @param {object} [props.customFormStyling]
 * @param {object} [props.customHelperTextStyling]
 */
function AssignUsersSelect({
  value,
  onChange,
  formHelperText,
  selectVariant = "standard",
  menuProps = {},
  customFormStyling = {},
  customHelperTextStyling = {},
}) {
  const characters = useUsersStore((state) => state.account.characters);
  const mainCharacterHash = useUsersStore(
    (state) => state.account.mainCharacterHash,
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
        ...customFormStyling,
      }}
      fullWidth
    >
      <Select
        id="characters-select"
        aria-describedby="characters-helper"
        variant={selectVariant}
        size="small"
        MenuProps={menuProps}
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
      <FormHelperText
        id="characters-helper"
        variant="standard"
        sx={customHelperTextStyling}
      >
        {formHelperText ? formHelperText : "Assigned Character"}
      </FormHelperText>
    </FormControl>
  );
}

export default AssignUsersSelect;
