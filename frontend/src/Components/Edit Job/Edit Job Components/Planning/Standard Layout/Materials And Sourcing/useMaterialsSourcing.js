import { useMemo } from "react";

import { useEffectiveMarketHub } from "../../../../../../Hooks/Planner/useEffectiveMarketHub.js";
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
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import {
  childJobIDsAfterEdits,
  materialRequirementOf,
  selectedSetupOf,
} from "../../../../Edit Job Hooks/jobSelectors";

/**
 * What Materials & Sourcing draws: a row per material, the figures the panel
 * states around them, and what each pricing basis would do to the total.
 *
 * The rows are built here rather than inside the row components, so a figure can
 * be checked without rendering one.
 *
 * @param {object} params
 * @param {'all'|'active'} [params.displayType] - Whether quantities are the whole
 *   job's or only the selected setup's
 */
export function useMaterialsSourcing({ displayType = "all" } = {}) {
  // The whole build rather than a part of it: the rows are made of its
  // materials, its setups, its links and its price overrides at once, so naming
  // them one at a time would subscribe this to nearly all of it anyway.
  const build = useJobDraft((job) => job.build);
  const setupToEdit = useJobDraft((job) => job.layout.setupToEdit);
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const temporaryChildJobs = useUsersStore(
    (store) => store.editSession.temporaryChildJobs,
  );
  const speculativeChildJobs = useUsersStore(
    (store) => store.editSession.speculativeChildJobs,
  );
  const childJobEdits = useUsersStore(
    (store) => store.editSession.parentChildToEdit.childJobs,
  );
  const { marketLocation, listingType, marketLocationRung, listingTypeRung } =
    useEffectiveMarketHub(build?.localPricing, PRICING_SIDE.BUYING);

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
    // Sorted here rather than held sorted: the job keys its materials by type
    // id, which says nothing about the order to read them in, so the panel that
    // shows them decides it.
    const selectedSetup = selectedSetupOf(build?.setup, setupToEdit);
    const materials = Object.values(build?.materials ?? {}).sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? ""),
    );

    const rows = materials.map((material) => {
      const resolved = getEffectiveMaterialPriceHub(
        build,
        material.typeID,
        marketLocation,
        listingType,
        groupPricing,
      );
      const { childJobsById, hasChildJobs } = resolveMaterialChildJobs({
        childJobIDs: childJobIDsAfterEdits(
          build?.childJobs?.[material.typeID],
          childJobEdits[material.typeID],
        ),
        temporaryChildJob: temporaryChildJobs?.[material.typeID],
      });
      const matchedChildJobs = Array.from(childJobsById.values());
      const { hasLinked, hasTemp, hasPendingAdd } =
        resolveMaterialChildJobStatus({
          inGroup: includedInGroup,
          childJobsLocation: build?.childJobs?.[material.typeID] || [],
          temporaryChildJob: temporaryChildJobs?.[material.typeID],
          markedChildJobs: childJobEdits?.[material.typeID],
        });

      const quantity = quantityFor({
        setups: build?.setup,
        selectedSetup,
        typeID: material.typeID,
        displayType,
      });

      // A speculative job prices the row without committing it. It deliberately
      // does not count towards `isLinked`: a row that is costed but still on Buy
      // is the whole point — it is what lets the panel offer the switch.
      const speculative = hasChildJobs
        ? null
        : (speculativeChildJobs?.[material.typeID] ?? null);

      const buyPrice = getMarketPriceForType(
        material.typeID,
        resolved.marketLocation,
        resolved.listingType,
      );

      const coverage = coverageFor({
        contributingJobs: speculative ? [speculative] : matchedChildJobs,
        quantity,
        buyPrice,
        temporaryChildJobs,
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
        rows,
        build,
        marketLocation,
        listingType,
        getPrice: getMarketPriceForType,
        groupPricing,
      }),
    };
  }, [
    build,
    setupToEdit,
    includedInGroup,
    displayType,
    listingType,
    checkTypeIDisExempt,
    automaticRecalculation,
    groupPricing,
    marketLocation,
    childJobEdits,
    speculativeChildJobs,
    temporaryChildJobs,
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
  temporaryChildJobs,
  resolved,
  isCommitted,
  automaticRecalculation,
}) {
  if (contributingJobs.length === 0) return null;

  const contributors = contributingJobs.map((job) => {
    const totals = calculateChildJobTotals(
      job,
      temporaryChildJobs,
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
 * which are different figures on a job with more than one setup. Neither is on
 * the material row: what a job takes is stated by its setups.
 *
 * @param {object} params
 * @param {object} params.setups - The job's setups
 * @param {object} [params.selectedSetup] - The setup being read
 * @param {number} params.typeID
 * @param {'all'|'active'} params.displayType
 * @returns {number}
 */
function quantityFor({ setups, selectedSetup, typeID, displayType }) {
  const wholeJob = materialRequirementOf(setups, typeID);
  if (displayType !== "active") return wholeJob;

  return selectedSetup?.materialCount?.[typeID]?.quantity ?? wholeJob;
}
