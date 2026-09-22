import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { ORDER_TYPES } from "../../Context/defaultValues";
import GLOBAL_CONFIG from "../../global-config-app";
import useUsersStore from "../../Zustand/usersStore.js";
import { normalizedOverrideWhenMatchesDefault } from "./applicationSettingsMarketUtils.js";
import { orderTypeForExit } from "../../Functions/MarketData/pricingSide.js";

const { DEFAULT_ORDER_TYPE } = GLOBAL_CONFIG;

/**
 * Which side of the order book a figure is read from.
 *
 * Named for ESI's own `order_type`, whose values this offers: `buy` and `sell`,
 * plus the two percentile-trimmed forms the server derives from the same books.
 *
 * @param {Object} props
 * @param {string} [props.value] - The chosen order type, defaulting to DEFAULT_ORDER_TYPE
 * @param {Function} props.onChange - Receives the chosen order type object
 * @param {Object} [props.error] - `{ isError, errorText }`
 * @param {Object} [props.customFormStyling]
 * @param {Object} [props.customSelectStyling]
 * @param {Object} [props.customHelperTextStyling]
 * @param {string} [props.labelText="Order type"]
 * @param {boolean} [props.disabled] - Refuses changes, e.g. while a job is locked
 * @returns {JSX.Element}
 */
function OrderTypeSelect({
  value = GLOBAL_CONFIG.DEFAULT_ORDER_TYPE,
  onChange,
  error = { isError: false, errorText: "" },
  customFormStyling = {},
  customSelectStyling = {},
  customHelperTextStyling = {},
  labelText = "Order type",
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
        id="market-order-type-select"
        aria-describedby="market-order-type-helper"
        variant={selectVariant}
        size="small"
        value={value}
        MenuProps={menuProps}
        error={error.isError}
        onChange={(e) => {
          if (onChange) {
            onChange(ORDER_TYPES.find((i) => i.id == e.target.value));
          } else {
            console.error("Order Type Select is missing an onChange Function");
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
        {ORDER_TYPES.map((entry) => {
          return (
            <MenuItem key={entry.id} value={entry.id}>
              {entry.name}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText
        id="market-order-type-helper"
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

export default OrderTypeSelect;

/**
 * The order type select, falling back to the account's default for the side of
 * the job being priced.
 *
 * @param {Object} props
 * @param {string | null | undefined} props.overrideOrderType
 * @param {(orderTypeId: string | undefined) => void} props.onOrderTypeCommit — `undefined` clears override when choice matches default
 * @param {string} props.side — One of PRICING_SIDE: which side of the job this control prices
 * @param {string | undefined} [props.alternativeDefaultOrderType]
 */
export function OrderTypeSelectApplicationSettings({
  overrideOrderType,
  onOrderTypeCommit,
  side,
  alternativeDefaultOrderType,
  ...rest
}) {
  // The selling side stores a route rather than an order type, so its order type is derived
  // the same way the ladder derives it. Reading `.orderType` alone would answer
  // undefined for that side and fall through to the global default, which looks
  // like a working control quietly ignoring the account.
  const storeSide = useUsersStore(
    (s) => s.applicationSettings.defaultPricing?.[side],
  );
  const storeDefault =
    storeSide?.orderType || orderTypeForExit(storeSide?.exit);
  const applicationDefault = alternativeDefaultOrderType ?? storeDefault;
  const value = overrideOrderType ?? applicationDefault ?? DEFAULT_ORDER_TYPE;

  return (
    <OrderTypeSelect
      {...rest}
      value={value}
      onChange={(orderType) =>
        onOrderTypeCommit(
          normalizedOverrideWhenMatchesDefault(
            orderType.id,
            applicationDefault,
            DEFAULT_ORDER_TYPE,
          ),
        )
      }
    />
  );
}
