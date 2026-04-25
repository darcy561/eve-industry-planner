import { useMemo } from "react";
import { useEffectiveMarketHubFromLayout } from "../../../../../../../Hooks/Planner/useEffectiveMarketHubFromLayout.js";
import { calculateMaterialCostFromChildJobs } from "../../../../../../../Functions/Groups/materialCostFromChildJobs.js";
import findAllChildJobCountOrIDs from "../../../../../../../Functions/Shared/findAllChildJobCountOrIDs.js";
import {
  getEffectiveMaterialPriceHub,
  getMarketPriceForType,
} from "../marketPriceHelpers";
import { getSafeMaterialPriceOverrides } from "../Helpers/materialPriceOverridesState";
import { resolveMaterialChildJobs } from "../Helpers/materialChildJobs";

export function useMaterialPricingModel({ state, actions }) {
  const { activeJob } = state;
  const { layout } = activeJob;
  const { marketDisplay: marketSelect, orderDisplay: listingSelect } =
    useEffectiveMarketHubFromLayout(layout);

  return useMemo(() => {
    const materials = Array.isArray(activeJob.build.materials)
      ? activeJob.build.materials
      : [];
    const materialPriceOverrides = getSafeMaterialPriceOverrides(layout);
    const setupToEdit = layout.setupToEdit;
    const hasSetupToEdit = Boolean(activeJob.build.setup[setupToEdit]);
    const resolvedMaterials = materials.map((material) => {
      const { marketSelect: materialMarketSelect, listingSelect: materialListingSelect } =
        getEffectiveMaterialPriceHub(
          layout,
          material.typeID,
          marketSelect,
          listingSelect
        );
      return {
        material,
        marketSelect: materialMarketSelect,
        listingSelect: materialListingSelect,
      };
    });

    const totalInstallCosts = Object.values(activeJob.build.setup).reduce(
      (prev, setup) => prev + setup.estimatedInstallCost * setup.jobCount,
      0
    );
    const totalMaterialCost = resolvedMaterials.reduce(
      (prev, { material, marketSelect: materialMarketSelect, listingSelect: materialListingSelect }) => {
        const currentMaterialPrice = getMarketPriceForType(
          material.typeID,
          materialMarketSelect,
          materialListingSelect
        );
        return prev + currentMaterialPrice * material.quantity;
      },
      0
    );
    const totalBuildCost = resolvedMaterials.reduce(
      (prev, { material, marketSelect: materialMarketSelect, listingSelect: materialListingSelect }) => {
        const { childJobsById, childJobIDs } = resolveMaterialChildJobs({
          state,
          actions,
          materialTypeID: material.typeID,
        });
        return (
          prev +
          calculateMaterialCostFromChildJobs(
            material,
            childJobIDs,
            Array.from(childJobsById.values()),
            [],
            materialMarketSelect,
            materialListingSelect
          )
        );
      },
      0
    );

    const totalMarketPrice =
      getMarketPriceForType(activeJob.itemID, marketSelect, listingSelect) *
      activeJob.build.products.totalQuantity;
    const { childJobCount } = findAllChildJobCountOrIDs(
      activeJob.build.childJobs,
      state.temporaryChildJobs,
      state.parentChildToEdit.childJobs
    );
    const totalExtras = activeJob.build.costs.extrasTotal;
    const totalMarketCost = totalMaterialCost + totalInstallCosts + totalExtras;
    const totalChildJobCost = totalBuildCost + totalInstallCosts + totalExtras;

    return {
      activeJob,
      layout,
      marketSelect,
      listingSelect,
      materials,
      materialPriceOverrides,
      hasSetupToEdit,
      resolvedMaterials,
      totals: {
        childJobCount,
        totalBuildCost,
        totalInstallCosts,
        totalMarketPrice,
        totalMaterialCost,
        totalPriceMarketMode: totalMarketCost,
        totalPriceChildMode: totalChildJobCost,
      },
    };
  }, [actions, activeJob, layout, listingSelect, marketSelect, state.parentChildToEdit.childJobs, state.temporaryChildJobs]);
}
