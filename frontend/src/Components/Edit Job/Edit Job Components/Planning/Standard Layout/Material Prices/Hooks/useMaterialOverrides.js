import { useCallback } from "react";
import {
  getSafeMaterialPriceOverrides,
  setMaterialOverrideMap,
} from "../Helpers/materialPriceOverridesState";

/**
 * Layout preference updates for Material Prices (same pattern as updateActiveJob elsewhere).
 */
export function useMaterialOverrides({
  activeJob,
  layout,
  materials,
  updateActiveJob,
}) {
  const updateLayoutPreference = useCallback(
    (key, value) => {
      updateActiveJob({
        ...activeJob,
        layout: {
          ...layout,
          [key]: value,
        },
      });
    },
    [activeJob, layout, updateActiveJob]
  );

  const updateMaterialLayoutPreference = useCallback(
    (materialTypeID, key, value) => {
      const safe = getSafeMaterialPriceOverrides(layout);
      const nextOverrides = setMaterialOverrideMap(safe, materialTypeID, {
        [key]: value,
      });
      updateLayoutPreference("materialPriceOverrides", nextOverrides);
    },
    [layout, updateLayoutPreference]
  );

  const clearAllMaterialLayoutPreferences = useCallback(() => {
    updateLayoutPreference("materialPriceOverrides", {});
  }, [updateLayoutPreference]);

  const resetMaterialLayoutPreference = useCallback(
    (materialTypeID) => {
      const safe = getSafeMaterialPriceOverrides(layout);
      const nextOverrides = setMaterialOverrideMap(safe, materialTypeID, {
        marketDisplay: null,
        orderDisplay: null,
      });
      updateLayoutPreference("materialPriceOverrides", nextOverrides);
    },
    [layout, updateLayoutPreference]
  );

  const applyAllMaterialLayoutPreferences = useCallback(
    (key, value) => {
      const safe = getSafeMaterialPriceOverrides(layout);
      let nextOverrides = { ...safe };
      materials.forEach((material) => {
        nextOverrides = setMaterialOverrideMap(nextOverrides, material.typeID, {
          [key]: value ?? null,
        });
      });
      updateLayoutPreference("materialPriceOverrides", nextOverrides);
    },
    [layout, materials, updateLayoutPreference]
  );

  return {
    updateLayoutPreference,
    updateMaterialLayoutPreference,
    clearAllMaterialLayoutPreferences,
    resetMaterialLayoutPreference,
    applyAllMaterialLayoutPreferences,
  };
}
