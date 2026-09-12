import { LOCATION_OUTCOME } from "../Functions/EveESI/World/locationOutcome";

/**
 * Puts names into a query client as though they had already resolved.
 *
 * A name lives in one cache entry per id, so a test wanting a location already named seeds that
 * entry rather than a store: it is the same thing the loader would have written, and the hook reads
 * it without asking ESI.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {Object<string, string|Object>} entries - id to a name, or to a whole outcome for an id
 *   that settled without one
 */
export default function seedLocationNames(queryClient, entries) {
  for (const [id, entry] of Object.entries(entries)) {
    const locationId = Number(id);
    queryClient.setQueryData(
      ["esi", "name", locationId],
      typeof entry === "string"
        ? {
            id: locationId,
            name: entry,
            resolutionStatus: LOCATION_OUTCOME.NAMED,
          }
        : { id: locationId, ...entry },
    );
  }
}
