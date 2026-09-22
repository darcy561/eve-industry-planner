import { Stack } from "@mui/material";

import MarketLocationSelect from "../../../../Styled Components/Select/marketLocation";
import OrderTypeSelect from "../../../../Styled Components/Select/orderType";
import ExitRouteSelect from "../../../../Styled Components/Select/exitRoute";
import {
  PRICING_SIDE,
  PRICING_SIDES,
} from "../../../../Functions/MarketData/pricingSide.js";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";

/**
 * Where the account buys and sells: the market each side prices at, and which
 * figure is read there.
 *
 * Two sides rather than one set of defaults: a reader buys materials in one
 * place and lists what they made in another as a matter of course, and a single
 * answer could only ever describe one of those.
 *
 * A side's market and its figure are one choice, so they are asked together and
 * kept beside the markets they pick from — a reader who saves a market and then
 * wants to buy at the bid should not have to find half the answer elsewhere.
 * First login asks the same question, through this same component, so the two
 * screens cannot drift apart.
 *
 * A market that is no longer saved falls back to the trading hub, which the
 * select shows: a market an organisation stopped sharing then reads as the hub
 * taking over rather than as a setting that has broken.
 *
 * @param {object} [props]
 * @param {object} [props.selectProps] - Styling the surrounding surface gives
 *   its controls, as the app shell's outlined form props do
 */
export default function PricedAgainst({ selectProps = {} }) {
  const defaultPricing = useUsersStore(
    (state) => state.applicationSettings.defaultPricing,
  );
  const { updatePricingDefault } = useUsersStore(
    (state) => state.applicationSettings.actions,
  );

  const write = (side, key, value) => {
    updatePricingDefault(side, key, value);
    scheduleDebouncedApplicationSettingsSave();
  };

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
      {PRICING_SIDES.map(({ side, noun }) => (
        <Stack
          key={side}
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ flex: 1 }}
        >
          <MarketLocationSelect
            {...selectProps}
            value={defaultPricing?.[side]?.market}
            onChange={(market) => write(side, "market", market.id)}
            labelText={`${noun} market`}
          />
          {/* The selling side names a route out rather than an order type: it decides
              which side of the book the figure comes from and whether a broker
              fee is charged with it. */}
          {side === PRICING_SIDE.SELLING ? (
            <ExitRouteSelect
              {...selectProps}
              value={defaultPricing?.[side]?.exit}
              onChange={(route) => write(side, "exit", route.id)}
              labelText={`${noun} sold by`}
            />
          ) : (
            <OrderTypeSelect
              {...selectProps}
              value={defaultPricing?.[side]?.orderType}
              onChange={(orderType) => write(side, "orderType", orderType.id)}
              labelText={`${noun} prices`}
            />
          )}
        </Stack>
      ))}
    </Stack>
  );
}
