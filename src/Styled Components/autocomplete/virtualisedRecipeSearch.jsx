import React, { useMemo, useState } from "react";
import { FixedSizeList } from "react-window";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import itemList from "../../RawData/searchIndex.json";

function VirtualisedRecipeSearch({ onSelect }) {
  const [selectedValue, setSelectedValue] = useState(null);
  const [inputValue, setInputValue] = useState("");

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

  const handleChange = (event, newValue) => {
    if (newValue) {
      onSelect(newValue);
      setSelectedValue(null);
      setInputValue("");
    }
  };

  return (
    <Autocomplete
      fullWidth
      id="Recipe Search"
      value={selectedValue}
      options={itemList}
      clearOnBlur
      inputValue={inputValue}
      onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
      onClose={() => setSelectedValue(null)}
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
          label="Search"
          placeholder="Select an item"
          margin="none"
          variant="standard"
        />
      )}
      ListboxComponent={ListboxComponent}
    />
  );
}

export default VirtualisedRecipeSearch;
