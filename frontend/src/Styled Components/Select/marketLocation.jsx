import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import GLOBAL_CONFIG from "../../global-config-app";
import useUsersStore from "../../Zustand/usersStore.js";
import { normalizedOverrideWhenMatchesDefault } from "./applicationSettingsMarketUtils.js";

const { DEFAULT_MARKET_OPTION } = GLOBAL_CONFIG;

/**
 * A select component for choosing market locations.
 * Displays available market locations from GLOBAL_CONFIG with error handling.
 * Validates the selected value and falls back to "jita" if invalid.
 * 
 * @param {Object} props - Component props
 * @param {string} [props.value="jita"] - Currently selected market location ID
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the market option object.
 * @param {Object} [props.error] - Error state object with isError boolean and errorText string
 * @param {Object} [props.customFormStyling] - Custom styling for the form control
 * @param {Object} [props.customSelectStyling] - Custom styling for the select component
 * @param {Object} [props.customHelperTextStyling] - Custom styling for the helper text
 * @param {string} [props.labelText="Market"] - Label text to display in helper text
 * @returns {JSX.Element} Market location select component
 * 
 * @example
 * <MarketLocationSelect 
 *   value="jita"
 *   onChange={(market) => setMarketLocation(market)}
 *   error={{ isError: false, errorText: "" }}
 *   labelText="Market Hub"
 * />
 */
function MarketLocationSelect({
  value = "jita",
  onChange,
  error = { isError: false, errorText: "" },
  customFormStyling = {},
  customSelectStyling = {},
  customHelperTextStyling = {},
  labelText = "Market",
  selectVariant = "standard",
  menuProps = {},
}) {
  const { MARKET_OPTIONS } = GLOBAL_CONFIG;
  
  // Ensure value is valid, fallback to "jita" if not
  const validValue = MARKET_OPTIONS.find(option => option.id === value) ? value : "jita";
  
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
        id="market-location-select"
        aria-describedby="market-location-helper"
        variant={selectVariant}
        size="small"
        value={validValue}
        error={error.isError}
        onChange={(e) => {
          if (onChange) {
            onChange(MARKET_OPTIONS.find((i) => i.id == e.target.value));
          } else {
            console.error(
              "Market Location Select is missing an onChange Function"
            );
          }
        }}
        MenuProps={menuProps}
        sx={{
          color: error.isError ? "error.main" : "inherit",
          "& .MuiSelect-icon": {
            color: error.isError ? "error.main" : "inherit",
          },
          ...customSelectStyling,
        }}
      >
        {MARKET_OPTIONS.map((entry) => {
          return (
            <MenuItem key={entry.id} value={entry.id}>
              {entry.name}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText
        id="market-location-helper"
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

export default MarketLocationSelect;

/**
 * Chooses a market hub using live `applicationSettings.defaultMarketLocation`, with an optional per-job override
 * (same field shape as persisted `layout.localMarketDisplay`).
 *
 * @param {Object} props
 * @param {string | null | undefined} props.overrideMarketLocation — when set, overrides application default for display/commit
 * @param {(marketLocationId: string | undefined) => void} props.onMarketLocationCommit — `undefined` clears override when choice matches default
 * @param {string | undefined} [props.alternativeDefaultMarketLocation] — optional substitute for store default (tests / special flows)
 */
export function MarketLocationSelectApplicationSettings({
  overrideMarketLocation,
  onMarketLocationCommit,
  alternativeDefaultMarketLocation,
  ...rest
}) {
  const storeDefault = useUsersStore(
    (s) => s.applicationSettings.defaultMarketLocation
  );
  const applicationDefault =
    alternativeDefaultMarketLocation ?? storeDefault;
  const value =
    overrideMarketLocation ?? applicationDefault ?? DEFAULT_MARKET_OPTION;

  return (
    <MarketLocationSelect
      {...rest}
      value={value}
      onChange={(location) =>
        onMarketLocationCommit(
          normalizedOverrideWhenMatchesDefault(
            location.id,
            applicationDefault,
            DEFAULT_MARKET_OPTION
          )
        )
      }
    />
  );
}
