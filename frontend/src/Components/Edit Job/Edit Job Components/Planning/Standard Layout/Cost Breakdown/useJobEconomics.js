import { useMemo } from "react";

import { useMarketPricesQuery } from "../../../../../../Hooks/React Query/World/marketPrices";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { pricesWantedBy } from "../../../../../../Functions/MarketData/pricesWanted";
import { installCostForPlanning } from "../../../../../../Functions/Installation Costs/installCosts";
import { buildCostBreakdown } from "../../../../../../Functions/MarketData/costBreakdown";
import { calculateReturns } from "../../../../../../Functions/MarketData/returns";
import { compareToHistory } from "../../../../../../Functions/MarketData/buildComparison";
import {
  brokerFeeAmount,
  salesTaxAmount,
} from "../../../../../../Functions/MarketOrders/sellingRates";
import { useSellingRates } from "../../../../../../Hooks/React Query/Character/useSellingRates";
import { useAccountTotalsQuery } from "../../../../../../Hooks/React Query/Backend/statisticsTotals";
import { formatPercentage } from "../../../../../../Functions/Helper/numberParser";
import { getMarketPriceForType } from "../../../../../../Functions/MarketData/marketPriceForType";
import { useJobCommitment } from "../../../../../../Hooks/Planner/useJobCommitment";
import { useJobSellingContext } from "../../../../../../Hooks/Planner/useJobSellingContext";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import {
  costOfInvention,
  quantityProduced,
} from "../../../../Edit Job Hooks/jobSelectors";

/**
 * The figures Cost Breakdown and Returns both draw from.
 *
 * One place because the two panels must agree: a cost to build stated on one and
 * subtracted on the other has to be the same number, and it stops being so the
 * moment each panel totals the rows itself.
 *
 * @param {object} params
 * @param {Array<object>} params.rows - Rows from useMaterialsSourcing
 * @param {boolean} [params.buyEverything] - Price every material at market
 */
