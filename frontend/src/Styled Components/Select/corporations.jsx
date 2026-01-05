import { useMemo } from "react";
import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";

/**
 * A select component for choosing corporations.
 * Displays a dropdown with all available corporations from the user store.
 * 
 * @param {Object} props - Component props
 * @param {string} props.value - Currently selected corporation ID
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the corporation ID.
 * @param {string} [props.formHelperText] - Custom helper text to display below the select
 * @returns {JSX.Element} Corporation select component
 * 
 * @example
 * <CorporationSelect 
 *   value={selectedCorpId}
 *   onChange={(corpId) => setSelectedCorp(corpId)}
 *   formHelperText="Choose corporation"
 * />
 */
export default function CorporationSelect({ value, onChange, formHelperText }) {
  const corporationObjects = useUsersStore(
    (state) => state.users.corporationObjects
  );

  const selectedCorporation = useMemo(() => {
    return corporationObjects[value]?.corporation_id ?? "";
  }, [corporationObjects, value]);

  return (
    <FormControl
      sx={{
        "& .MuiFormHelperText-root": {
          color: (theme) => theme.palette.secondary.main,
        },
      }}
      fullWidth
    >
      <Select
        id="corporation-select"
        aria-describedby="corporation-helper"
        variant="standard"
        size="small"
        value={selectedCorporation}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error("Corporation Select is missing an onChange Function");
          }
        }}
      >
        {Object.values(corporationObjects).map(
          ({ corporation_id, corporationName }) => {
            return (
              <MenuItem key={corporation_id} value={corporation_id}>
                {corporationName}
              </MenuItem>
            );
          }
        )}
      </Select>
      <FormHelperText id="corporation-helper" variant="standard">
        {formHelperText ? formHelperText : "Corporation"}
      </FormHelperText>
    </FormControl>
  );
}
