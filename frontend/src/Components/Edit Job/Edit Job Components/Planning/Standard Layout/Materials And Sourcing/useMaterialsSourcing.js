import { useMemo } from "react";

import { useEffectiveMarketHubFromLayout } from "../../../../../../Hooks/Planner/useEffectiveMarketHubFromLayout.js";
import { PRICING_SIDE } from "../../../../../../Functions/MarketData/pricingSide.js";
import { useMaterialGroupPricing } from "../../../../../../Hooks/Planner/useMaterialGroupPricing.js";
import {
  childJobCoverage,
  coverageModeFor,
} from "../../../../../../Functions/Groups/childJobCoverage";
import { calculateChildJobTotals } from "../../../../../../Functions/Groups/childJobTotals";
import checkJobTypeIsBuildable from "../../../../../../Functions/Helper/checkJobTypeIsBuildable.js";
import {
  getEffectiveMaterialPriceHub,
  materialCostByBasis,
  priceAge,
  summariseBasisUse,
} from "../../../../../../Functions/MarketData/materialPricing.js";
import {
  buildMaterialSourcingRow,
  summariseSourcing,
} from "../../../../../../Functions/MarketData/materialSourcingRow.js";
import {
  getMarketPriceForType,
  getPriceRefreshedAt,
} from "../../../../../../Functions/MarketData/marketPriceForType";
import {
  resolveMaterialChildJobStatus,
  resolveMaterialChildJobs,
} from "./Helpers/materialChildJobs";
import { materialMark } from "../../../../../../Functions/MarketData/materialMark.js";
import useUsersStore from "../../../../../../Zustand/usersStore.js";

/**
 * What Materials & Sourcing draws: a row per material, the figures the panel
 * states around them, and what each pricing basis would do to the total.
 *
 * The rows are built here rather than inside the row components, so a figure can
 * be checked without rendering one.
 *
 * @param {object} params
 * @param {object} params.state - Edit Job state
 * @param {object} params.actions - Edit Job actions
 * @param {'all'|'active'} [params.displayType] - Whether quantities are the whole
 *   job's or only the selected setup's
 */
export function useMaterialsSourcing({ state, actions, displayType = "all" }) {
  const { activeJob } = state;
  const { layout } = activeJob;
  const { marketLocation, listingType, marketLocationRung, listingTypeRung } =
    useEffectiveMarketHubFromLayout(layout, PRICING_SIDE.BUYING);

  const groupPricing = useMaterialGroupPricing({
    side: PRICING_SIDE.BUYING,
    marketLocationRung,
    listingTypeRung,
  });

  const checkTypeIDisExempt = useUsersStore(
    (store) => store.applicationSettings.actions.checkTypeIDisExempt,
  );
  const automaticRecalculation = useUsersStore(
    (store) => store.applicationSettings.enableAutomaticJobRecalculation,
  );

  return useMemo(() => {
    const materials = Array.isArray(activeJob.build?.materials)
      ? activeJob.build.materials
      : [];

    const rows = materials.map((material) => {
      const resolved = getEffectiveMaterialPriceHub(
        layout,
        material.typeID,
        marketLocation,
        listingType,
        groupPricing,
      );
      const { childJobsById, hasChildJobs } = resolveMaterialChildJobs({
        state,
        actions,
        materialTypeID: material.typeID,
      });
      const matchedChildJobs = Array.from(childJobsById.values());
      const { hasLinked, hasTemp, hasPendingAdd } =
        resolveMaterialChildJobStatus({
          state,
          materialTypeID: material.typeID,
          childJobsLocation: activeJob.build.childJobs[material.typeID] || [],
        });

      const quantity = quantityFor(activeJob, material, displayType);

      // A speculative job prices the row without committing it. It deliberately
      // does not count towards `isLinked`: a row that is costed but still on Buy
      // is the whole point — it is what lets the panel offer the switch.
      const speculative = hasChildJobs
        ? null
        : (state.speculativeChildJobs?.[material.typeID] ?? null);

      const buyPrice = getMarketPriceForType(
        material.typeID,
        resolved.marketLocation,
        resolved.listingType,
      );

      const coverage = coverageFor({
        contributingJobs: speculative ? [speculative] : matchedChildJobs,
        quantity,
        buyPrice,
        state,
        resolved,
        isCommitted: hasChildJobs && !speculative,
        automaticRecalculation,
      });

      return buildMaterialSourcingRow({
        material,
        quantity,
        buyPrice,
        buildPrice: coverage ? coverage.unitCost : null,
        coverage,
        isSpeculative: Boolean(speculative),
        isBuildable: checkJobTypeIsBuildable(material.jobType),
        isLinked: hasChildJobs,
        matchedChildJobs,
        mark: materialMark({
          jobType: material.jobType,
          hasLinked,
          hasPending: hasTemp || hasPendingAdd,
          isExempt: checkTypeIDisExempt(material.typeID),
        }),
        marketLocation: resolved.marketLocation,
        listingType: resolved.listingType,
      });
    });

    return {
      rows,
      summary: summariseSourcing(rows),
      marketLocation,
      listingType,
      basisUsage: summariseBasisUse(rows, marketLocation, listingType),
      priceAge: priceAge(materials, getPriceRefreshedAt),
      basisOptions: materialCostByBasis({
        materials,
        layout,
        marketLocation,
        listingType,
        getPrice: getMarketPriceForType,
        groupPricing,
      }),
    };
    // The reducer returns a new state object on every dispatch anywhere on the
    // page, so this lists the parts the rows are actually built from.
  }, [
    actions,
    activeJob,
    displayType,
    layout,
    listingType,
    checkTypeIDisExempt,
    automaticRecalculation,
    groupPricing,
    marketLocation,
    state.parentChildToEdit.childJobs,
    state.speculativeChildJobs,
    state.temporaryChildJobs,
  ]);
}

/**
 * What the jobs behind a row produce against what the row needs, or null when
 * nothing builds it.
 *
 * Each job is costed for what it actually makes rather than for the whole
 * requirement, so the row states how much of itself is covered and what the rest
 * was costed as.
 *
 * @param {object} params
 * @returns {import("../../../../../../Functions/Groups/childJobCoverage").ChildJobCoverage|null}
 */
function coverageFor({
  contributingJobs,
  quantity,
  buyPrice,
  state,
  resolved,
  isCommitted,
  automaticRecalculation,
}) {
  if (contributingJobs.length === 0) return null;

  const contributors = contributingJobs.map((job) => {
    const totals = calculateChildJobTotals(
      job,
      state.temporaryChildJobs,
      resolved.marketLocation,
      resolved.listingType,
    );

    return {
      jobID: job.jobID,
      produced: totals.quantityProduced,
      unitCost: totals.totalCostPerItem,
    };
  });

  return childJobCoverage({
    required: quantity,
    contributors,
    buyPrice: Number.isFinite(buyPrice) && buyPrice > 0 ? buyPrice : null,
    mode: coverageModeFor({ isCommitted, automaticRecalculation }),
  });
}

/**
 * How many the row states.
 *
 * A player can read the whole job's requirement or only the selected setup's,
 * which are different figures on a job with more than one setup.
 *
 * @param {object} activeJob
 * @param {object} material
 * @param {'all'|'active'} displayType
 * @returns {number}
 */
function quantityFor(activeJob, material, displayType) {
  if (displayType !== "active") return material.quantity;

  return (
    activeJob.selectedSetup?.materialCount?.[material.typeID]?.quantity ??
    material.quantity
  );
}
