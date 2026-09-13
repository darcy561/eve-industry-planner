import { useMemo } from "react";

import {
  getDefaultSaleStructure,
  resolveSaleLocation,
} from "../../Functions/MarketOrders/saleLocations";
import { resolveSellerCharacter } from "../../Functions/MarketOrders/sellerCharacter";
import { useEffectiveMarketHubFromLayout } from "./useEffectiveMarketHubFromLayout.js";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
import { EXIT_ROUTE } from "../../Functions/MarketData/returns";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Who sells this job's output, and from where.
 *
 * Every panel quoting a broker fee, a sales tax or a market skill level has to
 * resolve the same pair, and each of them resolves it from three places at once
 * — the job's own plan, the account default, and the hub the layout is priced
 * against. Resolving that in each panel is how Skills came to quote one
 * character's Accounting against a fee Returns had struck for another.
 *
 * @param {object} activeJob
 * @returns {{seller: import("../../Functions/MarketOrders/sellerCharacter").SellerCharacter,
 *   saleLocation: object|null, marketSelect: string, exitRoute: string}}
 */
export function useJobSellingContext(activeJob) {
  const { marketDisplay: marketSelect } = useEffectiveMarketHubFromLayout(
    activeJob?.layout,
    PRICING_SIDE.SELLING,
  );

  const plan = activeJob?.build?.sale?.plan ?? {};

  const exitRoute =
    useUsersStore(
      (state) => state.applicationSettings.defaultPricing?.selling?.exit,
    ) ?? EXIT_ROUTE.LISTED;

  // The job's own choice first, the account's default behind it.
  const saleLocation = useMemo(
    () =>
      resolveSaleLocation(
        plan.saleLocationID ?? getDefaultSaleStructure()?.id,
        marketSelect,
      ),
    [plan.saleLocationID, marketSelect],
  );

  // The seller, not the builder. Market skills and standings live on whichever
  // character lists the order, which is routinely a trading alt rather than the
  // one the setup runs the job on.
  //
  // A seller named by the job is only usable by the account that owns that
  // character — no member of a shared planner can work out another member's fee
  // — so `resolveSellerCharacter` falls back to their own and says it is.
  const seller = resolveSellerCharacter(plan.sellerCharacter);

  // The route out belongs here rather than in the panel: it decides which figure
  // Returns leads with *and* whether the broker fee this hook's seller is quoted
  // for applies at all, so the two have to be read from the same place.
  return { seller, saleLocation, marketSelect, exitRoute };
}
