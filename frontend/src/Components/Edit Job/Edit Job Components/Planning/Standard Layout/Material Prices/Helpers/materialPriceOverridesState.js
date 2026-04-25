/**
 * Shared material price override map logic (Material Prices panel + pricing model).
 * Keeps normalization rules in one place to match Job layout persistence.
 */

export function getSafeMaterialPriceOverrides(layout) {
  const raw = layout?.materialPriceOverrides;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

export function normalizeOverrideEntry(overrideEntry) {
  const normalized = {
    marketDisplay: overrideEntry?.marketDisplay ?? null,
    orderDisplay: overrideEntry?.orderDisplay ?? null,
  };

  return normalized.marketDisplay == null && normalized.orderDisplay == null
    ? null
    : normalized;
}

export function setMaterialOverrideMap(currentOverrides, materialTypeID, patch = {}) {
  const currentEntry = currentOverrides[materialTypeID] || {};
  const nextEntry = normalizeOverrideEntry({
    ...currentEntry,
    ...patch,
  });
  const nextOverrides = { ...currentOverrides };

  if (!nextEntry) {
    delete nextOverrides[materialTypeID];
  } else {
    nextOverrides[materialTypeID] = nextEntry;
  }

  return nextOverrides;
}
