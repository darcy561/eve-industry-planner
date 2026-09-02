import { useAccountTimelineQuery } from "../../Hooks/React Query/Backend/statisticsTimeline";

/** Stable between renders, so a caller's memo does not rerun while a read is in flight. */
const NO_MONTHS = [];

/**
 * A window as the statistics endpoints accept one. Both bounds travel together
 * or neither does: the API rejects half a range rather than filling one in.
 */
export function timelineWindow({ from, to, range } = {}) {
  if (range) return { range };
  return from && to ? { from, to } : {};
}

/**
 * The account's monthly figures for a window, and whether they are being rebuilt.
 *
 * No bounds asks the server for its own window — this month and the one before.
 * Chain output is left off unless asked for: those costs are counted again
 * through the parent job that consumed them, so a view summing across item types
 * would count twice.
 */
export function useArchiveTimeline(
  { from, to, range, typeID, includeProductionChain = false } = {},
  { enabled } = {},
) {
  const { data, isLoading, isError } = useAccountTimelineQuery(
    {
      ...timelineWindow({ from, to, range }),
      ...(typeID == null ? {} : { typeID }),
      ...(includeProductionChain ? { includeProductionChain: true } : {}),
    },
    { enabled },
  );

  return {
    data,
    months: data?.months ?? NO_MONTHS,
    recalculation: data?.recalculation,
    isLoading,
    isError,
  };
}
