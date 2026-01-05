import React, { useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import systemIDsJSON from "../../RawData/systems.json";
import { FormControl, FormHelperText } from "@mui/material";
import { systemStructureRequirements } from "../../Context/defaultValues";
import GLOBAL_CONFIG from "../../global-config-app";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

/**
 * A virtualized autocomplete component for searching EVE Online solar systems.
 * Uses TanStack Virtual for performance and filters systems based on job type requirements.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.selectedValue=0] - Currently selected system ID
 * @param {Function} props.updateSelectedValue - Callback function called when a system is selected. Receives the system ID.
 * @param {number|null} [props.jobType=null] - Job type to filter systems by. If null, shows all systems.
 * @returns {JSX.Element} Virtualized system search autocomplete component
 * 
 * @example
 * <VirtualisedSystemSearch 
 *   selectedValue={30000142}
 *   updateSelectedValue={(systemId) => console.log('Selected system:', systemId)}
 *   jobType={1}
 * />
 */
function VirtualisedSystemSearch({
  selectedValue = 0,
  updateSelectedValue,
  jobType = null,
}) {
  const [inputValue, setInputValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("Error");

  const ListboxComponent = React.forwardRef(function ListboxComponent(
    props,
    ref
  ) {
    const { children, ...other } = props;
    const itemCount = Array.isArray(children) ? children.length : 0;

    const parentRef = React.useRef();

    const virtualizer = useVirtualizer({
      count: itemCount,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 50,
      overscan: 5,
    });

    return (
      <div ref={ref} {...other}>
        <div
          ref={parentRef}
          style={{
            height: 250,
            overflow: 'auto',
            width: '100%',
          }}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualItem.size,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {React.cloneElement(children[virtualItem.index], {
                  style: { height: virtualItem.size },
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  });
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

  return (
    <FormControl
      fullWidth
      sx={{
        "& .MuiFormHelperText-root": {
          color: (theme) => theme.palette.secondary.main,
        },

        "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
          {
            display: "none",
          },
        paddingX: "20px",
      }}
    >
      <Autocomplete
        id="System Search"
        value={
          systemIDMap[selectedValue] ?? systemIDMap[DEFAULT_SYSTEM] ?? null
        }
        options={Object.values(systemIDMap)}
        clearOnBlur
        inputValue={inputValue}
        onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
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
            variant="standard"
            error={hasError}
            helperText={hasError ? errorMessage : null}
          />
        )}
        slotProps={{
          listbox: {
            component: ListboxComponent
          }
        }}
      />
      <FormHelperText variant="standard" id="system-search-label">
        System Search
      </FormHelperText>
    </FormControl>
  );
}

export default VirtualisedSystemSearch;
