import {
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
  useTheme,
} from "@mui/material";
import GLOBAL_CONFIG from "../../global-config-app";
import { getAppShellMarketSelectProps } from "../../Context/appShell";
import useUsersStore from "../../Zustand/usersStore.js";
import { normalizedOverrideWhenMatchesDefault } from "./applicationSettingsMarketUtils.js";
import { sourceIn } from "../../Functions/MarketData/marketSources";
import { useMarketSources } from "../../Hooks/Static/useMarketSources";

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
 * @param {boolean} [props.useAppShellStyling=false] - Outlined control + menu styling from app shell
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
  disabled = false,
  useAppShellStyling = false,
}) {
  const theme = useTheme();
  const marketSources = useMarketSources();
  const appShell = useAppShellStyling
    ? getAppShellMarketSelectProps(theme)
    : null;
  const resolvedSelectVariant = appShell?.selectVariant ?? selectVariant;
  const resolvedMenuProps = { ...(appShell?.menuProps || {}), ...menuProps };

  // A value the registry does not carry falls back to the default rather than
  // leaving the select showing nothing.
  const validValue = sourceIn(marketSources, value)
    ? value
    : GLOBAL_CONFIG.DEFAULT_MARKET_OPTION;

  return (
    <FormControl
      sx={{
        ...(appShell?.customFormStyling || {}),
        ...(!useAppShellStyling
          ? {
              "& .MuiFormHelperText-root": {
                color: (theme) => theme.palette.secondary.main,
              },
            }
          : {}),
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
        id="market-location-select"
        aria-describedby="market-location-helper"
        variant={resolvedSelectVariant}
        size="small"
        value={validValue}
        error={error.isError}
        onChange={(e) => {
          if (onChange) {
            onChange(sourceIn(marketSources, e.target.value));
          } else {
            console.error(
              "Market Location Select is missing an onChange Function",
            );
          }
        }}
        MenuProps={resolvedMenuProps}
        sx={{
          color: error.isError ? "error.main" : "inherit",
          "& .MuiSelect-icon": {
            color: error.isError
              ? "error.main"
              : useAppShellStyling
                ? "primary.main"
                : "inherit",
          },
          ...customSelectStyling,
        }}
      >
        {marketSources.map((entry) => {
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
          ...(appShell?.customHelperTextStyling || {}),
          color: error.isError
            ? "error.main"
            : useAppShellStyling
              ? "text.secondary"
              : "secondary.main",
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
 * Chooses a market hub, falling back to the account's default for the side of
 * the job being priced.
 *
 * @param {Object} props
 * @param {string | null | undefined} props.overrideMarketLocation — when set, overrides the account default for display/commit
 * @param {(marketLocationId: string | undefined) => void} props.onMarketLocationCommit — `undefined` clears override when choice matches default
 * @param {string} props.side — One of PRICING_SIDE: which side of the job this control prices
 * @param {string | undefined} [props.alternativeDefaultMarketLocation] — optional substitute for store default (tests / special flows)
 */
export function MarketLocationSelectApplicationSettings({
  overrideMarketLocation,
  onMarketLocationCommit,
  side,
  alternativeDefaultMarketLocation,
  ...rest
}) {
  const storeDefault = useUsersStore(
    (s) => s.applicationSettings.defaultPricing?.[side]?.market,
  );
  const applicationDefault = alternativeDefaultMarketLocation ?? storeDefault;
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
            DEFAULT_MARKET_OPTION,
          ),
        )
      }
    />
  );
}
