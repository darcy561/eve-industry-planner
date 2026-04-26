import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Autocomplete, {
  createFilterOptions,
} from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import systemIDsJSON from "../../RawData/systems.json";
import { FormControl, FormHelperText } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { systemStructureRequirements } from "../../Context/defaultValues";
import GLOBAL_CONFIG from "../../global-config-app";
import {
  appShellAutocompleteListboxSx,
  appShellHelperTextSx,
  appShellOutlinedFormControl,
  appShellSelectMenuPaperSx,
  appShellTextFieldOutlinedSx,
} from "../../Context/appShell";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

const defaultAutocompleteFilter = createFilterOptions();

function ListboxComponent({ children, virtualizerControlRef, ref, ...other }) {
  const childItems = Array.isArray(children) ? children : [children].filter(Boolean);
  const itemCount = childItems.length;

  const parentRef = useRef();

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  });

  useLayoutEffect(() => {
    if (!virtualizerControlRef) return;
    virtualizerControlRef.current = {
      scrollToIndex: (index) => {
        if (
          typeof index !== "number" ||
          !Number.isFinite(index) ||
          index < 0 ||
          index >= itemCount
        ) {
          return;
        }
        virtualizer.scrollToIndex(index, { align: "auto" });
      },
    };
    return () => {
      virtualizerControlRef.current = null;
    };
  }, [virtualizer, virtualizerControlRef, itemCount]);

  return (
    <div ref={ref} {...other}>
      <div
        ref={parentRef}
        style={{
          height: 250,
          overflow: "auto",
          width: "100%",
        }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {childItems[virtualItem.index]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
    []
  );

  const handleHighlightChange = (event, option) => {
    if (option == null) return;
    const index = filteredOptionsSnapshotRef.current.findIndex(
      (o) => o.id === option.id
    );
    if (index < 0) return;
    requestAnimationFrame(() => {
      virtualizerControlRef.current?.scrollToIndex?.(index);
    });
  };

  const systemIDMap = useMemo(() => {
    let results = {};
    for (let system of systemIDsJSON) {
      const availableJobTypes =
        systemStructureRequirements[system.id]?.allowedJobTypes || [];
      if (jobType === null || availableJobTypes.length === 0) {
        results[system.id] = system;
      } else {
        const matches = availableJobTypes.includes(jobType);
        if (matches) {
          results[system.id] = system;
        }
      }
    }

    return results;
  }, [jobType]);

  const autocompleteOptions = useMemo(
    () => Object.values(systemIDMap),
    [systemIDMap]
  );

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
      component: ListboxComponent,
      virtualizerControlRef,
      ...(appShellStyled
        ? { sx: appShellAutocompleteListboxSx(theme) }
        : {}),
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
          systemIDMap[selectedValue] ?? systemIDMap[DEFAULT_SYSTEM] ?? null
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
              appShellStyled
                ? (t) => appShellTextFieldOutlinedSx(t)
                : undefined
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
