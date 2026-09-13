import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { EXIT_ROUTE } from "../../Functions/MarketData/returns";

/**
 * The routes out of a finished build, in the order Returns states them.
 *
 * Named here rather than in the resolver because these are display strings: the
 * ids are the source of truth and live with `calculateReturns`, which is what
 * charges a broker fee against one of them and not the other.
 */
export const EXIT_ROUTE_OPTIONS = [
  {
    id: EXIT_ROUTE.LISTED,
    name: "List on the market",
    caption: "priced from the ask, pays broker fee and tax",
  },
  {
    id: EXIT_ROUTE.IMMEDIATE,
    name: "Sell into buy orders",
    caption: "priced from the bid, pays tax only",
  },
];

/**
 * A select for how output leaves a build.
 *
 * The selling side names a route rather than a pricing basis: the route decides
 * which side of the book the figure comes from *and* whether a broker fee is
 * charged, which a basis alone cannot say.
 *
 * @param {Object} props
 * @param {string} [props.value] - One of EXIT_ROUTE
 * @param {Function} props.onChange - Receives the chosen option object
 * @param {Object} [props.error] - `{ isError, errorText }`
 * @param {Object} [props.customFormStyling]
 * @param {Object} [props.customSelectStyling]
 * @param {Object} [props.customHelperTextStyling]
 * @param {string} [props.labelText="When sold"]
 * @param {string} [props.selectVariant="standard"]
 * @param {boolean} [props.disabled]
 * @returns {JSX.Element}
 */
function ExitRouteSelect({
  value = EXIT_ROUTE.LISTED,
  onChange,
  error = { isError: false, errorText: "" },
  customFormStyling = {},
  customSelectStyling = {},
  customHelperTextStyling = {},
  labelText = "When sold",
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
        ...customFormStyling,
      }}
      error={error.isError}
      fullWidth
    >
      <Select
        disabled={disabled}
        id="exit-route-select"
        aria-describedby="exit-route-helper"
        variant={selectVariant}
        size="small"
        value={value}
        MenuProps={menuProps}
        error={error.isError}
        onChange={(e) => {
          if (onChange) {
            onChange(EXIT_ROUTE_OPTIONS.find((i) => i.id === e.target.value));
          } else {
            console.error("Exit Route Select is missing an onChange Function");
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
        {EXIT_ROUTE_OPTIONS.map((entry) => (
          <MenuItem key={entry.id} value={entry.id}>
            {entry.name}
          </MenuItem>
        ))}
      </Select>
      <FormHelperText
        id="exit-route-helper"
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

export default ExitRouteSelect;
