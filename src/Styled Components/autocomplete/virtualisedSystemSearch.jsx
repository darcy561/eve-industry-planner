import React, { useMemo, useState } from "react";
import { FixedSizeList } from "react-window";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import systemIDsJSON from "../../RawData/systems.json";
import { FormControl, FormHelperText } from "@mui/material";

function VirtualisedSystemSearch({ selectedValue = 0, updateSelectedValue }) {
  const [inputValue, setInputValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("Error");

  const ListboxComponent = React.forwardRef(function ListboxComponent(
    props,
    ref
  ) {
    const { children, ...other } = props;
    const itemCount = Array.isArray(children) ? children.length : 0;

    const Row = ({ index, style }) =>
      React.cloneElement(children[index], { style });

    const outerElementType = useMemo(() => {
      const OuterElement = React.forwardRef((props, ref) => (
        <div ref={ref} {...props} />
      ));
      return OuterElement;
    }, []);

    return (
      <div ref={ref} {...other}>
        <FixedSizeList
          height={250}
          itemCount={itemCount}
          itemSize={50}
          outerElementType={outerElementType}
          width="100%"
        >
          {Row}
        </FixedSizeList>
      </div>
    );
  });

  const systemIDMap = useMemo(() => {
    let results = {};

    for (let system of systemIDsJSON) {
      results[system.id] = system;
    }

    return results;
  }, []);

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
      }}
    >
      <Autocomplete
        id="System Search"
        value={systemIDMap[selectedValue]}
        options={systemIDsJSON}
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
        ListboxComponent={ListboxComponent}
      />
      <FormHelperText variant="standard" id="system-search-label">
        System Search
      </FormHelperText>
    </FormControl>
  );
}

export default VirtualisedSystemSearch;
