import { useMemo, useRef } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { FormControl, FormHelperText, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import {
  appShellAutocompleteListboxSx,
  appShellOutlinedFormControl,
  appShellSelectMenuPaperSx,
} from "../../Context/appShell";
import VirtualisedListbox from "./virtualisedListbox";
import { getRigInfoFromID } from "../../Functions/Industry Facilities/rigs";
import { rigOptionsFor } from "../../Functions/Industry Facilities/industryBonuses";
import { jobTypeMapping, rigTypeMap } from "../../Context/defaultValues";

/**
 * The rig a reader may fit to one of a structure's two slots, offering the rigs
 * that fit its size grouped by the items they help.
 *
 * @param {Object} props - Component props
 * @param {string} [props.id] - Given where more than one of these is on the page
 * @param {number} [props.value=0] - The rig fitted now
 * @param {number} props.jobType - The kind of job the structure runs
 * @param {number} [props.rigSize] - The rig size the structure takes
 * @param {Object} [props.catalogue] - The published bonus catalogue
 * @param {Function} props.onChange - Given the chosen rig
 * @param {Object} [props.error] - `isError` and `errorText`
 * @param {string} [props.label] - The field's own label
 * @param {boolean} [props.disabled=false] - Given when the place fixes the slot
 * @param {boolean} [props.appShellStyled=false] - Outlined field and app-shell dropdown
 * @returns {JSX.Element}
 */
function VirtualisedRigSearch({
  id = "rig-type-select",
  value = 0,
  jobType,
  rigSize,
  catalogue,
  onChange,
  error = { isError: false, errorText: "" },
  label = "Rig",
  disabled = false,
  appShellStyled = false,
}) {
  const theme = useTheme();
  const virtualizerControlRef = useRef(null);

  const options = useMemo(
    () =>
      rigOptionsFor(
        catalogue,
        jobTypeMapping[jobType],
        rigSize,
        value ? getRigInfoFromID(jobType, value) : null,
      ),
    [catalogue, jobType, rigSize, value],
  );

  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <FormControl
      fullWidth
      error={error.isError}
      sx={
        appShellStyled
          ? (t) => appShellOutlinedFormControl(t)
          : {
              "& .MuiFormHelperText-root": {
                color: (t) => t.palette.secondary.main,
              },
            }
      }
    >
      <Autocomplete
        id={id}
        disabled={disabled}
        value={selected}
        options={options}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, chosen) => option.id === chosen.id}
        disableClearable
        onChange={(event, chosen) => {
          if (!chosen || !onChange) return;
          onChange(
            getRigInfoFromID(jobType, chosen.id) ?? rigTypeMap[jobType][0],
          );
        }}
        slotProps={{
          listbox: {
            component: VirtualisedListbox,
            virtualizerControlRef,
            ...(appShellStyled
              ? { sx: appShellAutocompleteListboxSx(theme) }
              : {}),
          },
          ...(appShellStyled
            ? { paper: { sx: appShellSelectMenuPaperSx(theme) } }
            : {}),
        }}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props;
          return (
            <li key={key} {...optionProps}>
              <Stack>
                <Typography variant="body2">{option.label}</Typography>
                {option.helps ? (
                  <Typography variant="caption" color="text.secondary">
                    {option.helps}
                  </Typography>
                ) : null}
              </Stack>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            fullWidth
            label={label}
            margin="none"
            variant={appShellStyled ? "outlined" : "standard"}
            size="small"
            error={error.isError}
          />
        )}
      />
      <FormHelperText>
        {error.isError ? error.errorText : "Rig Type"}
      </FormHelperText>
    </FormControl>
  );
}

export default VirtualisedRigSearch;
