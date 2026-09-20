/**
 * The per-material pricing overrides a job's build holds, and the reads and
 * writes that keep the map well formed.
 * Keeps normalisation rules in one place to match how the Job persists them.
 */

export function getSafeMaterialPriceOverrides(build) {
  const raw = build?.materialPriceOverrides;
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

export function setMaterialOverrideMap(
  currentOverrides,
  materialTypeID,
  patch = {},
) {
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
