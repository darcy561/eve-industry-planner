import { useCallback } from "react";
import { setJobPricingSide } from "../../../../../../../Functions/MarketData/pricingSide.js";
import {
  getSafeMaterialPriceOverrides,
  setMaterialOverrideMap,
} from "../Helpers/materialPriceOverridesState";

/**
 * Writes a job's pricing decisions: the order type a row is priced on, and the
 * per-material overrides that depart from it.
 */
export function useMaterialOverrides({ build, materials, updatePricing }) {
  const updateBuildPricing = useCallback(
    (key, value) => {
      updatePricing({ [key]: value });
    },
    [updatePricing],
  );

  const updateJobPricing = useCallback(
    (side, key, value) =>
      updateBuildPricing(
        "localPricing",
        setJobPricingSide(build?.localPricing, side, key, value),
      ),
    [build?.localPricing, updateBuildPricing],
  );

  const updateMaterialPriceOverride = useCallback(
    (materialTypeID, key, value) => {
      const safe = getSafeMaterialPriceOverrides(build);
      const nextOverrides = setMaterialOverrideMap(safe, materialTypeID, {
        [key]: value,
      });
      updateBuildPricing("materialPriceOverrides", nextOverrides);
    },
    [build, updateBuildPricing],
  );

  const clearAllMaterialPriceOverrides = useCallback(() => {
    updateBuildPricing("materialPriceOverrides", {});
  }, [updateBuildPricing]);

  const resetMaterialPriceOverride = useCallback(
    (materialTypeID) => {
      const safe = getSafeMaterialPriceOverrides(build);
      const nextOverrides = setMaterialOverrideMap(safe, materialTypeID, {
        marketDisplay: null,
        orderDisplay: null,
      });
      updateBuildPricing("materialPriceOverrides", nextOverrides);
    },
    [build, updateBuildPricing],
  );

  const applyAllMaterialPriceOverrides = useCallback(
    (key, value) => {
      const safe = getSafeMaterialPriceOverrides(build);
      let nextOverrides = { ...safe };
      materials.forEach((material) => {
        nextOverrides = setMaterialOverrideMap(nextOverrides, material.typeID, {
          [key]: value ?? null,
        });
      });
      updateBuildPricing("materialPriceOverrides", nextOverrides);
    },
    [build, materials, updateBuildPricing],
  );

  return {
    updateJobPricing,
    updateMaterialPriceOverride,
    clearAllMaterialPriceOverrides,
    resetMaterialPriceOverride,
    applyAllMaterialPriceOverrides,
  };
}
