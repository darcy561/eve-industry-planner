import { useCachedData } from "./App/useCachedData";
import { CACHED_DATA_FILES } from "../Context/defaultValues";

const EMPTY_SYSTEMS = {};

/** Shown for a system id the table has no name for, and while the table is loading. */
export const UNKNOWN_SYSTEM_LABEL = "Unknown System";

/**
 * Every solar system the game has, keyed by id, each carrying its name and the
 * security band it is in.
 *
 * One entry for the whole table rather than one per system: a system's name and
 * band never change and the set is complete, so a caller reads the map and
 * indexes it. The per-id name cache is for places whose names have to be asked
 * for.
 *
 * @returns {Record<number, {name: string, security: string}>}
 */
export function useSolarSystems() {
  const { data } = useCachedData(CACHED_DATA_FILES.SOLAR_SYSTEMS);
  return data ?? EMPTY_SYSTEMS;
}

/**
 * One system's name, falling back to {@link UNKNOWN_SYSTEM_LABEL}.
 *
 * The fallback belongs here rather than at each call site: a system the table
 * cannot name reads the same wherever it is shown.
 *
 * @param {number} [systemID]
 * @returns {string}
 */
export function useSolarSystemName(systemID) {
  const systems = useSolarSystems();
  if (!systemID) return UNKNOWN_SYSTEM_LABEL;
  return systems[systemID]?.name ?? UNKNOWN_SYSTEM_LABEL;
}
