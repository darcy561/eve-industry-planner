import { useMemo } from "react";

import { useMarketPricesQuery } from "../../../../../../Hooks/React Query/World/marketPrices";
import { pricesWantedBy } from "../../../../../../Functions/MarketData/prices/pricesWanted.js";

import { useEffectiveMarketHub } from "../../../../../../Hooks/Planner/useEffectiveMarketHub.js";
import { PRICING_SIDE } from "../../../../../../Functions/MarketData/defaults/pricingSide";
import { useMaterialGroupPricing } from "../../../../../../Hooks/Planner/useMaterialGroupPricing.js";
import {
  childJobCoverage,
  coverageModeFor,
} from "../../../../../../Functions/Groups/childJobCoverage";
import { calculateChildJobTotals } from "../../../../../../Functions/Groups/childJobTotals";
import checkJobTypeIsBuildable from "../../../../../../Functions/Helper/checkJobTypeIsBuildable.js";
import {
  getEffectiveMaterialPriceHub,
  materialCostByOrderType,
  priceAge,
  summariseOrderTypeUse,
} from "../../../../../../Functions/MarketData/defaults/materialPricing";
import {
  buildMaterialSourcingRow,
  summariseSourcing,
} from "../../../../../../Functions/Job/materialSourcingRow";
import {
  readMarketPriceForType,
  readPriceRefreshedAt,
} from "../../../../../../Functions/MarketData/prices/marketPriceForType.js";
import {
  resolveMaterialChildJobStatus,
  resolveMaterialChildJobs,
} from "./Helpers/materialChildJobs";
import { sourcingMark } from "./sourcingMark";
import useUsersStore from "../../../../../../Zustand/usersStore.js";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import {
  childJobIDsAfterEdits,
  materialRequirementOf,
  selectedSetupOf,
} from "../../../../Edit Job Hooks/jobSelectors";

/**
 * What Materials & Sourcing draws: a row per material, the figures the panel
 * states around them, and what each pricing order type would do to the total.
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
  const accountPricing = useUsersStore(
    (store) => store.applicationSettings.defaultPricing,
  );
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
  const { marketLocation, orderType, marketLocationRung, orderTypeRung } =
    useEffectiveMarketHub(build?.localPricing, PRICING_SIDE.BUYING);

  const groupPricing = useMaterialGroupPricing({
    side: PRICING_SIDE.BUYING,
    marketLocationRung,
    orderTypeRung,
  });

  const checkTypeIDisExempt = useUsersStore(
    (store) => store.applicationSettings.actions.checkTypeIDisExempt,
  );
  const automaticRecalculation = useUsersStore(
    (store) => store.applicationSettings.enableAutomaticJobRecalculation,
  );
  // The pairs these rows are read at, through the same resolution they are read
  // back with — so what is asked for and what is drawn cannot disagree.
  //
  // The materials and not the output: the job's own item is priced on the
  // selling side by Cost Breakdown, and nothing here draws it. Asking anyway
  // costs nothing while the two panels are mounted together and their wants
  // fold into one request, and starts fetching a price nobody reads the moment
  // they are not.
  const { wants, adjustedTypeIDs } = useMemo(
    () => pricesWantedBy({ build }, accountPricing),
    [build, accountPricing],
  );
  const { refreshTimes } = useMarketPricesQuery(wants, { adjustedTypeIDs });

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
        orderType,
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

      const buyPrice = readMarketPriceForType(
        material.typeID,
        resolved.marketLocation,
        resolved.orderType,
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
        mark: sourcingMark({
          jobType: material.jobType,
          hasLinked,
          hasPending: hasTemp || hasPendingAdd,
          isExempt: checkTypeIDisExempt(material.typeID),
        }),
        marketLocation: resolved.marketLocation,
        orderType: resolved.orderType,
      });
    });

    return {
      rows,
      summary: summariseSourcing(rows),
      marketLocation,
      orderType,
      orderTypeUsage: summariseOrderTypeUse(rows, marketLocation, orderType),
      priceAge: priceAge(materials, readPriceRefreshedAt),
      orderTypeOptions: materialCostByOrderType({
        rows,
        build,
        marketLocation,
        orderType,
        getPrice: readMarketPriceForType,
        groupPricing,
      }),
    };
    // `refreshTimes` is read by nothing in here on purpose. The prices are,
    // synchronously out of the cache, and this is what says they have moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    build,
    setupToEdit,
    includedInGroup,
    displayType,
    orderType,
    checkTypeIDisExempt,
    automaticRecalculation,
    groupPricing,
    marketLocation,
    childJobEdits,
    speculativeChildJobs,
    temporaryChildJobs,
    refreshTimes,
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
      resolved.orderType,
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
