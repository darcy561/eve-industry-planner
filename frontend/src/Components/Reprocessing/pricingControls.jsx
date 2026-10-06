import { Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MarketLocationSelect from "../../Styled Components/Select/marketLocation";
import OrderTypeSelect from "../../Styled Components/Select/orderType";
import PricingOrderTypeSelect from "../../Styled Components/Select/pricingOrderType";
import AssignUsersSelect from "../../Styled Components/Select/users";
import { getAppShellMarketSelectProps } from "../../Context/appShell";
import { formatIsk } from "../../Functions/Helper/numberParser";
import useUsersStore from "../../Zustand/usersStore";

/**
 * The market and order side a panel's figures are priced on, and who sells them where selling is
 * costed; given what reprocessing comes to on each order side, the choice shows those totals.
 */
export default function PricingControls({
  pageState,
  pageActions,
  showSeller,
  orderTypeOptions,
}) {
  const theme = useTheme();
  const selectProps = getAppShellMarketSelectProps(theme);
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const width = {
    ...selectProps.customFormStyling,
    minWidth: 140,
    width: "auto",
  };

  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ flexWrap: "wrap", gap: 1.5, alignItems: "flex-end" }}
    >
      <MarketLocationSelect
        useAppShellStyling
        labelText="Prices"
        value={pageState.marketLocation}
        onChange={({ id }) => pageActions.setMarketLocation(id)}
        customFormStyling={{ minWidth: 140, width: "auto" }}
      />
      {orderTypeOptions ? (
        <PricingOrderTypeSelect
          options={orderTypeOptions}
          formatValue={formatIsk}
          label="Reprocessed"
          totalsCaption="What reprocessing comes to under each"
          higherIsBetter
          onChange={(id) => pageActions.setMarketOrderType(id)}
        />
      ) : (
        <OrderTypeSelect
          {...selectProps}
          value={pageState.orderType}
          onChange={({ id }) => pageActions.setMarketOrderType(id)}
          customFormStyling={width}
        />
      )}
      {showSeller && isLoggedIn ? (
        <AssignUsersSelect
          {...selectProps}
          value={pageState.sellerHash}
          onChange={(hash) => pageActions.setSeller(hash)}
          formHelperText="Seller"
          customFormStyling={width}
        />
      ) : null}
    </Stack>
  );
}
