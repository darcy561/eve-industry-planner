import { useState } from "react";

import CostBreakdownPanel from "./costBreakdownPanel";
import PricingModelToggle, { PRICING_MODEL } from "./pricingModel";
import CostComparison from "./costComparison";
import ReturnsPanel from "../Returns/returnsPanel";
import ContributionPanel from "../Returns/contributionPanel";
import SaleLocationRates from "../Returns/saleLocationRates";
import { useJobEconomics } from "./useJobEconomics";
import { useMaterialsSourcing } from "../Materials And Sourcing/useMaterialsSourcing";
import ExtrasEditor from "../../../Complete/Standard Layout/Extras Panel/extrasEditor";
import InventionEditor, { invitesInvention } from "./inventionEditor";
import { Typography } from "@mui/material";

import { Disclosure } from "../../../../../../Styled Components/Typography/figures";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";

/**
 * Cost Breakdown and Returns, drawn from one set of figures.
 *
 * The two panels are separate on the stage but not separable in their reads: the
 * cost to build is what Returns subtracts, and a second derivation of it is how
 * two panels come to disagree. They are mounted together so the figures are
 * assembled once.
 *
 * @param {object} props - Edit Job props
 */
export default function PlanningEconomics(props) {
  const { state } = props;
  // The model is a way of reading this job's cost, not a change to it — it is
  // never written to the document, so a reader coming back sees the real one.
  const [pricingModel, setPricingModel] = useState(PRICING_MODEL.CHEAPEST);
  const { rows } = useMaterialsSourcing({
    state,
    actions: props.actions,
  });
  const {
    cost,
    returns,
    comparison,
    charges,
    saleLocation,
    exitRoute,
    rates,
    ratesLoading,
    seller,
    sellPrice,
    commitment,
    contributedCost,
    sellableBuildCost,
  } = useJobEconomics({
    state,
    actions: props.actions,
    rows,
    buyEverything: pricingModel === PRICING_MODEL.BUY_ALL,
  });

  if (!state.activeJob.selectedSetup) return null;

  return (
    <>
      <CostBreakdownPanel
        cost={cost}
        action={
          <PricingModelToggle value={pricingModel} onChange={setPricingModel} />
        }
        aside={
          <CostComparison
            comparison={comparison}
            formatIsk={formatNumberForLocale}
          />
        }
      >
        <Disclosure label={extrasLabel(state.activeJob)}>
          <ExtrasEditor state={state} actions={props.actions} />
        </Disclosure>

        {/* Only a T2 or T3 item is invented, so only one of those is asked what
            invention cost. What is recorded here is what the Purchasing stage
            shows: both write the same rows on the job. */}
        {invitesInvention(state.activeJob) ? (
          <Disclosure label={inventionLabel(state.activeJob)}>
            <InventionEditor state={state} actions={props.actions} />
          </Disclosure>
        ) : null}
      </CostBreakdownPanel>
      <ContributionPanel
        commitment={commitment}
        contributedCost={contributedCost}
        marketPrice={sellPrice}
      />

      <ReturnsPanel
        returns={returns}
        exitRoute={exitRoute}
        charges={charges}
        buildCost={sellableBuildCost}
        comparison={comparison}
        action={
          saleLocation ? (
            <Typography variant="body2" color="text.secondary">
              {saleLocation.name}
            </Typography>
          ) : null
        }
        output={{
          typeID: state.activeJob.itemID,
          name: state.activeJob.name,
          priceHubID: saleLocation?.priceHubID,
          unitPrice: sellPrice,
          quantityProduced: commitment.surplus,
        }}
      >
        <SaleLocationRates
          saleLocation={saleLocation}
          rates={rates}
          isLoading={ratesLoading}
          plan={state.activeJob.build?.sale?.plan ?? {}}
          onPlanChange={(next) => {
            state.activeJob.setSellingPlan(next);
            props.actions.updateActiveJob(state.activeJob);
          }}
          seller={seller}
          priceHubName={saleLocation?.priceHubName}
        />
      </ReturnsPanel>
    </>
  );
}

/**
 * Says what opening the extras section would show, so a reader knows whether
 * there is anything behind it before they open it.
 *
 * @param {object} activeJob
 */
function inventionLabel(activeJob) {
  const rows = activeJob.build?.costs?.inventionEntries ?? [];
  if (rows.length === 0) return "Add an invention cost";

  return `Invention — ${rows.length}, ${formatNumberForLocale(activeJob.totalInventionCost ?? 0)}`;
}

function extrasLabel(activeJob) {
  const rows = activeJob.build?.costs?.extrasCosts ?? [];
  if (rows.length === 0) return "Add an extra cost";

  return `Extra costs — ${rows.length}, ${formatNumberForLocale(activeJob.totalExtrasCost ?? 0)}`;
}
