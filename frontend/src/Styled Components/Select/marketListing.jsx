import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { listingType } from "../../Context/defaultValues";
import GLOBAL_CONFIG from "../../global-config-app";

/**
 * A select component for choosing market listing types (buy/sell orders).
 * Displays available listing types with error handling and custom styling options.
 * 
 * @param {Object} props - Component props
 * @param {string} [props.value] - Currently selected listing type ID (defaults to DEFAULT_ORDER_OPTION)
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the listing type object.
 * @param {Object} [props.error] - Error state object with isError boolean and errorText string
 * @param {Object} [props.customFormStyling] - Custom styling for the form control
 * @param {Object} [props.customSelectStyling] - Custom styling for the select component
 * @param {Object} [props.customHelperTextStyling] - Custom styling for the helper text
 * @param {string} [props.labelText="Listing"] - Label text to display in helper text
 * @returns {JSX.Element} Market listing select component
 * 
 * @example
 * <MarketListingSelect 
 *   value="buy"
 *   onChange={(listing) => setListingType(listing)}
 *   error={{ isError: false, errorText: "" }}
 *   labelText="Order Type"
 * />
 */
function MarketListingSelect({
  value = GLOBAL_CONFIG.DEFAULT_ORDER_OPTION  ,
  onChange,
  error = { isError: false, errorText: "" },
  customFormStyling = {},
  customSelectStyling = {},
  customHelperTextStyling = {},
  labelText = "Listing",
}) {
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
      error={error.isError}
      fullWidth
    >
      <Select
        id="market-listing-select"
        aria-describedby="market-listing-helper"
        variant="standard"
        size="small"
        value={value}
        error={error.isError}
        onChange={(e) => {
          if (onChange) {
            onChange(listingType.find((i) => i.id == e.target.value));
          } else {
            console.error(
              "Market Listing Select is missing an onChange Function"
            );
          }
        }}
        sx={{
          color: error.isError ? "error.main" : "inherit",
          "& .MuiSelect-icon": {
            color: error.isError ? "error.main" : "inherit",
          },
          ...customSelectStyling,
        }}
      >
        {listingType.map((entry) => {
          return (
            <MenuItem key={entry.id} value={entry.id}>
              {entry.name}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText
        id="market-listing-helper"
        variant="standard"
        sx={{
          color: error.isError ? "error.main" : "secondary.main",
          ...customHelperTextStyling,
        }}
      >
        {error.isError ? error.errorText : labelText}
      </FormHelperText>
    </FormControl>
  );
}

export default MarketListingSelect;
