import { useState } from "react";
import { setSellingPlan } from "../../../../Edit Job Hooks/jobCommands";

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
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";
import { useSelectedSetup } from "../../../../Edit Job Hooks/useSelectedSetup";
import {
  costOfExtras,
  costOfInvention,
} from "../../../../Edit Job Hooks/jobSelectors";

/**
 * Cost Breakdown and Returns, drawn from one set of figures.
 *
 * The two panels are separate on the stage but not separable in their reads: the
 * cost to build is what Returns subtracts, and a second derivation of it is how
 * two panels come to disagree. They are mounted together so the figures are
 * assembled once.
 */
export default function PlanningEconomics() {
  // The model is a way of reading this job's cost, not a change to it — it is
  // never written to the document, so a reader coming back sees the real one.
  const [pricingModel, setPricingModel] = useState(PRICING_MODEL.CHEAPEST);
  const actions = useJobActions();
  const selectedSetup = useSelectedSetup();
  const extrasCosts = useJobDraft((job) => job.build.extrasCosts);
  const inventionEntries = useJobDraft((job) => job.build.inventionEntries);
  const sellerCharacter = useJobDraft((job) => job.build.sellerCharacter);
  const saleLocationID = useJobDraft((job) => job.build.saleLocationID);
  const itemID = useJobDraft((job) => job.itemID);
  const name = useJobDraft((job) => job.name);
  const metaLevel = useJobDraft((job) => job.metaLevel);
  const { rows } = useMaterialsSourcing();
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
    rows,
    buyEverything: pricingModel === PRICING_MODEL.BUY_ALL,
  });

  if (!selectedSetup) return null;

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
        <Disclosure label={extrasLabel(extrasCosts)}>
          <ExtrasEditor />
        </Disclosure>

        {/* Only a T2 or T3 item is invented, so only one of those is asked what
            invention cost. What is recorded here is what the Purchasing stage
            shows: both write the same rows on the job. */}
        {invitesInvention({ metaLevel, itemID }) ? (
          <Disclosure label={inventionLabel(inventionEntries)}>
            <InventionEditor />
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
        saleLocationName={saleLocation?.name}
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
          typeID: itemID,
          name,
          pricedAtID: saleLocation?.pricedAtID,
          unitPrice: sellPrice,
          quantityProduced: commitment.surplus,
        }}
      >
        <SaleLocationRates
          saleLocation={saleLocation}
          rates={rates}
          isLoading={ratesLoading}
          plan={{ sellerCharacter, saleLocationID }}
          onPlanChange={(next) => {
            actions.run(setSellingPlan(next));
          }}
          seller={seller}
          pricedAtName={saleLocation?.pricedAtName}
        />
      </ReturnsPanel>
    </>
  );
}

/**
 * Says what opening the extras section would show, so a reader knows whether
 * there is anything behind it before they open it.
 *
 * @param {object} inventionEntries
 */
function inventionLabel(inventionEntries) {
  const rows = Object.values(inventionEntries ?? {});
  if (rows.length === 0) return "Add an invention cost";

  return `Invention — ${rows.length}, ${formatNumberForLocale(costOfInvention(inventionEntries))}`;
}

function extrasLabel(extrasCosts) {
  const rows = Object.values(extrasCosts ?? {});
  if (rows.length === 0) return "Add an extra cost";

  return `Extra costs — ${rows.length}, ${formatNumberForLocale(costOfExtras(extrasCosts))}`;
}