export function useJobEconomics({ rows, buyEverything = false }) {
  const itemID = useJobDraft((job) => job.itemID);
  const build = useJobDraft((job) => job.build);
  const accountPricing = useUsersStore(
    (store) => store.applicationSettings.defaultPricing,
  );
  const setups = useJobDraft((job) => job.build.setup);
  const extrasCosts = useJobDraft((job) => job.build.extrasCosts);
  const inventionEntries = useJobDraft((job) => job.build.inventionEntries);
  const industryJobs = useJobDraft((job) => job.esi.industryJobs);
  const itemsProducedPerRun = useJobDraft((job) => job.itemsProducedPerRun);
  // The pairs these figures are read at, through the same resolution they are
  // read back with — so what is asked for and what is drawn cannot disagree.
  const { wants, adjustedTypeIDs } = useMemo(
    () => pricesWantedBy({ itemID, build }, accountPricing),
    [itemID, build, accountPricing],
  );
  const { clocks } = useMarketPricesQuery(wants, { adjustedTypeIDs });

  const {
    seller,
    saleLocation,
    exitRoute,
    marketLocation: sellingMarket,
  } = useJobSellingContext();

  const { data: rates, isLoading: ratesLoading } = useSellingRates(
    saleLocation,
    seller.hash,
  );
  const { data: totalsData } = useAccountTotalsQuery(itemID);

  const commitment = useJobCommitment();

  return useMemo(() => {
    const produced = quantityProduced(setups, itemsProducedPerRun);

    // Output owed to a parent is never listed, so it has no sale price, no fee
    // and no tax. Only what is left over can honestly be sold.
    const sellable = commitment.surplus;

    // Both routes out are priced from the location's own hub, which for a
    // citadel is not the citadel: it holds no market of its own. Behind that the
    // selling side's market, not the panel's — the panel resolves where materials
    // are bought, and quoting a sale against it is the crossing this whole
    // arrangement exists to stop.
    const pricedAt = saleLocation?.pricedAtID ?? sellingMarket;
    const sellPrice = getMarketPriceForType(itemID, pricedAt, "sell");
    const buyPrice = getMarketPriceForType(itemID, pricedAt, "buy");

    // The fee is charged on what the listing is worth, which is the sell-side
    // revenue of what is actually going to be listed.
    const listedValue = sellPrice * sellable;
    // Nothing listed is charged nothing. The fee has a 100 ISK floor, which
    // would otherwise bill a listing that is never made — by a job whose whole
    // output is owed to a parent, or of an item the market has no price for,
    // where the floor is the only figure the estimate would have.
    const charged = rates && sellable > 0 && listedValue > 0;
    const brokerFee = charged
      ? brokerFeeAmount(rates.brokerFee.rate, listedValue)
      : 0;
    const salesTax = charged
      ? salesTaxAmount(rates.salesTax.rate, listedValue)
      : 0;

    const cost = buildCostBreakdown({
      rows,
      installCost: installCostForPlanning({ industryJobs, setups }),
      // The attempts that produced the blueprint, which the archive counts in a
      // build's cost. Left out here, the stage reads a T2 job as cheaper than
      // its own history says every previous one was.
      inventionCost: costOfInvention(inventionEntries),
      extras: Object.values(extrasCosts ?? {}),
      brokerFee,
      salesTax,
      quantityProduced: produced,
      buyEverything,
      sellDetail: rates
        ? {
            brokerFee: `${formatPercentage(rates.brokerFee.rate / 100, { places: 2 })} at ${saleLocation?.name}`,
            // Named the same way the fee is. The rate itself carries no location
            // — tax is the same wherever a sale happens — but a reader comparing
            // two lines in one band should not have to know that to place the
            // second one.
            salesTax: `${formatPercentage(rates.salesTax.rate / 100, { places: 3 })} on the sale at ${saleLocation?.name}`,
          }
        : {},
    });

    return {
      cost,
      saleLocation,
      exitRoute,
      pricedAt,
      rates,
      ratesLoading,
      seller,
      sellPrice,
      commitment,
      // The share of the build cost belonging to what can actually be sold.
      // Returns states it and subtracts it, and the two must be the same figure.
      sellableBuildCost: (cost.toBuild.perUnit ?? 0) * sellable,
      // Returns is about the part that gets sold. Its build cost is that part's
      // share rather than the whole job's, or a job that owes most of its output
      // to a parent would read as a heavy loss on the little it can sell.
      returns:
        sellable > 0
          ? calculateReturns({
              sellPrice,
              buyPrice,
              quantityProduced: sellable,
              buildCost: (cost.toBuild.perUnit ?? 0) * sellable,
              brokerFee,
              salesTax,
            })
          : null,
      // What the committed output costs the parents above it — the figure that
      // replaces a sale price when there is nothing to sell.
      contributedCost: (cost.toBuild.perUnit ?? 0) * commitment.committed,
      // The archive's marks are build cost per unit, so the comparison is made
      // against the build band rather than the total.
      comparison: compareToHistory(totalsData?.history, cost.toBuild.perUnit),
      charges: { brokerFee, salesTax },
    };
    // `clocks` is read by nothing in here on purpose. The prices are,
    // synchronously out of the cache, and this is what says they have moved.
    //
    // Inert while `seller` is rebuilt unmemoised by `useJobSellingContext`,
    // which recomputes this every render anyway. Named so the figures still
    // follow the prices when that is fixed, rather than the fix quietly taking
    // them off it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    itemID,
    setups,
    extrasCosts,
    inventionEntries,
    industryJobs,
    itemsProducedPerRun,
    buyEverything,
    commitment,
    exitRoute,
    rates,
    ratesLoading,
    rows,
    saleLocation,
    seller,
    sellingMarket,
    totalsData,
    clocks,
  ]);
}
