import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { LISTING_TYPES } from "../../Context/defaultValues";
import GLOBAL_CONFIG from "../../global-config-app";
import useUsersStore from "../../Zustand/usersStore.js";
import { normalizedOverrideWhenMatchesDefault } from "./applicationSettingsMarketUtils.js";
import { basisForExit } from "../../Functions/MarketData/pricingSide.js";

const { DEFAULT_ORDER_OPTION } = GLOBAL_CONFIG;

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
 * @param {boolean} [props.disabled] - Refuses changes, e.g. while a job is locked
 * @returns {JSX.Element} Market listing select component
 *
 * @example
 * <ListingTypeSelect
 *   value="buy"
 *   onChange={(listing) => setListingType(listing)}
 *   error={{ isError: false, errorText: "" }}
 *   labelText="Order Type"
 * />
 */
function ListingTypeSelect({
  value = GLOBAL_CONFIG.DEFAULT_ORDER_OPTION,
  onChange,
  error = { isError: false, errorText: "" },
  customFormStyling = {},
  customSelectStyling = {},
  customHelperTextStyling = {},
  labelText = "Listing",
  selectVariant = "standard",
  menuProps = {},
  disabled = false,
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
        disabled={disabled}
        id="market-listing-select"
        aria-describedby="market-listing-helper"
        variant={selectVariant}
        size="small"
        value={value}
        MenuProps={menuProps}
        error={error.isError}
        onChange={(e) => {
          if (onChange) {
            onChange(LISTING_TYPES.find((i) => i.id == e.target.value));
          } else {
            console.error(
              "Market Listing Select is missing an onChange Function",
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
        {LISTING_TYPES.map((entry) => {
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

export default ListingTypeSelect;

/**
 * Pricing basis select, falling back to the account's default basis for the side
 * of the job being priced.
 *
 * @param {Object} props
 * @param {string | null | undefined} props.overrideListingType
 * @param {(orderTypeId: string | undefined) => void} props.onListingTypeCommit — `undefined` clears override when choice matches default
 * @param {string} props.side — One of PRICING_SIDE: which side of the job this control prices
 * @param {string | undefined} [props.alternativeDefaultListingType]
 */
export function ListingTypeSelectApplicationSettings({
  overrideListingType,
  onListingTypeCommit,
  side,
  alternativeDefaultListingType,
  ...rest
}) {
  // The selling side stores a route rather than a basis, so its basis is derived
  // the same way the ladder derives it. Reading `.basis` alone would answer
  // undefined for that side and fall through to the global default, which looks
  // like a working control quietly ignoring the account.
  const storeSide = useUsersStore(
    (s) => s.applicationSettings.defaultPricing?.[side],
  );
  const storeDefault = storeSide?.basis || basisForExit(storeSide?.exit);
  const applicationDefault = alternativeDefaultListingType ?? storeDefault;
  const value =
    overrideListingType ?? applicationDefault ?? DEFAULT_ORDER_OPTION;

  return (
    <ListingTypeSelect
      {...rest}
      value={value}
      onChange={(listing) =>
        onListingTypeCommit(
          normalizedOverrideWhenMatchesDefault(
            listing.id,
            applicationDefault,
            DEFAULT_ORDER_OPTION,
          ),
        )
      }
    />
  );
}
