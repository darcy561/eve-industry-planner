import { useMemo, useRef, useState } from "react";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { FormControl, FormHelperText } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { systemStructureRequirements } from "../../Context/defaultValues";
import { useSolarSystemNames } from "../../Hooks/useSolarSystemNames";
import GLOBAL_CONFIG from "../../global-config-app";
import {
  appShellAutocompleteListboxSx,
  appShellHelperTextSx,
  appShellOutlinedFormControl,
  appShellSelectMenuPaperSx,
  appShellTextFieldOutlinedSx,
} from "../../Context/appShell";
import VirtualisedListbox from "./virtualisedListbox";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

const defaultAutocompleteFilter = createFilterOptions();

/**
 * A virtualized autocomplete component for searching EVE Online solar systems.
 * Uses TanStack Virtual for performance and filters systems based on job type requirements.
 *
 * @param {Object} props - Component props
 * @param {number} [props.selectedValue=0] - Currently selected system ID
 * @param {Function} props.updateSelectedValue - Callback function called when a system is selected. Receives the system ID.
 * @param {number|null} [props.jobType=null] - Job type to filter systems by. If null, shows all systems.
 * @param {boolean} [props.appShellStyled=false] - Use outlined field + app-shell dropdown styling.
 * @returns {JSX.Element} Virtualized system search autocomplete component
 */
function VirtualisedSystemSearch({
  selectedValue = 0,
  updateSelectedValue,
  jobType = null,
  appShellStyled = false,
}) {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("Error");
  const virtualizerControlRef = useRef(null);
  const filteredOptionsSnapshotRef = useRef([]);

  const filterOptions = useMemo(
    () => (options, params) => {
      const filtered = defaultAutocompleteFilter(options, params);
      filteredOptionsSnapshotRef.current = filtered;
      return filtered;
    },
    [],
  );

  const handleHighlightChange = (event, option) => {
    if (option == null) return;
    const index = filteredOptionsSnapshotRef.current.findIndex(
      (o) => o.id === option.id,
    );
    if (index < 0) return;
    requestAnimationFrame(() => {
      virtualizerControlRef.current?.scrollToIndex?.(index);
    });
  };

  const systemNames = useSolarSystemNames();

  const autocompleteOptions = useMemo(() => {
    const options = [];
    for (const [systemID, name] of Object.entries(systemNames)) {
      const id = Number(systemID);
      const availableJobTypes =
        systemStructureRequirements[id]?.allowedJobTypes || [];
      if (
        jobType === null ||
        availableJobTypes.length === 0 ||
        availableJobTypes.includes(jobType)
      ) {
        options.push({ id, name });
      }
    }
    return options;
  }, [jobType, systemNames]);

  // MUI matches the value against the options by identity, so the selected system
  // has to be the option object itself rather than an equal copy.
  const optionsByID = useMemo(() => {
    const byID = {};
    for (const option of autocompleteOptions) byID[option.id] = option;
    return byID;
  }, [autocompleteOptions]);

  const handleChange = (event, newValue) => {
    if (newValue) {
      const result = updateSelectedValue(newValue.id);
      if (result?.message) {
        setHasError(true);
        setErrorMessage(result.message);
        return;
      }
      setInputValue("");
      setHasError(false);
      setErrorMessage("");
    }
  };

  const autocompleteSlotProps = {
    listbox: {
      component: VirtualisedListbox,
      virtualizerControlRef,
      ...(appShellStyled ? { sx: appShellAutocompleteListboxSx(theme) } : {}),
    },
    ...(appShellStyled
      ? {
          paper: {
            sx: appShellSelectMenuPaperSx(theme),
          },
          popper: {
            placement: "bottom-start",
            sx: { mt: 0.5 },
          },
        }
      : {}),
  };

  return (
    <FormControl
      fullWidth
      sx={
        appShellStyled
          ? (t) => ({
              ...appShellOutlinedFormControl(t),
              "& .MuiFormHelperText-root": appShellHelperTextSx,
              paddingX: 0,
            })
          : {
              "& .MuiFormHelperText-root": {
                color: (t) => t.palette.secondary.main,
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
              paddingX: "20px",
            }
      }
    >
      <Autocomplete
        id="System Search"
        value={
          optionsByID[selectedValue] ?? optionsByID[DEFAULT_SYSTEM] ?? null
        }
        options={autocompleteOptions}
        filterOptions={filterOptions}
        clearOnBlur
        inputValue={inputValue}
        onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
        onHighlightChange={handleHighlightChange}
        onChange={handleChange}
        getOptionLabel={(option) => option.name}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props;
          return (
            <li key={key} {...optionProps}>
              {option.name}
            </li>
          );
        }}
        style={{ width: "100%" }}
        renderInput={(params) => (
          <TextField
            {...params}
            fullWidth
            placeholder="Select a system"
            margin="none"
            variant={appShellStyled ? "outlined" : "standard"}
            size="small"
            error={hasError}
            sx={
              appShellStyled ? (t) => appShellTextFieldOutlinedSx(t) : undefined
            }
          />
        )}
        slotProps={autocompleteSlotProps}
      />
      <FormHelperText
        variant="standard"
        id="system-search-label"
        error={hasError}
        sx={appShellStyled ? appShellHelperTextSx : undefined}
      >
        {hasError
          ? errorMessage
          : appShellStyled
            ? "Solar system"
            : "System Search"}
      </FormHelperText>
    </FormControl>
  );
}

export default VirtualisedSystemSearch;
